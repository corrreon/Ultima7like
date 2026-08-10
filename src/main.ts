import { GameClock } from './core/clock';
import { GameLoop } from './core/loop';
import { Rng } from './core/rng';
import { TILE_SIZE } from './core/constants';
import { Input } from './input/input';
import { Actor } from './objects/actor';
import { GameObject } from './objects/gameobject';
import { buildArt } from './render/art';
import { Renderer } from './render/renderer';
import { Ui, type ContainerWindow } from './render/ui';
import { ScheduleAI } from './sim/ai';
import { findPath } from './sim/pathfind';
import { ConversationState, getConversation } from './script/conversation';
import { use, type UsecodeContext } from './script/usecode';
import { buildTown } from './data/town';
import { populate } from './data/npcs';
import type { World } from './world/world';

/**
 * Assemblage du prototype.
 *
 * Le schema d'interaction reprend celui d'Ultima VII, reduit a deux gestes :
 *  - un clic simple deplace l'Avatar, ramasse un objet, ou repose l'objet tenu ;
 *  - un double-clic « utilise » : ouvrir une porte ou un coffre, manger, parler.
 * Tout le reste (inventaires imbriques, emplois du temps, jour et nuit) decoule
 * des systemes decrits dans docs/ARCHITECTURE.md.
 */

const INTERACT_RANGE = 3;

class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly ui = new Ui();
  private readonly input: Input;
  readonly clock = new GameClock(7, 30);
  private readonly rng = new Rng(20250810);
  readonly world: World;
  readonly avatar: Actor;
  private readonly ai: ScheduleAI;
  /** Drapeaux de conversation partages par tout le jeu. */
  private readonly flags = new Set<string>();
  private dragging: { window: ContainerWindow; dx: number; dy: number } | null = null;

  constructor(container: HTMLElement) {
    buildArt();

    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');

    this.renderer = new Renderer(ctx);
    this.input = new Input(this.canvas);

    this.world = buildTown();
    const population = populate(this.world);
    this.avatar = population.avatar;
    this.ai = new ScheduleAI(this.world, this.clock, this.rng);

    this.renderer.camera.x = this.avatar.px;
    this.renderer.camera.y = this.avatar.py;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.ui.addLog('Vous arrivez au bourg de Valmoret.');
    this.ui.addLog('Clic : marcher ou prendre · Double-clic : utiliser · I : sac');
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }

  private get usecodeContext(): UsecodeContext {
    return {
      world: this.world,
      actor: this.avatar,
      log: (text) => this.ui.addLog(text),
      openContainer: (obj) => this.ui.openContainer(obj, obj.name),
      startConversation: (npc) => this.startConversation(npc),
    };
  }

  // --- Simulation ---------------------------------------------------------

  update(dt: number): void {
    this.clock.advance(dt);
    this.ui.setMouse(this.input.mouseX, this.input.mouseY);

    this.handleKeys();
    this.handleClicks();
    this.handleDragging();
    this.moveAvatar(dt);

    for (const actor of this.world.actors) {
      if (actor === this.avatar) continue;
      this.ai.update(actor, dt);
    }

    this.renderer.camera.follow(this.avatar.px, this.avatar.py, dt);
    this.input.endFrame();
  }

  private handleKeys(): void {
    for (const code of this.input.pressed) {
      if (code === 'KeyI') {
        this.ui.openContainer(this.avatar, 'Sac de l\'Avatar');
      } else if (code === 'Escape') {
        this.ui.closeTop();
      }
    }
  }

  /** Deplacement clavier : prioritaire sur le chemin calcule au clic. */
  private moveAvatar(dt: number): void {
    const { dx, dy } = this.input.moveVector();

    if (dx !== 0 || dy !== 0) {
      this.avatar.path.length = 0;
      const speed = this.avatar.speed * (this.avatar.isOverloaded ? 0.5 : 1);
      // Test axe par axe : on glisse le long des murs au lieu de s'y coller.
      const nx = this.avatar.px + dx * speed * dt;
      const ny = this.avatar.py + dy * speed * dt;
      if (!this.world.isBlocked(Math.round(nx), Math.round(this.avatar.py))) this.avatar.px = nx;
      if (!this.world.isBlocked(Math.round(this.avatar.px), Math.round(ny))) this.avatar.py = ny;
      this.avatar.tx = Math.round(this.avatar.px);
      this.avatar.ty = Math.round(this.avatar.py);
      this.avatar.faceTowards(this.avatar.px + dx, this.avatar.py + dy);
      this.avatar.animPhase = (this.avatar.animPhase + dt * 6) % 2;
    } else {
      ScheduleAI.moveAlongPath(this.avatar, dt);
    }
  }

  // --- Interaction --------------------------------------------------------

  private handleClicks(): void {
    for (const click of this.input.clicks) {
      const hit = this.ui.hitTest(click.x, click.y);

      switch (hit.kind) {
        case 'close':
          this.ui.closeWindow(hit.window);
          continue;
        case 'title':
          this.ui.bringToFront(hit.window);
          this.dragging = {
            window: hit.window,
            dx: click.x - hit.window.x,
            dy: click.y - hit.window.y,
          };
          continue;
        case 'slot':
          this.handleSlotClick(hit.window, hit.item);
          continue;
        case 'topic':
          this.selectTopic(hit.topic.id);
          continue;
        default:
          break;
      }

      // Le clic porte sur le monde.
      const { tx, ty } = this.renderer.camera.screenToWorld(click.x, click.y);
      if (click.double) this.useAt(tx, ty);
      else this.clickWorld(tx, ty);
    }
  }

  private handleDragging(): void {
    if (!this.dragging) return;
    if (!this.input.mouseDown) {
      this.dragging = null;
      return;
    }
    this.dragging.window.x = this.input.mouseX - this.dragging.dx;
    this.dragging.window.y = this.input.mouseY - this.dragging.dy;
  }

  /** Clic simple sur le monde : reposer, ramasser, ou marcher. */
  private clickWorld(tx: number, ty: number): void {
    if (this.ui.held) {
      this.dropHeld(tx, ty);
      return;
    }

    const item = this.topTakeableAt(tx, ty);
    if (item && this.withinReach(tx, ty)) {
      this.world.removeObject(item);
      this.ui.held = item;
      this.ui.addLog(`Vous prenez : ${item.describe()}.`);
      return;
    }

    if (this.world.isBlocked(tx, ty)) {
      this.ui.addLog('Le passage est bloque.');
      return;
    }
    const path = findPath(
      this.world,
      { tx: Math.round(this.avatar.px), ty: Math.round(this.avatar.py) },
      { tx, ty },
      { actor: this.avatar },
    );
    if (path.length === 0) this.ui.addLog('Aucun chemin ne mene la-bas.');
    this.avatar.path = path;
  }

  /** Double-clic : utiliser l'objet ou aborder le personnage. */
  private useAt(tx: number, ty: number): void {
    if (!this.withinReach(tx, ty)) {
      this.ui.addLog('C\'est hors de portee.');
      return;
    }

    const npc = this.world.actorAt(tx, ty, this.avatar);
    if (npc) {
      this.startConversation(npc);
      return;
    }

    // Du plus haut au plus bas : on utilise ce qui est visuellement dessus.
    const objects = this.world
      .objectsAt(tx, ty)
      .filter((o) => !o.shape.roof)
      .sort((a, b) => b.tz - a.tz);

    for (const obj of objects) {
      if (use(obj, this.usecodeContext)) return;
    }
    this.ui.addLog('Rien a faire ici.');
  }

  private withinReach(tx: number, ty: number): boolean {
    return (
      Math.max(Math.abs(tx - this.avatar.px), Math.abs(ty - this.avatar.py)) <= INTERACT_RANGE
    );
  }

  private topTakeableAt(tx: number, ty: number): GameObject | null {
    const candidates = this.world.objectsAt(tx, ty).filter((o) => o.shape.takeable);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => b.tz - a.tz)[0]!;
  }

  private dropHeld(tx: number, ty: number): void {
    const held = this.ui.held!;
    if (!this.withinReach(tx, ty) || this.world.isBlocked(tx, ty)) {
      this.ui.addLog('Vous ne pouvez pas poser cela ici.');
      return;
    }
    held.detach();
    held.tx = tx;
    held.ty = ty;
    held.tz = 0;
    this.world.addObject(held);
    this.ui.addLog(`Vous posez : ${held.describe()}.`);
    this.ui.held = null;
  }

  /** Clic dans une fenetre : prendre, deposer, ou empiler. */
  private handleSlotClick(window: ContainerWindow, item: GameObject | null): void {
    const held = this.ui.held;

    if (held) {
      if (item && item.canStackWith(held)) {
        item.quantity += held.quantity;
        held.detach();
        this.ui.held = null;
        return;
      }
      if (window.owner === held || held.contains(window.owner)) {
        this.ui.addLog('Impossible : cela se contiendrait soi-meme.');
        return;
      }
      if (!window.owner.add(held)) {
        this.ui.addLog(`${window.owner.name} est plein.`);
        return;
      }
      this.ui.held = null;
      return;
    }

    if (!item) return;
    item.detach();
    this.ui.held = item;
  }

  // --- Dialogues ----------------------------------------------------------

  private startConversation(npc: Actor): void {
    if (!npc.conversationId) {
      npc.say('...', 2);
      return;
    }
    const def = getConversation(npc.conversationId);
    if (!def) {
      this.ui.addLog(`${npc.displayName} n'a rien a dire.`);
      return;
    }
    npc.activity = 'talk';
    npc.faceTowards(this.avatar.px, this.avatar.py);
    this.avatar.path.length = 0;
    this.avatar.faceTowards(npc.px, npc.py);
    this.ui.conversation = {
      npc,
      state: new ConversationState(def, this.flags),
      reply: def.greeting,
    };
  }

  private selectTopic(topicId: string): void {
    const conv = this.ui.conversation;
    if (!conv) return;

    const topic = conv.state.select(topicId);
    if (!topic) return;

    if (topic.ends) {
      conv.npc.say(conv.state.def.farewell, 3);
      conv.npc.activity = 'stand';
      conv.npc.thinkTimer = 0;
      this.ui.conversation = null;
      return;
    }

    conv.reply = topic.text;
    if (topic.effect) this.applyEffect(topic.effect, conv.npc);
  }

  /** Effets de jeu declenches par un sujet de conversation. */
  private applyEffect(effect: string, npc: Actor): void {
    if (effect === 'quete_luth') {
      this.ui.addLog(`${npc.displayName} vous promet une chanson si vous lui rapportez son luth.`);
      this.flags.add('quete_luth_active');
    }
  }

  // --- Rendu --------------------------------------------------------------

  render(): void {
    const ctx = this.canvas.getContext('2d')!;
    this.renderer.render(this.world, this.avatar, this.clock, this.canvas.width, this.canvas.height);
    this.ui.render(ctx, this.avatar, this.clock, this.canvas.width, this.canvas.height);
    this.drawCursorHint(ctx);
  }

  /** Surligne la tuile visee, comme le curseur contextuel du jeu d'origine. */
  private drawCursorHint(ctx: CanvasRenderingContext2D): void {
    if (this.ui.isOverUi(this.input.mouseX, this.input.mouseY)) return;
    const { tx, ty } = this.renderer.camera.screenToWorld(this.input.mouseX, this.input.mouseY);
    if (!this.world.inBounds(tx, ty)) return;

    const camera = this.renderer.camera;
    const { sx, sy } = camera.worldToScreen(tx, ty, 0);
    ctx.save();
    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, 0, 0);
    ctx.strokeStyle = this.withinReach(tx, ty) ? 'rgba(240, 226, 184, 0.55)' : 'rgba(240, 226, 184, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - TILE_SIZE + 0.5, sy - TILE_SIZE + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    ctx.restore();
  }
}

const container = document.getElementById('app');
if (!container) throw new Error('#app introuvable');

const game = new Game(container);
const loop = new GameLoop(
  (dt) => game.update(dt),
  () => game.render(),
);
loop.start();

// Poignee de debogage : indispensable pour inspecter la simulation depuis la
// console ou depuis un test de bout en bout (avancer l'horloge de douze heures
// pour verifier que le bourg se vide la nuit, par exemple).
(window as unknown as { u7: unknown }).u7 = { game, world: game.world, clock: game.clock, avatar: game.avatar };

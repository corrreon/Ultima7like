import { GameClock } from './core/clock';
import { GameLoop } from './core/loop';
import {
  clearStorage,
  mapSignature,
  readFromStorage,
  writeToStorage,
  type GameState,
} from './core/savegame';
import { Rng } from './core/rng';
import { TILE_SIZE } from './core/constants';
import { Input, type PointerDown } from './input/input';
import { TouchControls } from './input/touch';
import { Actor } from './objects/actor';
import { GameObject } from './objects/gameobject';
import { buildArt, getPortrait, getSprite, overridePortrait, overrideSprite } from './render/art';
import { loadSheets } from './render/atlas';
import { SHEETS } from './data/sheets';
import { Renderer } from './render/renderer';
import { Ui, type ContainerWindow } from './render/ui';
import { ScheduleAI } from './sim/ai';
import { findPath } from './sim/pathfind';
import { ConversationState, getConversation } from './script/conversation';
import { applyEffect, journal, refreshWorldFlags } from './script/quests';
import { CADENCE, PORTEE, cibleLaPlusProche, depouiller, distance, frapper } from './sim/combat';
import { accorderCombat, compagnons, congedier } from './sim/party';
import { MOTIFS, acheter, vendre } from './script/commerce';
import { use, type UsecodeContext } from './script/usecode';
import { LANDMARKS, buildTown } from './data/town';
import { populate } from './data/npcs';
import type { World } from './world/world';

/**
 * Assemblage du prototype.
 *
 * Le schema d'interaction reprend celui d'Ultima VII, reduit a deux gestes :
 *  - un appui simple deplace l'Avatar, ramasse un objet, ou repose l'objet tenu ;
 *  - un double appui « utilise » : ouvrir une porte ou un coffre, manger, parler.
 * Sur mobile s'y ajoutent un stick virtuel et un bouton « Agir » (voir
 * src/input/touch.ts), qui doublent ces gestes sans les remplacer.
 */

const INTERACT_RANGE = 3;

/** Nombre de tuiles visibles en largeur, selon la taille d'ecran. */
const TILES_WIDE_DESKTOP = 24;
const TILES_WIDE_PHONE = 13;

/** Intervalle de sauvegarde automatique, en secondes reelles. */
const AUTOSAVE_SECONDS = 30;

class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly ui = new Ui();
  private readonly touch = new TouchControls();
  private readonly input: Input;
  clock = new GameClock(7, 30);
  private readonly rng = new Rng(20250810);
  world: World;
  avatar: Actor;
  private ai: ScheduleAI;
  /**
   * Monde fige. Les commandes continuent d'etre lues : c'est la pause du
   * combat d'Ultima VII, faite pour reprendre la main, pas pour s'absenter.
   */
  private paused = false;
  /** Empreinte de la carte neuve, pour ne pas reprendre une partie perimee. */
  private readonly mapSignature: string;
  /** Drapeaux de conversation partages par tout le jeu. */
  private flags = new Set<string>();
  /** Secondes restantes avant la prochaine sauvegarde automatique. */
  private autosaveTimer = AUTOSAVE_SECONDS;
  private dragging: { window: ContainerWindow; pointer: number; dx: number; dy: number } | null = null;
  /**
   * Facteur d'echelle de l'interface. Elle est dessinee en points logiques
   * puis mise a l'echelle, sinon elle devient minuscule sur un ecran haute
   * densite et illisible sur un telephone.
   */
  private uiScale = 1;

  constructor(container: HTMLElement) {
    buildArt();

    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible');

    this.renderer = new Renderer(ctx);
    this.input = new Input(this.canvas);
    this.touch.enabled = this.input.coarse;

    // On genere la carte neuve d'abord, dans tous les cas. Elle sert de
    // reference pour l'empreinte, et de nouvelle partie si la reprise echoue :
    // une seule generation couvre les deux besoins.
    const neuf = buildTown();
    this.mapSignature = mapSignature(neuf);

    // Reprise de la partie precedente si elle existe. C'est ce qui rend la
    // sauvegarde utile sur telephone, ou il n'y a pas de touche a presser.
    const reprise = readFromStorage(this.mapSignature);
    const restored = reprise.kind === 'ok' ? reprise.state : null;
    if (restored) {
      this.world = restored.world;
      this.avatar = restored.avatar;
      this.clock = restored.clock;
      this.flags = restored.flags;
    } else {
      this.world = neuf;
      this.avatar = populate(this.world).avatar;
    }
    this.ai = this.makeAi();

    this.renderer.camera.x = this.avatar.px;
    this.renderer.camera.y = this.avatar.py;

    // Une partie perdue parce que l'onglet s'est ferme est une mauvaise
    // surprise evitable : on ecrit aussi au moment ou la page disparait.
    window.addEventListener('pagehide', () => this.save(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save(true);
    });

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());

    this.ui.addLog(
      restored ? 'Partie reprise.' : 'Vous arrivez au bourg de Valmoret.',
    );
    if (reprise.kind === 'perimee') {
      this.ui.addLog('La carte a change depuis votre derniere partie : elle repart a neuf.');
    } else if (reprise.kind === 'illisible') {
      this.ui.addLog('Sauvegarde illisible : la partie repart a neuf.');
    }

    this.ui.addLog(
      this.input.coarse
        ? 'Stick : marcher · Agir : utiliser · Notes : journal · Menu : sauver et recommencer'
        : 'Clic : marcher · Double-clic : utiliser · I : sac · J : journal · C : degainer · P : pause · M : menu',
    );

    // Les vrais dessins arrivent apres coup et remplacent les sprites
    // procéduraux au fil de leur chargement. Le jeu est deja jouable a cet
    // instant : rien ne bloque si une planche manque.
    void this.loadArtwork();
  }

  /** Charge les planches de dessins, sans bloquer le demarrage. */
  private async loadArtwork(): Promise<void> {
    if (SHEETS.length === 0) return;
    const replaced = await loadSheets(SHEETS, (loaded) => {
      if (loaded.portrait) overridePortrait(loaded.shape, loaded.sprite);
      else overrideSprite(loaded.shape, loaded.frame, loaded.sprite);
    });
    if (replaced > 0) this.ui.addLog(`${replaced} dessins charges.`);
  }

  // --- Sauvegarde ---------------------------------------------------------

  private get saveState(): GameState {
    return {
      world: this.world,
      avatar: this.avatar,
      clock: this.clock,
      flags: this.flags,
      mapSignature: this.mapSignature,
    };
  }

  /** `silent` : sauvegarde automatique, qui n'ecrit rien dans le journal. */
  private save(silent = false): void {
    const ok = writeToStorage(this.saveState);
    this.autosaveTimer = AUTOSAVE_SECONDS;
    if (silent) return;
    this.ui.addLog(ok ? 'Partie sauvegardee.' : 'Sauvegarde impossible (stockage refuse).');
  }

  /**
   * Recharge la derniere sauvegarde.
   *
   * Tout ce qui referencait l'ancien monde doit etre reconstruit : l'IA en
   * garde une reference, et les fenetres d'inventaire pointent vers des objets
   * qui n'existent plus.
   */
  private load(): void {
    const reprise = readFromStorage(this.mapSignature);
    if (reprise.kind !== 'ok') {
      this.ui.addLog(
        reprise.kind === 'perimee'
          ? 'Cette sauvegarde vient d\'une carte differente.'
          : reprise.kind === 'illisible'
            ? 'Sauvegarde illisible.'
            : 'Aucune sauvegarde.',
      );
      return;
    }
    const restored = reprise.state;
    this.world = restored.world;
    this.avatar = restored.avatar;
    this.clock = restored.clock;
    this.flags = restored.flags;
    this.ai = this.makeAi();

    this.ui.windows.length = 0;
    this.ui.conversation = null;
    this.ui.held = null;
    this.renderer.camera.x = this.avatar.px;
    this.renderer.camera.y = this.avatar.py;
    this.autosaveTimer = AUTOSAVE_SECONDS;
    this.ui.addLog('Partie chargee.');
  }

  /** Repart de zero, en effacant la sauvegarde. */
  private restart(): void {
    clearStorage();
    this.world = buildTown();
    this.avatar = populate(this.world).avatar;
    this.clock = new GameClock(7, 30);
    this.flags = new Set();
    this.ai = this.makeAi();

    this.ui.windows.length = 0;
    this.ui.conversation = null;
    this.ui.held = null;
    this.renderer.camera.x = this.avatar.px;
    this.renderer.camera.y = this.avatar.py;
    this.autosaveTimer = AUTOSAVE_SECONDS;
    this.ui.addLog('Nouvelle partie.');
  }

  /**
   * Recalcule tout ce qui depend de la taille de l'ecran : resolution du
   * canvas, zoom de la camera, echelle et disposition de l'interface.
   */
  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;
    this.canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssHeight * dpr));

    // Un telephone doit montrer moins de tuiles qu'un ecran de bureau, sinon
    // les sprites deviennent des confettis. Le zoom reste entier pour garder
    // le pixel art net.
    const narrow = cssWidth < 720;
    const targetTiles = narrow ? TILES_WIDE_PHONE : TILES_WIDE_DESKTOP;
    this.renderer.camera.zoom = Math.max(
      1,
      Math.min(8, Math.round(this.canvas.width / (targetTiles * TILE_SIZE))),
    );

    // L'interface est dessinee en points, puis mise a l'echelle. Sur un
    // appareil tactile on grossit un peu : une cible de moins de 9 mm se rate
    // systematiquement au doigt. Trop grossir est cependant contre-productif —
    // il reste alors si peu de points en largeur que fenetres et bandeaux
    // couvrent l'ecran.
    this.uiScale = dpr * (this.input.coarse ? 1.15 : 1);

    this.touch.layout(this.canvas.width / this.uiScale, this.canvas.height / this.uiScale);
    // Les commandes occupent le bas de l'ecran : le journal et les dialogues
    // doivent leur laisser la place.
    this.ui.bottomInset = this.touch.enabled ? Math.min(cssHeight * 0.22, 120) : 0;
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

  /** Convertit des pixels de rendu vers l'espace de l'interface. */
  private toUi(value: number): number {
    return value / this.uiScale;
  }

  // --- Simulation ---------------------------------------------------------

  update(dt: number): void {
    this.ui.setMouse(this.toUi(this.input.mouseX), this.toUi(this.input.mouseY));

    // Les commandes restent vivantes en pause : c'est tout l'interet de la
    // pause d'Ultima VII, reprendre la main sans que le monde avance.
    this.handleKeys();
    this.handlePointers();
    this.handleTouchButtons();
    if (this.paused) {
      this.input.endFrame();
      this.touch.endFrame();
      return;
    }

    this.clock.advance(dt);
    this.moveAvatar(dt);
    this.fightNearby(dt);

    for (const actor of this.world.actors) {
      if (actor === this.avatar) continue;
      this.ai.update(actor, dt);
    }

    refreshWorldFlags(this.avatar, this.world.actors, LANDMARKS.camp, this.flags);

    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) this.save(true);

    this.renderer.camera.follow(this.avatar.px, this.avatar.py, dt);
    this.input.endFrame();
    this.touch.endFrame();
  }

  private handleKeys(): void {
    for (const code of this.input.pressed) {
      if (code === 'KeyI') this.openBag();
      else if (code === 'KeyJ') this.toggleJournal();
      else if (code === 'KeyC') this.toggleCombat();
      else if (code === 'KeyP') this.togglePause();
      else if (code === 'KeyM') this.ui.menu = !this.ui.menu;
      else if (code === 'Escape') this.ui.closeTop();
      else if (code === 'KeyE' || code === 'Space') this.actNearby();
      else if (code === 'F5') this.save();
      else if (code === 'F9') this.load();
      else if (code === 'F8') this.restart();
    }
  }

  private openBag(): void {
    this.ui.openContainer(this.avatar, 'Sac de l\'Avatar');
  }

  private toggleJournal(): void {
    this.ui.journal = this.ui.journal ? null : journal(this.flags);
  }

  /**
   * L'IA est reconstruite a chaque chargement, le monde changeant d'identite.
   * Le raccord des coups doit suivre, sinon les combats redeviennent muets
   * apres un F9.
   */
  private makeAi(): ScheduleAI {
    const ai = new ScheduleAI(this.world, this.clock, this.rng);
    ai.onCoup = (attaquant, cible, coup) => this.onCoup(attaquant, cible, coup);
    // Le meneur suit l'Avatar d'une partie a l'autre : apres un chargement,
    // c'est un autre objet, et un groupe qui suivrait l'ancien resterait plante
    // sur place.
    ai.leader = this.avatar;
    return ai;
  }

  private toggleCombat(): void {
    this.avatar.inCombat = !this.avatar.inCombat;
    this.avatar.target = null;
    // Le groupe degaine avec le meneur. Un compagnon qui garderait l'arme au
    // fourreau pendant qu'on se bat serait au mieux inutile.
    accorderCombat(this.avatar, this.world.actors);
    this.ui.combat = this.avatar.inCombat;
    this.ui.addLog(this.avatar.inCombat ? 'Vous degainez.' : 'Vous rengainez.');
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.ui.paused = this.paused;
    this.ui.addLog(this.paused ? 'Pause.' : 'Reprise.');
  }

  /**
   * L'Avatar frappe ce qui est a portee, sans le poursuivre.
   *
   * Ultima VII fait courir l'Avatar sur sa cible tout seul ; ici c'est le
   * joueur qui approche. Un personnage qui charge de lui-meme prive de la
   * seule decision qui compte dans un combat en temps reel : rester ou fuir.
   */
  private fightNearby(dt: number): void {
    if (this.avatar.attackCooldown > 0) this.avatar.attackCooldown -= dt;
    if (!this.avatar.inCombat || this.avatar.attackCooldown > 0) return;

    const cible = cibleLaPlusProche(this.avatar, this.world.actors, PORTEE);
    if (!cible || distance(this.avatar, cible) > PORTEE) return;

    this.avatar.attackCooldown = CADENCE;
    this.avatar.faceTowards(cible.px, cible.py);
    this.onCoup(this.avatar, cible, frapper(this.avatar, cible, this.rng));
  }

  /**
   * Consequences visibles d'un coup.
   *
   * La resolution appartient a `sim/combat` ; il ne reste ici que ce qui se
   * voit — une replique, une ligne de journal, un corps qui laisse tomber ce
   * qu'il portait.
   */
  private onCoup(attaquant: Actor, cible: Actor, coup: ReturnType<typeof frapper>): void {
    const nom = attaquant === this.avatar ? 'Vous' : attaquant.displayName;
    if (!coup.touche) {
      if (attaquant === this.avatar || cible === this.avatar) {
        this.ui.addLog(`${nom} manque ${cible === this.avatar ? 'l\'Avatar' : cible.displayName}.`);
      }
      return;
    }

    cible.say(`-${coup.degats}`, 0.8);
    if (attaquant === this.avatar || cible === this.avatar) {
      this.ui.addLog(
        `${nom} touche ${cible === this.avatar ? 'l\'Avatar' : cible.displayName} — ${coup.degats} points.`,
      );
    }

    if (!coup.fatal) {
      // On rend les coups : etre frappe suffit a entrer en combat, sans quoi
      // un garde se laisserait tuer en patrouillant.
      cible.inCombat = true;
      if (!cible.target) cible.target = attaquant;
      return;
    }

    // Un compagnon qui tombe quitte le groupe avant tout le reste : sans quoi
    // les suivants garderaient sa place en formation et marcheraient en file
    // autour d'un absent.
    if (cible.inParty) congedier(cible);
    this.ui.addLog(`${cible.displayName} s'effondre.`);
    for (const objet of depouiller(cible)) this.world.addObject(objet);
    const index = this.world.actors.indexOf(cible);
    if (index >= 0) this.world.actors.splice(index, 1);
    if (this.avatar.target === cible) this.avatar.target = null;
    for (const actor of this.world.actors) if (actor.target === cible) actor.target = null;

    if (cible === this.avatar) {
      this.ui.addLog('Vous perdez connaissance. F9 pour reprendre, F8 pour recommencer.');
      this.paused = true;
      this.ui.paused = true;
    }
  }

  private handleTouchButtons(): void {
    for (const action of this.touch.triggered) {
      if (action === 'bag') this.openBag();
      else if (action === 'journal') this.toggleJournal();
      else if (action === 'combat') this.toggleCombat();
      else if (action === 'menu') this.ui.menu = !this.ui.menu;
      else if (action === 'close') this.ui.closeTop();
      else if (action === 'act') this.actNearby();
    }
  }

  /** Deplacement : stick virtuel ou clavier, prioritaires sur le chemin calcule. */
  private moveAvatar(dt: number): void {
    const keyboard = this.input.moveVector();
    const stick = this.touch.vector();
    const dx = keyboard.dx || stick.dx;
    const dy = keyboard.dy || stick.dy;

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

  /**
   * Routage des appuis : commandes tactiles, puis interface, puis monde.
   * L'ordre compte — un appui sur le stick ne doit jamais faire marcher
   * l'Avatar vers la tuile qui se trouve dessous.
   */
  private handlePointers(): void {
    for (const down of this.input.downs) {
      const ux = this.toUi(down.x);
      const uy = this.toUi(down.y);

      if (this.touch.onDown(down.id, ux, uy)) continue;
      if (this.handleUiPointer(down, ux, uy)) continue;

      const { tx, ty } = this.renderer.camera.screenToWorld(down.x, down.y);
      if (down.double) this.useAt(tx, ty);
      else this.clickWorld(tx, ty);
    }

    for (const move of this.input.moves) {
      const ux = this.toUi(move.x);
      const uy = this.toUi(move.y);
      this.touch.onMove(move.id, ux, uy);
      if (this.dragging?.pointer === move.id) {
        this.dragging.window.x = ux - this.dragging.dx;
        this.dragging.window.y = uy - this.dragging.dy;
      }
    }

    for (const id of this.input.ups) {
      this.touch.onUp(id);
      if (this.dragging?.pointer === id) this.dragging = null;
    }
  }

  /** Retourne true si l'appui a ete consomme par l'interface. */
  private handleUiPointer(down: PointerDown, ux: number, uy: number): boolean {
    const hit = this.ui.hitTest(ux, uy);
    switch (hit.kind) {
      case 'close':
        this.ui.closeWindow(hit.window);
        return true;
      case 'title':
        this.ui.bringToFront(hit.window);
        this.dragging = {
          window: hit.window,
          pointer: down.id,
          dx: ux - hit.window.x,
          dy: uy - hit.window.y,
        };
        return true;
      case 'slot':
        this.handleSlotClick(hit.window, hit.item);
        return true;
      case 'topic':
        this.selectTopic(hit.topic.id);
        return true;
      case 'trade':
        this.handleTrade(hit.item, hit.buy);
        return true;
      case 'menu':
        this.handleMenu(hit.action);
        return true;
      case 'modal':
        return true;
      default:
        return false;
    }
  }

  /**
   * Achat ou vente d'une ligne du panneau de commerce.
   *
   * Le module de commerce refuse en donnant sa raison plutot qu'en echouant en
   * silence : c'est cette raison que le joueur doit lire, pas un clic qui ne
   * fait rien.
   */
  private handleTrade(item: GameObject, buy: boolean): void {
    const trade = this.ui.trade;
    if (!trade) return;

    const resultat = buy
      ? acheter(trade.client, trade.marchand, item)
      : vendre(trade.client, trade.marchand, item);

    if (!resultat.ok) {
      this.ui.addLog(MOTIFS[resultat.raison]);
      return;
    }
    this.ui.addLog(
      buy
        ? `Vous achetez ${item.name} pour ${resultat.prix} pieces.`
        : `Vous vendez ${item.name} pour ${resultat.prix} pieces.`,
    );
  }

  private handleMenu(action: 'save' | 'load' | 'restart' | 'close'): void {
    this.ui.menu = false;
    if (action === 'save') this.save();
    else if (action === 'load') this.load();
    else if (action === 'restart') this.restart();
  }

  /** Appui simple sur le monde : reposer, ramasser, ou marcher. */
  private clickWorld(tx: number, ty: number): void {
    if (this.ui.held) {
      this.dropHeld(tx, ty);
      return;
    }

    const item = this.topTakeableAt(tx, ty);
    if (item && this.canInteract(tx, ty)) {
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

  /** Double appui : utiliser l'objet ou aborder le personnage. */
  private useAt(tx: number, ty: number): void {
    if (!this.withinReach(tx, ty)) {
      this.ui.addLog('C\'est hors de portee.');
      return;
    }
    if (!this.canInteract(tx, ty)) {
      this.ui.addLog('Quelque chose vous en separe.');
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

  /**
   * Agit sur l'element interactif le plus proche.
   *
   * C'est l'equivalent au doigt du double-clic : viser une porte de quelques
   * millimetres sur un telephone est penible, alors qu'il n'y a presque jamais
   * d'ambiguite sur ce que le joueur veut faire quand il est a cote.
   */
  private actNearby(): void {
    const ax = Math.round(this.avatar.px);
    const ay = Math.round(this.avatar.py);

    let bestNpc: Actor | null = null;
    let bestNpcDist = Infinity;
    for (const actor of this.world.actors) {
      if (actor === this.avatar || !actor.isAlive || !actor.conversationId) continue;
      const d = Math.max(Math.abs(actor.px - ax), Math.abs(actor.py - ay));
      if (d > INTERACT_RANGE || d >= bestNpcDist) continue;
      if (!this.canInteract(Math.round(actor.px), Math.round(actor.py))) continue;
      bestNpc = actor;
      bestNpcDist = d;
    }
    if (bestNpc) {
      this.startConversation(bestNpc);
      return;
    }

    // Les tuiles sont parcourues du plus proche au plus lointain.
    const offsets: Array<[number, number]> = [];
    for (let dy = -INTERACT_RANGE; dy <= INTERACT_RANGE; dy++) {
      for (let dx = -INTERACT_RANGE; dx <= INTERACT_RANGE; dx++) offsets.push([dx, dy]);
    }
    offsets.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));

    for (const [dx, dy] of offsets) {
      const tx = ax + dx;
      const ty = ay + dy;
      if (!this.world.inBounds(tx, ty)) continue;
      if (!this.canInteract(tx, ty)) continue;
      const objects = this.world
        .objectsAt(tx, ty)
        .filter((o) => !o.shape.roof)
        .sort((a, b) => b.tz - a.tz);
      for (const obj of objects) {
        const shape = obj.shape;
        // On ne declenche que ce qui a un effet visible : inutile de « manger »
        // le plancher parce qu'il etait la premiere tuile balayee.
        if (!shape.door && !shape.container && !shape.takeable && shape.id !== 'anvil') continue;
        if (use(obj, this.usecodeContext)) return;
      }
    }
    this.ui.addLog('Rien a portee.');
  }

  private withinReach(tx: number, ty: number): boolean {
    return (
      Math.max(Math.abs(tx - this.avatar.px), Math.abs(ty - this.avatar.py)) <= INTERACT_RANGE
    );
  }

  /**
   * A portee **et** visible. Sans le second critere on fouille les coffres a
   * travers les murs et on engage la conversation avec quelqu'un enferme dans
   * la piece d'a cote — ce qui arrive constamment, les batiments etant petits.
   */
  private canInteract(tx: number, ty: number): boolean {
    if (!this.withinReach(tx, ty)) return false;
    return this.world.hasLineOfSight(
      Math.round(this.avatar.px),
      Math.round(this.avatar.py),
      tx,
      ty,
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

  /** Appui dans une fenetre : prendre, deposer, ou empiler. */
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
      state: new ConversationState(def, this.flags, (shape) =>
        this.avatar.findDeep((o) => o.shapeId === shape) !== null,
      ),
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

  /**
   * Effets de jeu declenches par un sujet de conversation.
   *
   * La logique vit dans `script/quests`, sans dependance au rendu : c'est ce
   * qui permet de traverser une quete entiere dans un test, sans navigateur.
   */
  private applyEffect(effect: string, npc: Actor): void {
    const done = applyEffect(effect, {
      avatar: this.avatar,
      npc,
      flags: this.flags,
      log: (text) => this.ui.addLog(text),
      acteurs: this.world.actors,
      commercer: (marchand) => {
        // Le commerce remplace le panneau de dialogue : les deux se posent au
        // meme endroit de l'ecran, et on ne marchande pas en parlant.
        this.ui.conversation = null;
        this.ui.trade = { marchand, client: this.avatar };
      },
    });
    if (!done) this.ui.addLog('Rien ne se passe.');
    else if (this.ui.journal) this.ui.journal = journal(this.flags);
  }

  // --- Rendu --------------------------------------------------------------

  render(): void {
    const ctx = this.canvas.getContext('2d')!;
    this.renderer.render(this.world, this.avatar, this.clock, this.canvas.width, this.canvas.height);

    ctx.setTransform(this.uiScale, 0, 0, this.uiScale, 0, 0);
    this.ui.party = compagnons(this.world.actors);
    this.ui.render(
      ctx,
      this.avatar,
      this.clock,
      this.canvas.width / this.uiScale,
      this.canvas.height / this.uiScale,
    );
    this.touch.render(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    this.drawCursorHint(ctx);
  }

  /** Surligne la tuile visee. Sans survol, un curseur n'a pas de sens. */
  private drawCursorHint(ctx: CanvasRenderingContext2D): void {
    if (this.input.coarse) return;
    if (this.ui.isOverUi(this.toUi(this.input.mouseX), this.toUi(this.input.mouseY))) return;
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
//
// Les champs sont des accesseurs, pas des copies : charger une partie ou en
// demarrer une neuve remplace le monde, l'horloge et l'Avatar. Une poignee qui
// aurait fige les references d'origine pointerait alors vers un monde mort —
// et laisserait croire que le chargement n'a rien fait.
(window as unknown as { u7: unknown }).u7 = {
  game,
  // Acces aux sprites : c'est par la qu'on verifie qu'un personnage charge
  // depuis une planche a bien la taille et le cadrage attendus, sans avoir a
  // deduire des pixels d'une capture d'ecran.
  getSprite,
  getPortrait,
  // Le pathfinding, pour pouvoir demander « pourquoi ce PNJ ne bouge pas ? »
  // depuis l'exterieur. C'est une question a laquelle on ne peut pas repondre
  // en regardant l'ecran.
  findPath,
  get world() {
    return game.world;
  },
  get clock() {
    return game.clock;
  },
  get avatar() {
    return game.avatar;
  },
};

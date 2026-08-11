import type { GameClock } from '../core/clock';
import type { Actor } from '../objects/actor';
import type { GameObject } from '../objects/gameobject';
import { getPortrait, getSprite } from './art';
import type { ConversationState, Topic } from '../script/conversation';
import type { QuestEntry } from '../script/quests';

/**
 * Interface : fenetres de contenants, journal et dialogues.
 *
 * Ultima VII affiche l'inventaire sous forme de fenetres empilables que l'on
 * deplace et dans lesquelles on glisse les objets — un sac ouvert dans un
 * coffre ouvert dans une piece. On reproduit cette manipulation directe, avec
 * un objet « en main » qui suit le curseur, ce qui evite d'implementer un
 * glisser-deposer complet tout en gardant le meme ressenti.
 */

// Assez large pour afficher un sprite de 32 px a l'echelle 1:1. Reduire un
// dessin en pixel art d'un facteur non entier le rend mou — autant lui laisser
// la place.
const SLOT = 40;
const PADDING = 8;
const TITLE_H = 18;
const COLUMNS = 5;

export interface ContainerWindow {
  owner: GameObject;
  title: string;
  x: number;
  y: number;
  /** Rectangles des emplacements, recalcules a chaque rendu. */
  slots: Array<{ x: number; y: number; item: GameObject | null }>;
  width: number;
  height: number;
}

export type UiHit =
  | { kind: 'none' }
  | { kind: 'slot'; window: ContainerWindow; item: GameObject | null }
  | { kind: 'title'; window: ContainerWindow }
  | { kind: 'close'; window: ContainerWindow }
  | { kind: 'topic'; topic: Topic };

export class Ui {
  readonly windows: ContainerWindow[] = [];
  /** Objet actuellement « en main », suivant le curseur. */
  held: GameObject | null = null;
  /**
   * Hauteur reservee en bas de l'ecran par les commandes tactiles. Le journal
   * et le panneau de dialogue remontent d'autant, sinon le stick virtuel se
   * superpose exactement au texte.
   */
  bottomInset = 0;
  conversation: { npc: Actor; state: ConversationState; reply: string } | null = null;
  /** Journal de quetes ouvert. Ce qu'il montre est deduit des drapeaux. */
  journal: QuestEntry[] | null = null;
  /** L'Avatar a degaine. */
  combat = false;
  /** Le monde est fige. */
  paused = false;

  private readonly log: string[] = [];
  private topicRects: Array<{ x: number; y: number; w: number; h: number; topic: Topic }> = [];
  private mouseX = 0;
  private mouseY = 0;

  setMouse(x: number, y: number): void {
    this.mouseX = x;
    this.mouseY = y;
  }

  addLog(text: string): void {
    this.log.push(text);
    while (this.log.length > 5) this.log.shift();
  }

  openContainer(obj: GameObject, title: string): void {
    const existing = this.windows.find((w) => w.owner === obj);
    if (existing) {
      // Deja ouverte : on la ramene au premier plan.
      this.windows.splice(this.windows.indexOf(existing), 1);
      this.windows.push(existing);
      return;
    }
    const offset = this.windows.length * 24;
    this.windows.push({
      owner: obj,
      title,
      x: 60 + offset,
      y: 80 + offset,
      slots: [],
      width: 0,
      height: 0,
    });
  }

  closeWindow(window: ContainerWindow): void {
    const index = this.windows.indexOf(window);
    if (index >= 0) this.windows.splice(index, 1);
  }

  closeTop(): boolean {
    if (this.journal) {
      this.journal = null;
      return true;
    }
    if (this.conversation) {
      this.conversation = null;
      return true;
    }
    if (this.windows.length > 0) {
      this.windows.pop();
      return true;
    }
    return false;
  }

  isWindowOpen(obj: GameObject): boolean {
    return this.windows.some((w) => w.owner === obj);
  }

  // --- Rendu --------------------------------------------------------------

  /**
   * Dessine l'interface. `width` et `height` sont exprimes dans l'espace de
   * l'interface, pas en pixels de rendu : c'est l'appelant qui applique le
   * facteur d'echelle au contexte, de facon que les memes tailles en points
   * donnent une interface lisible aussi bien sur un ecran haute densite que
   * sur un telephone.
   */
  render(ctx: CanvasRenderingContext2D, avatar: Actor, clock: GameClock, width: number, height: number): void {
    ctx.imageSmoothingEnabled = false;
    ctx.font = '12px ui-monospace, monospace';
    ctx.textBaseline = 'alphabetic';

    this.drawStatus(ctx, avatar, clock, width);
    this.drawVitals(ctx, avatar, width, height);
    this.drawLog(ctx, width, height);
    for (const window of this.windows) this.drawWindow(ctx, window, width, height);
    if (this.conversation) this.drawConversation(ctx, width, height);
    if (this.journal) this.drawJournal(ctx, width, height);
    if (this.held) this.drawHeld(ctx);
  }

  /**
   * Bandeau d'etat. Sa largeur suit le texte plutot qu'une valeur fixe : un
   * encart de 202 points occupe un cinquieme d'un ecran de bureau mais les
   * deux tiers d'un telephone.
   */
  private drawStatus(ctx: CanvasRenderingContext2D, avatar: Actor, clock: GameClock, width: number): void {
    const narrow = width < 460;
    const time = clock.format();
    const weight = narrow
      ? `${(avatar.carriedWeight / 10).toFixed(1)} st`
      : `Charge : ${(avatar.carriedWeight / 10).toFixed(1)} stones`;

    ctx.font = `${narrow ? 10 : 12}px ui-monospace, monospace`;
    const lineHeight = narrow ? 13 : 16;
    const boxW = Math.min(
      Math.max(ctx.measureText(time).width, ctx.measureText(weight).width) + 20,
      width - 16,
    );
    const boxH = lineHeight * 2 + 12;
    const x = width - boxW - 8;

    ctx.fillStyle = 'rgba(12, 10, 8, 0.72)';
    ctx.fillRect(x, 8, boxW, boxH);
    ctx.strokeStyle = '#5c4a2c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, 8.5, boxW - 1, boxH - 1);

    ctx.fillStyle = '#e8dcc0';
    ctx.fillText(time, x + 10, 8 + lineHeight);
    ctx.fillStyle = avatar.isOverloaded ? '#d66655' : '#a89974';
    ctx.fillText(weight, x + 10, 8 + lineHeight * 2);
    ctx.font = '12px ui-monospace, monospace';
  }

  /**
   * Points de vie, et etat du combat.
   *
   * Une jauge plutot qu'un nombre : en combat temps reel on ne lit pas un
   * chiffre, on voit une barre baisser. Elle n'apparait qu'une fois entame ou
   * degaine, pour ne pas encombrer une promenade.
   */
  private drawVitals(ctx: CanvasRenderingContext2D, avatar: Actor, width: number, height: number): void {
    const blesse = avatar.hp < avatar.maxHp;
    if (!blesse && !this.combat && !this.paused) return;

    const w = Math.min(160, width - 16);
    const x = 8;
    const y = 8;

    if (blesse || this.combat) {
      ctx.fillStyle = 'rgba(12, 10, 8, 0.72)';
      ctx.fillRect(x, y, w, 14);
      const part = Math.max(0, avatar.hp / avatar.maxHp);
      ctx.fillStyle = part > 0.5 ? '#7a9a4a' : part > 0.25 ? '#c8a03a' : '#b03a30';
      ctx.fillRect(x + 2, y + 2, Math.round((w - 4) * part), 10);
      ctx.strokeStyle = '#5c4a2c';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 13);

      ctx.fillStyle = '#e8dcc0';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(`${avatar.hp} / ${avatar.maxHp}`, x + w + 8, y + 11);
      ctx.font = '12px ui-monospace, monospace';
    }

    if (this.combat) {
      ctx.fillStyle = '#d08a50';
      ctx.fillText('Arme au clair', x, y + 30);
    }
    if (this.paused) {
      // Au tiers superieur, et non au centre : l'Avatar est au centre, et une
      // pause qui masque le personnage cache justement ce qu'on veut regarder.
      const cx = Math.round(width / 2);
      const cy = Math.round(height / 3);
      const texte = '— PAUSE —';
      ctx.textAlign = 'center';
      const w2 = ctx.measureText(texte).width + 20;
      ctx.fillStyle = 'rgba(12, 10, 8, 0.78)';
      ctx.fillRect(cx - w2 / 2, cy - 14, w2, 20);
      ctx.fillStyle = '#e2c98a';
      ctx.fillText(texte, cx, cy);
      ctx.textAlign = 'left';
    }
  }

  /** Journal, replie sur la largeur disponible pour ne jamais deborder. */
  private drawLog(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const narrow = width < 460;
    ctx.font = `${narrow ? 10 : 12}px ui-monospace, monospace`;
    const lineHeight = narrow ? 13 : 16;
    const maxWidth = width - 28;

    const lines: string[] = [];
    for (const entry of this.log.slice(narrow ? -3 : -5)) {
      lines.push(...wrap(ctx, entry, maxWidth));
    }

    let y = height - lineHeight * lines.length - 24 - this.bottomInset;
    for (const line of lines) {
      ctx.fillStyle = 'rgba(12, 10, 8, 0.6)';
      ctx.fillRect(8, y - lineHeight + 4, ctx.measureText(line).width + 12, lineHeight);
      ctx.fillStyle = '#cbbb92';
      ctx.fillText(line, 14, y);
      y += lineHeight;
    }
    ctx.font = '12px ui-monospace, monospace';
  }

  private drawWindow(
    ctx: CanvasRenderingContext2D,
    window: ContainerWindow,
    viewWidth: number,
    viewHeight: number,
  ): void {
    const items = window.owner.contents;
    const rows = Math.max(2, Math.ceil((items.length + 1) / COLUMNS));
    window.width = COLUMNS * SLOT + PADDING * 2;
    window.height = TITLE_H + rows * SLOT + PADDING * 2;

    // Une fenetre ne doit jamais sortir de l'ecran : sur telephone, ou en
    // reduisant la fenetre du navigateur, elle deviendrait inatteignable.
    window.x = Math.max(4, Math.min(window.x, viewWidth - window.width - 4));
    window.y = Math.max(4, Math.min(window.y, viewHeight - window.height - 4));

    ctx.fillStyle = 'rgba(28, 22, 16, 0.94)';
    ctx.fillRect(window.x, window.y, window.width, window.height);
    carvedFrame(ctx, window.x, window.y, window.width, window.height);

    // Barre de titre
    ctx.fillStyle = '#3a2d1c';
    ctx.fillRect(window.x + 1, window.y + 1, window.width - 2, TITLE_H - 1);
    ctx.fillStyle = '#e8dcc0';
    ctx.fillText(window.title, window.x + 8, window.y + 13);
    ctx.fillStyle = '#c08a7a';
    ctx.fillText('x', window.x + window.width - 14, window.y + 13);

    // Emplacements
    window.slots = [];
    const total = rows * COLUMNS;
    for (let i = 0; i < total; i++) {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      const sx = window.x + PADDING + col * SLOT;
      const sy = window.y + TITLE_H + PADDING + row * SLOT;
      const item = items[i] ?? null;
      window.slots.push({ x: sx, y: sy, item });

      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(sx, sy, SLOT - 4, SLOT - 4);
      ctx.strokeStyle = '#4a3b24';
      ctx.strokeRect(sx + 0.5, sy + 0.5, SLOT - 5, SLOT - 5);

      if (item) {
        const sprite = getSprite(item.shapeId, item.frame);
        const scale = Math.min((SLOT - 8) / sprite.width, (SLOT - 8) / sprite.height, 2);
        const dw = Math.round(sprite.width * scale);
        const dh = Math.round(sprite.height * scale);
        ctx.drawImage(
          sprite.canvas,
          sx + Math.round((SLOT - 4 - dw) / 2),
          sy + Math.round((SLOT - 4 - dh) / 2),
          dw,
          dh,
        );
        if (item.quantity > 1) {
          ctx.font = '9px ui-monospace, monospace';
          ctx.fillStyle = '#f0e2b8';
          ctx.fillText(String(item.quantity), sx + 2, sy + SLOT - 8);
          ctx.font = '12px ui-monospace, monospace';
        }
      }
    }

    // Poids porte, en bas de fenetre
    ctx.fillStyle = '#8d7d5c';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(
      `${(window.owner.totalWeight / 10).toFixed(1)} st`,
      window.x + 8,
      window.y + window.height - 4,
    );
    ctx.font = '12px ui-monospace, monospace';
  }

  /**
   * Panneau de dialogue, avec portrait.
   *
   * Dans Ultima VII le portrait fait la moitie de la presence d'un
   * personnage : sans lui, une conversation n'est qu'un pave de texte. Il est
   * donc dessine en grand a gauche, et le texte se decale d'autant.
   */
  private drawConversation(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const conv = this.conversation!;
    const narrow = width < 460;
    const panelH = 176;
    const y = height - panelH - 8 - this.bottomInset;
    const x = 24;
    const w = Math.min(width - 48, 620);

    ctx.fillStyle = 'rgba(20, 16, 11, 0.96)';
    ctx.fillRect(x, y, w, panelH);
    carvedFrame(ctx, x, y, w, panelH);

    // Portrait, mis a l'echelle en entier pour rester net.
    const portrait = getPortrait(conv.npc.shapeId);
    let textX = x + 14;
    if (portrait && !narrow) {
      const scale = 2;
      const pw = portrait.width * scale;
      const ph = portrait.height * scale;
      ctx.drawImage(portrait.canvas, x + 12, y + 14, pw, ph);
      carvedFrame(ctx, x + 12, y + 14, pw, ph);
      textX = x + 12 + pw + 14;
    }

    ctx.fillStyle = '#e2c98a';
    ctx.fillText(conv.npc.displayName, textX, y + 24);

    ctx.fillStyle = '#ddd0b0';
    const textWidth = x + w - textX - 14;
    const lines = wrap(ctx, conv.reply, textWidth);
    let ly = y + 46;
    for (const line of lines.slice(0, 4)) {
      ctx.fillText(line, textX, ly);
      ly += 16;
    }

    // Sujets cliquables
    this.topicRects = [];
    const topics = conv.state.visibleTopics();
    let ty = y + 118;
    let tx = textX;
    ctx.font = '12px ui-monospace, monospace';
    for (const topic of topics) {
      const label = `· ${topic.label}`;
      const tw = ctx.measureText(label).width + 14;
      if (tx + tw > x + w - 14) {
        tx = textX;
        ty += 20;
      }
      const hovered =
        this.mouseX >= tx && this.mouseX <= tx + tw && this.mouseY >= ty - 12 && this.mouseY <= ty + 5;
      ctx.fillStyle = hovered ? '#3a2f1d' : 'rgba(0,0,0,0)';
      ctx.fillRect(tx - 4, ty - 12, tw, 18);
      ctx.fillStyle = hovered ? '#f4e3ac' : '#b9a878';
      ctx.fillText(label, tx, ty);
      this.topicRects.push({ x: tx - 4, y: ty - 12, w: tw, h: 18, topic });
      tx += tw + 8;
    }
  }

  /**
   * Journal de quetes.
   *
   * Les etapes franchies restent lisibles, barrees d'une puce pleine ; la
   * prochaine est mise en avant. Un journal qui n'afficherait que l'objectif
   * courant obligerait a se souvenir du chemin parcouru, ce qui est
   * exactement ce qu'un journal doit eviter.
   */
  private drawJournal(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const entries = this.journal!;
    const w = Math.min(width - 48, 520);
    const x = Math.round((width - w) / 2);
    const lineHeight = 16;

    // On compose d'abord, on dessine ensuite : la hauteur du panneau depend du
    // repliage du texte, qui depend de la largeur.
    const lines: Array<{ text: string; kind: 'titre' | 'faite' | 'suite' | 'vide' }> = [];
    if (entries.length === 0) {
      lines.push({ text: 'Rien a noter pour l\'instant.', kind: 'vide' });
    }
    for (const entry of entries) {
      lines.push({
        text: entry.done ? `${entry.def.title} — acheve` : entry.def.title,
        kind: 'titre',
      });
      for (const step of entry.steps) {
        for (const line of wrap(ctx, '• ' + step.text, w - 40)) lines.push({ text: line, kind: 'faite' });
      }
      if (entry.next) {
        for (const line of wrap(ctx, '→ ' + entry.next.text, w - 40)) {
          lines.push({ text: line, kind: 'suite' });
        }
      }
    }

    // 46 pour le titre, la hauteur des lignes, puis 26 pour la mention de
    // fermeture : sans cette reserve la derniere etape se dessine dessus.
    const panelH = 46 + lineHeight * lines.length + 26;
    const y = Math.max(8, Math.round((height - panelH) / 2) - this.bottomInset);

    ctx.fillStyle = 'rgba(20, 16, 11, 0.96)';
    ctx.fillRect(x, y, w, panelH);
    carvedFrame(ctx, x, y, w, panelH);

    ctx.fillStyle = '#e2c98a';
    ctx.fillText('Journal', x + 16, y + 24);

    let ty = y + 46;
    for (const line of lines) {
      ctx.fillStyle =
        line.kind === 'titre' ? '#e2c98a' : line.kind === 'suite' ? '#ddd0b0' : '#8f8064';
      ctx.fillText(line.text, x + (line.kind === 'titre' ? 16 : 26), ty);
      ty += lineHeight;
    }

    ctx.fillStyle = '#7a6a48';
    ctx.fillText('J ou Echap : fermer', x + 16, y + panelH - 12);
  }

  private drawHeld(ctx: CanvasRenderingContext2D): void {
    const item = this.held!;
    const sprite = getSprite(item.shapeId, item.frame);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(
      sprite.canvas,
      Math.round(this.mouseX - sprite.width),
      Math.round(this.mouseY - sprite.height),
      sprite.width * 2,
      sprite.height * 2,
    );
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f0e2b8';
    ctx.fillText(item.describe(), this.mouseX + 12, this.mouseY + 6);
  }

  // --- Interaction --------------------------------------------------------

  /** Determine ce qui se trouve sous un point de l'ecran. */
  hitTest(x: number, y: number): UiHit {
    if (this.conversation) {
      for (const rect of this.topicRects) {
        if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) {
          return { kind: 'topic', topic: rect.topic };
        }
      }
    }

    // De la fenetre la plus haute vers la plus basse.
    for (let i = this.windows.length - 1; i >= 0; i--) {
      const window = this.windows[i]!;
      if (x < window.x || x > window.x + window.width) continue;
      if (y < window.y || y > window.y + window.height) continue;

      if (y <= window.y + TITLE_H) {
        if (x >= window.x + window.width - 20) return { kind: 'close', window };
        return { kind: 'title', window };
      }
      for (const slot of window.slots) {
        if (x >= slot.x && x <= slot.x + SLOT - 4 && y >= slot.y && y <= slot.y + SLOT - 4) {
          return { kind: 'slot', window, item: slot.item };
        }
      }
      return { kind: 'title', window }; // clic dans le vide de la fenetre
    }

    return { kind: 'none' };
  }

  /** Vrai si le point est au-dessus d'un element d'interface (donc pas du monde). */
  isOverUi(x: number, y: number): boolean {
    return this.hitTest(x, y).kind !== 'none';
  }

  bringToFront(window: ContainerWindow): void {
    const index = this.windows.indexOf(window);
    if (index >= 0) {
      this.windows.splice(index, 1);
      this.windows.push(window);
    }
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}


/**
 * Cadre « sculpte ».
 *
 * Un simple rectangle d'un pixel fait interface de debogage. Un liseré clair
 * en haut a gauche, sombre en bas a droite, et quatre rivets d'angle suffisent
 * a evoquer un panneau de bois cercle de metal — c'est la meme regle de
 * lumiere que pour les sprites, appliquee a l'interface.
 */
function carvedFrame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#8a6f42';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = '#c2a86e';
  ctx.beginPath();
  ctx.moveTo(x + 1.5, y + h - 2.5);
  ctx.lineTo(x + 1.5, y + 1.5);
  ctx.lineTo(x + w - 2.5, y + 1.5);
  ctx.stroke();
  ctx.strokeStyle = '#3a2d1c';
  ctx.beginPath();
  ctx.moveTo(x + w - 1.5, y + 2.5);
  ctx.lineTo(x + w - 1.5, y + h - 1.5);
  ctx.lineTo(x + 2.5, y + h - 1.5);
  ctx.stroke();
  ctx.fillStyle = '#c2a86e';
  for (const [cx, cy] of [
    [x + 3, y + 3],
    [x + w - 5, y + 3],
    [x + 3, y + h - 5],
    [x + w - 5, y + h - 5],
  ] as Array<[number, number]>) {
    ctx.fillRect(cx, cy, 2, 2);
  }
  ctx.restore();
}

import type { GameClock } from '../core/clock';
import type { Actor } from '../objects/actor';
import type { GameObject } from '../objects/gameobject';
import { getSprite } from './art';
import type { ConversationState, Topic } from '../script/conversation';

/**
 * Interface : fenetres de contenants, journal et dialogues.
 *
 * Ultima VII affiche l'inventaire sous forme de fenetres empilables que l'on
 * deplace et dans lesquelles on glisse les objets — un sac ouvert dans un
 * coffre ouvert dans une piece. On reproduit cette manipulation directe, avec
 * un objet « en main » qui suit le curseur, ce qui evite d'implementer un
 * glisser-deposer complet tout en gardant le meme ressenti.
 */

const SLOT = 34;
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
  conversation: { npc: Actor; state: ConversationState; reply: string } | null = null;

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

  render(ctx: CanvasRenderingContext2D, avatar: Actor, clock: GameClock, width: number, height: number): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.font = '12px ui-monospace, monospace';
    ctx.textBaseline = 'alphabetic';

    this.drawStatus(ctx, avatar, clock, width);
    this.drawLog(ctx, height);
    for (const window of this.windows) this.drawWindow(ctx, window);
    if (this.conversation) this.drawConversation(ctx, width, height);
    if (this.held) this.drawHeld(ctx);
  }

  private drawStatus(ctx: CanvasRenderingContext2D, avatar: Actor, clock: GameClock, width: number): void {
    const text = clock.format();
    const weight = `${(avatar.carriedWeight / 10).toFixed(1)} stones`;
    ctx.fillStyle = 'rgba(12, 10, 8, 0.72)';
    ctx.fillRect(width - 210, 8, 202, 42);
    ctx.strokeStyle = '#5c4a2c';
    ctx.strokeRect(width - 210.5, 8.5, 201, 41);
    ctx.fillStyle = '#e8dcc0';
    ctx.fillText(text, width - 200, 26);
    ctx.fillStyle = avatar.isOverloaded ? '#d66655' : '#a89974';
    ctx.fillText(`Charge : ${weight}`, width - 200, 42);
  }

  private drawLog(ctx: CanvasRenderingContext2D, height: number): void {
    ctx.fillStyle = '#cbbb92';
    let y = height - 84;
    for (const line of this.log) {
      ctx.fillStyle = 'rgba(12, 10, 8, 0.6)';
      const w = ctx.measureText(line).width + 12;
      ctx.fillRect(8, y - 12, w, 16);
      ctx.fillStyle = '#cbbb92';
      ctx.fillText(line, 14, y);
      y += 16;
    }
  }

  private drawWindow(ctx: CanvasRenderingContext2D, window: ContainerWindow): void {
    const items = window.owner.contents;
    const rows = Math.max(2, Math.ceil((items.length + 1) / COLUMNS));
    window.width = COLUMNS * SLOT + PADDING * 2;
    window.height = TITLE_H + rows * SLOT + PADDING * 2;

    ctx.fillStyle = 'rgba(28, 22, 16, 0.94)';
    ctx.fillRect(window.x, window.y, window.width, window.height);
    ctx.strokeStyle = '#6d5734';
    ctx.lineWidth = 1;
    ctx.strokeRect(window.x + 0.5, window.y + 0.5, window.width - 1, window.height - 1);

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

  private drawConversation(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const conv = this.conversation!;
    const panelH = 168;
    const y = height - panelH - 8;
    const x = 24;
    const w = Math.min(width - 48, 620);

    ctx.fillStyle = 'rgba(20, 16, 11, 0.95)';
    ctx.fillRect(x, y, w, panelH);
    ctx.strokeStyle = '#6d5734';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, panelH - 1);

    ctx.fillStyle = '#e2c98a';
    ctx.fillText(conv.npc.displayName, x + 14, y + 20);

    ctx.fillStyle = '#ddd0b0';
    const lines = wrap(ctx, conv.reply, w - 28);
    let ly = y + 42;
    for (const line of lines.slice(0, 4)) {
      ctx.fillText(line, x + 14, ly);
      ly += 16;
    }

    // Sujets cliquables
    this.topicRects = [];
    const topics = conv.state.visibleTopics();
    let ty = y + 108;
    let tx = x + 14;
    ctx.font = '12px ui-monospace, monospace';
    for (const topic of topics) {
      const label = `· ${topic.label}`;
      const tw = ctx.measureText(label).width + 14;
      if (tx + tw > x + w - 14) {
        tx = x + 14;
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

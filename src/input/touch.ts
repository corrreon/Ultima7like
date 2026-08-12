/**
 * Commandes tactiles : stick virtuel et boutons d'action.
 *
 * Sur telephone, deux gestes d'Ultima VII passent mal tels quels. Viser une
 * tuile de quelques millimetres pour marcher est penible, et le double-tap sur
 * une porte demande une precision que le doigt n'a pas. D'ou ce complement :
 *
 *  - un **stick virtuel** en bas a gauche pour la marche continue, plus sur que
 *    le clic-a-destination ;
 *  - un bouton **Agir** qui applique l'action a l'element interactif le plus
 *    proche, ce qui remplace le double-tap dans la plupart des cas ;
 *  - **Sac** et **Fermer**, equivalents des touches I et Echap.
 *
 * Le tap simple et le double-tap restent disponibles : les commandes ne
 * remplacent pas la manipulation directe, elles la doublent.
 *
 * Toutes les coordonnees sont exprimees dans l'espace de l'interface (pixels
 * de rendu divises par le facteur d'echelle), le meme que celui des fenetres
 * d'inventaire.
 */

export type TouchAction = 'act' | 'bag' | 'journal' | 'combat' | 'menu' | 'close';

interface Button {
  id: TouchAction;
  label: string;
  x: number;
  y: number;
  radius: number;
}

const DEAD_ZONE = 0.22;

export class TouchControls {
  /** Active uniquement sur les appareils tactiles. */
  enabled = false;

  /** Boutons declenches pendant la frame, consommes par la boucle de jeu. */
  readonly triggered: TouchAction[] = [];

  private buttons: Button[] = [];
  private stickCenter = { x: 0, y: 0 };
  private stickRadius = 56;
  private stickKnob = { x: 0, y: 0 };
  private stickPointer: number | null = null;
  private pressedButton: { id: TouchAction; pointer: number } | null = null;

  /** Recalcule la position des commandes pour la taille d'ecran courante. */
  layout(width: number, height: number): void {
    const margin = 26;
    this.stickRadius = Math.min(58, Math.max(42, Math.min(width, height) * 0.16));
    this.stickCenter = {
      x: margin + this.stickRadius,
      y: height - margin - this.stickRadius,
    };
    if (this.stickPointer === null) this.stickKnob = { ...this.stickCenter };

    const r = Math.min(34, Math.max(26, this.stickRadius * 0.56));
    const bx = width - margin - r;
    const by = height - margin - r;
    const gap = r * 2 + 14;
    this.buttons = [
      { id: 'act', label: 'Agir', x: bx, y: by, radius: r },
      { id: 'bag', label: 'Sac', x: bx, y: by - gap, radius: r },
      { id: 'close', label: 'Fermer', x: bx - gap, y: by, radius: r },
      { id: 'journal', label: 'Notes', x: bx - gap, y: by - gap, radius: r },
      // La pause reste au clavier : un monde fige avec un stick virtuel sous
      // le pouce n'a pas de sens, alors que degainer est indispensable pour
      // que le combat soit jouable au doigt.
      { id: 'combat', label: 'Armes', x: bx, y: by - gap * 2, radius: r },
      // Sans lui, une partie bloquee l'est definitivement au doigt : il n'y a
      // pas de F5, F9 ni F8 sur un telephone.
      { id: 'menu', label: 'Menu', x: bx - gap, y: by - gap * 2, radius: r },
    ];
  }

  /**
   * Traite un appui. Retourne true si la commande le consomme, auquel cas la
   * boucle de jeu ne doit pas l'interpreter comme un clic sur le monde.
   */
  onDown(id: number, x: number, y: number): boolean {
    if (!this.enabled) return false;

    for (const button of this.buttons) {
      if (dist(x, y, button.x, button.y) <= button.radius * 1.15) {
        this.pressedButton = { id: button.id, pointer: id };
        this.triggered.push(button.id);
        return true;
      }
    }

    // Zone d'accroche du stick volontairement plus large que son dessin :
    // on rate rarement un pouce de 20 mm, mais on rate souvent un cercle.
    if (dist(x, y, this.stickCenter.x, this.stickCenter.y) <= this.stickRadius * 1.6) {
      this.stickPointer = id;
      this.updateKnob(x, y);
      return true;
    }

    return false;
  }

  onMove(id: number, x: number, y: number): void {
    if (this.stickPointer === id) this.updateKnob(x, y);
  }

  onUp(id: number): void {
    if (this.stickPointer === id) {
      this.stickPointer = null;
      this.stickKnob = { ...this.stickCenter };
    }
    if (this.pressedButton?.pointer === id) this.pressedButton = null;
  }

  private updateKnob(x: number, y: number): void {
    const dx = x - this.stickCenter.x;
    const dy = y - this.stickCenter.y;
    const length = Math.hypot(dx, dy);
    if (length <= this.stickRadius) {
      this.stickKnob = { x, y };
    } else {
      this.stickKnob = {
        x: this.stickCenter.x + (dx / length) * this.stickRadius,
        y: this.stickCenter.y + (dy / length) * this.stickRadius,
      };
    }
  }

  /** Direction demandee, normalisee, ou zero au repos. */
  vector(): { dx: number; dy: number } {
    if (!this.enabled || this.stickPointer === null) return { dx: 0, dy: 0 };
    const dx = (this.stickKnob.x - this.stickCenter.x) / this.stickRadius;
    const dy = (this.stickKnob.y - this.stickCenter.y) / this.stickRadius;
    const length = Math.hypot(dx, dy);
    if (length < DEAD_ZONE) return { dx: 0, dy: 0 };
    // Au-dela de la zone morte, on repasse a pleine vitesse : un deplacement
    // en tuiles n'a pas besoin de nuances analogiques.
    return { dx: dx / length, dy: dy / length };
  }

  /** Le point est-il sur une commande ? Sert a ne pas viser le monde a travers. */
  hits(x: number, y: number): boolean {
    if (!this.enabled) return false;
    if (dist(x, y, this.stickCenter.x, this.stickCenter.y) <= this.stickRadius * 1.6) return true;
    return this.buttons.some((b) => dist(x, y, b.x, b.y) <= b.radius * 1.15);
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.enabled) return;

    // Stick
    circle(ctx, this.stickCenter.x, this.stickCenter.y, this.stickRadius, 'rgba(20, 16, 11, 0.35)');
    ring(ctx, this.stickCenter.x, this.stickCenter.y, this.stickRadius, 'rgba(232, 220, 192, 0.28)');
    const knobActive = this.stickPointer !== null;
    circle(
      ctx,
      this.stickKnob.x,
      this.stickKnob.y,
      this.stickRadius * 0.42,
      knobActive ? 'rgba(232, 220, 192, 0.55)' : 'rgba(232, 220, 192, 0.32)',
    );

    // Boutons
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const button of this.buttons) {
      const held = this.pressedButton?.id === button.id;
      circle(ctx, button.x, button.y, button.radius, held ? 'rgba(90, 72, 44, 0.75)' : 'rgba(20, 16, 11, 0.5)');
      ring(ctx, button.x, button.y, button.radius, 'rgba(232, 220, 192, 0.35)');
      ctx.fillStyle = held ? '#f4e3ac' : '#d8c9a3';
      ctx.font = `${Math.round(button.radius * 0.42)}px ui-monospace, monospace`;
      ctx.fillText(button.label, button.x, button.y);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  endFrame(): void {
    this.triggered.length = 0;
  }
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stroke: string): void {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

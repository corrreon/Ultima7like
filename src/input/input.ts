/**
 * Entrees clavier, souris et tactile.
 *
 * Tout passe par les Pointer Events, qui unifient souris, doigt et stylet :
 * une seule implementation couvre le bureau et le mobile. Les evenements sont
 * mis en file et consommes une fois par frame par la boucle de jeu, qui decide
 * qui les recoit (les commandes tactiles d'abord, le monde ensuite).
 *
 * Les coordonnees exposees sont en **pixels de rendu** (ceux du canvas), pas en
 * pixels CSS : c'est ce dont la camera a besoin. La conversion vers l'espace de
 * l'interface se fait chez l'appelant, qui connait son facteur d'echelle.
 */

export interface PointerDown {
  id: number;
  x: number;
  y: number;
  /** Deuxieme appui rapproche : equivalent du double-clic d'Ultima VII. */
  double: boolean;
}

export interface PointerMove {
  id: number;
  x: number;
  y: number;
}

export class Input {
  private readonly keys = new Set<string>();
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;

  /** Pointeurs actuellement appuyes, par identifiant. */
  readonly active = new Map<number, { x: number; y: number }>();

  /** Files d'evenements de la frame en cours. */
  readonly downs: PointerDown[] = [];
  readonly moves: PointerMove[] = [];
  readonly ups: number[] = [];
  readonly pressed: string[] = [];

  /** Derniere position connue du pointeur, en pixels de rendu. */
  mouseX = 0;
  mouseY = 0;

  /** Vrai sur un appareil sans survol : telephone, tablette. */
  readonly coarse: boolean;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.coarse =
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // --- Clavier ------------------------------------------------------------

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.keys.has(event.code)) this.pressed.push(event.code);
    this.keys.add(event.code);
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  // --- Pointeurs ----------------------------------------------------------

  /** Convertit des coordonnees client en pixels de rendu du canvas. */
  private toCanvas(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (event.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  /**
   * Tolerance du double-appui. Un doigt bouge beaucoup plus qu'une souris
   * entre deux appuis : sur mobile, un seuil de 12 pixels rend le double-tap
   * quasiment impossible a declencher.
   */
  private get tapSlop(): number {
    const density = this.canvas.width / Math.max(window.innerWidth, 1);
    return (this.coarse ? 26 : 10) * Math.max(density, 1);
  }

  private onPointerDown = (event: PointerEvent): void => {
    const { x, y } = this.toCanvas(event);
    this.active.set(event.pointerId, { x, y });
    this.mouseX = x;
    this.mouseY = y;

    const now = performance.now();
    const slop = this.tapSlop;
    const near = Math.abs(x - this.lastTapX) < slop && Math.abs(y - this.lastTapY) < slop;
    const double = now - this.lastTapTime < 340 && near;

    this.downs.push({ id: event.pointerId, x, y, double });
    // Apres un double, on repart de zero : un troisieme appui rapide ne doit
    // pas declencher un second « double ».
    this.lastTapTime = double ? 0 : now;
    this.lastTapX = x;
    this.lastTapY = y;

    // Evite que le navigateur interprete le geste (defilement, zoom, selection).
    event.preventDefault();
  };

  private onPointerMove = (event: PointerEvent): void => {
    const { x, y } = this.toCanvas(event);
    this.mouseX = x;
    this.mouseY = y;
    if (!this.active.has(event.pointerId)) return;
    this.active.set(event.pointerId, { x, y });
    this.moves.push({ id: event.pointerId, x, y });
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.active.delete(event.pointerId)) return;
    this.ups.push(event.pointerId);
  };

  // --- Etat ---------------------------------------------------------------

  isDown(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code));
  }

  /** Un pointeur est-il encore appuye ? */
  isPointerActive(id: number): boolean {
    return this.active.has(id);
  }

  /** Vecteur de deplacement clavier, normalise. */
  moveVector(): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    if (this.isDown('ArrowUp', 'KeyW', 'KeyZ')) dy -= 1;
    if (this.isDown('ArrowDown', 'KeyS')) dy += 1;
    if (this.isDown('ArrowLeft', 'KeyA', 'KeyQ')) dx -= 1;
    if (this.isDown('ArrowRight', 'KeyD')) dx += 1;
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    return { dx, dy };
  }

  /** Vide les files d'evenements, a appeler en fin de frame. */
  endFrame(): void {
    this.downs.length = 0;
    this.moves.length = 0;
    this.ups.length = 0;
    this.pressed.length = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }
}

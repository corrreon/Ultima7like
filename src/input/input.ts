/**
 * Entrees clavier et souris.
 *
 * Ultima VII se joue essentiellement a la souris : un clic maintenu deplace
 * l'Avatar, un double-clic « utilise » ce qui se trouve dessous. On garde ces
 * deux gestes et on ajoute les touches directionnelles, plus confortables au
 * clavier moderne.
 */

export interface PointerEventInfo {
  x: number;
  y: number;
  double: boolean;
}

export class Input {
  private readonly keys = new Set<string>();
  private lastClickTime = 0;
  private lastClickX = 0;
  private lastClickY = 0;

  mouseX = 0;
  mouseY = 0;
  mouseDown = false;

  /** File des clics a traiter par la boucle de jeu. */
  readonly clicks: PointerEventInfo[] = [];
  /** File des touches pressees cette frame. */
  readonly pressed: string[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.keys.has(event.code)) this.pressed.push(event.code);
    this.keys.add(event.code);
    // On evite que les fleches fassent defiler la page.
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private updateMouse(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    // Le canvas est etire en CSS : on repasse en pixels de rendu.
    this.mouseX = (event.clientX - rect.left) * (this.canvas.width / rect.width);
    this.mouseY = (event.clientY - rect.top) * (this.canvas.height / rect.height);
  }

  private onMouseMove = (event: MouseEvent): void => {
    this.updateMouse(event);
  };

  private onMouseDown = (event: MouseEvent): void => {
    this.updateMouse(event);
    this.mouseDown = true;

    const now = performance.now();
    const near =
      Math.abs(this.mouseX - this.lastClickX) < 12 && Math.abs(this.mouseY - this.lastClickY) < 12;
    const isDouble = now - this.lastClickTime < 320 && near;

    this.clicks.push({ x: this.mouseX, y: this.mouseY, double: isDouble });
    // Apres un double-clic on remet le compteur a zero, sinon un troisieme clic
    // rapide declencherait un second « double ».
    this.lastClickTime = isDouble ? 0 : now;
    this.lastClickX = this.mouseX;
    this.lastClickY = this.mouseY;
  };

  private onMouseUp = (): void => {
    this.mouseDown = false;
  };

  isDown(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code));
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
      const inv = Math.SQRT1_2;
      dx *= inv;
      dy *= inv;
    }
    return { dx, dy };
  }

  /** Vide les files d'evenements, a appeler en fin de frame. */
  endFrame(): void {
    this.clicks.length = 0;
    this.pressed.length = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mouseup', this.onMouseUp);
  }
}

import { FIXED_DT } from './constants';

/**
 * Boucle de jeu a pas de simulation fixe et rendu libre.
 *
 * La simulation doit avancer par pas constants (sinon les emplois du temps,
 * la physique des objets et le pathfinding deviennent dependants du framerate),
 * tandis que le rendu suit le rafraichissement de l'ecran.
 */
export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      // On plafonne a 250 ms pour eviter la « spirale de la mort » apres un
      // changement d'onglet.
      const elapsed = Math.min((now - this.lastTime) / 1000, 0.25);
      this.lastTime = now;
      this.accumulator += elapsed;

      while (this.accumulator >= FIXED_DT) {
        this.update(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }

      this.render(this.accumulator / FIXED_DT);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }
}

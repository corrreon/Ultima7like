import { TILE_SIZE } from '../core/constants';
import type { GameClock } from '../core/clock';
import type { Camera } from './camera';

export interface LightSource {
  /** Position en tuiles (flottantes). */
  x: number;
  y: number;
  /** Rayon en tuiles. */
  radius: number;
  /** Intensite dans [0, 1]. */
  intensity?: number;
}

interface AmbientKey {
  hour: number;
  color: [number, number, number];
  darkness: number;
}

/**
 * Cycle jour/nuit.
 *
 * On interpole une couleur ambiante et une opacite entre quelques moments-cles
 * de la journee, puis on compose : un voile assombrissant est peint par-dessus
 * la scene, et les sources de lumiere y percent des trous. C'est peu couteux et
 * cela suffit a rendre la nuit reellement genante — ce qui est le but, puisque
 * porter une torche doit avoir un interet.
 */
const KEYS: AmbientKey[] = [
  { hour: 0, color: [24, 30, 66], darkness: 0.78 },
  { hour: 5, color: [40, 44, 82], darkness: 0.66 },
  { hour: 7, color: [130, 106, 88], darkness: 0.22 },
  { hour: 10, color: [255, 246, 224], darkness: 0.0 },
  { hour: 16, color: [255, 240, 208], darkness: 0.0 },
  { hour: 19, color: [190, 118, 70], darkness: 0.24 },
  { hour: 21, color: [50, 52, 96], darkness: 0.62 },
  { hour: 24, color: [24, 30, 66], darkness: 0.78 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function ambientAt(hourFloat: number): { color: string; darkness: number } {
  let lower = KEYS[0]!;
  let upper = KEYS[KEYS.length - 1]!;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i]!;
    const b = KEYS[i + 1]!;
    if (hourFloat >= a.hour && hourFloat <= b.hour) {
      lower = a;
      upper = b;
      break;
    }
  }
  const span = upper.hour - lower.hour || 1;
  const t = (hourFloat - lower.hour) / span;
  const r = Math.round(lerp(lower.color[0], upper.color[0], t));
  const g = Math.round(lerp(lower.color[1], upper.color[1], t));
  const b = Math.round(lerp(lower.color[2], upper.color[2], t));
  return { color: `rgb(${r}, ${g}, ${b})`, darkness: lerp(lower.darkness, upper.darkness, t) };
}

export class Lighting {
  private readonly mask: HTMLCanvasElement;
  private readonly maskCtx: CanvasRenderingContext2D;

  constructor() {
    this.mask = document.createElement('canvas');
    this.maskCtx = this.mask.getContext('2d')!;
  }

  /** Peint le voile nocturne troue par les sources de lumiere. */
  render(
    target: CanvasRenderingContext2D,
    camera: Camera,
    clock: GameClock,
    lights: readonly LightSource[],
    pixelWidth: number,
    pixelHeight: number,
  ): void {
    const { color, darkness } = ambientAt(clock.hourFloat);
    if (darkness <= 0.01) return;

    if (this.mask.width !== pixelWidth || this.mask.height !== pixelHeight) {
      this.mask.width = pixelWidth;
      this.mask.height = pixelHeight;
    }

    const ctx = this.maskCtx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);

    // Chaque lumiere efface une portion du voile, avec un degrade radial.
    //
    // Attention au piege : `destination-out` se cumule de maniere
    // multiplicative. Trois lampes a 60 % qui se recouvrent ne laissent que
    // 6 % du voile, et la nuit redevient un plein jour terne. D'ou une
    // attenuation resserree (l'essentiel de la clarte dans le premier tiers du
    // rayon) et des rayons volontairement courts dans shapes.ts.
    ctx.globalCompositeOperation = 'destination-out';
    for (const light of lights) {
      const { sx, sy } = camera.worldToScreen(light.x, light.y, 0);
      const cx = (sx - TILE_SIZE / 2) * camera.zoom;
      const cy = (sy - TILE_SIZE / 2) * camera.zoom;
      const radius = light.radius * TILE_SIZE * camera.zoom;
      if (cx < -radius || cy < -radius || cx > pixelWidth + radius || cy > pixelHeight + radius) {
        continue;
      }
      const gradient = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
      const intensity = light.intensity ?? 0.9;
      gradient.addColorStop(0, `rgba(0, 0, 0, ${intensity})`);
      gradient.addColorStop(0.35, `rgba(0, 0, 0, ${intensity * 0.35})`);
      gradient.addColorStop(0.7, `rgba(0, 0, 0, ${intensity * 0.08})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    target.save();
    target.globalAlpha = darkness;
    target.globalCompositeOperation = 'multiply';
    target.drawImage(this.mask, 0, 0);
    target.restore();
  }
}

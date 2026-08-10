/**
 * Palette unifiee et tramage.
 *
 * C'est la fondation qui manquait, et probablement la raison principale pour
 * laquelle des graphismes « faits maison » ont l'air amateurs alors qu'Ultima
 * VII, avec ses tuiles de 8 pixels, a l'air d'un vrai monde.
 *
 * Deux disciplines expliquent l'ecart :
 *
 *  1. **Une seule palette.** U7 travaille avec 256 couleurs globales. Chaque
 *     sprite pioche dedans, donc tout se marie automatiquement. Choisir ses
 *     couleurs sprite par sprite — ce que faisait la premiere version de ce
 *     moteur — donne un ensemble qui « jure », meme quand chaque element pris
 *     isolement est correct.
 *
 *  2. **Une seule direction de lumiere.** Les hautes lumieres en haut a
 *     gauche, les ombres en bas a droite, sans exception. C'est ce qui donne
 *     l'impression de volume a des sprites minuscules.
 *
 * On y ajoute le tramage, omnipresent dans l'art VGA : avec peu de couleurs,
 * alterner deux teintes en damier simule les teintes intermediaires et cree
 * cette texture granuleuse caracteristique de l'epoque.
 */

/** Rampes de 5 valeurs, de l'ombre a la haute lumiere. */
export const RAMPS = {
  grass: ['#1b2f16', '#294620', '#3a5f2d', '#4c793c', '#63954c'],
  dirt: ['#40311e', '#5a4629', '#735a36', '#8d7245', '#a68a5b'],
  sand: ['#6f5d39', '#8d764c', '#a89060', '#c2ab77', '#d9c495'],
  water: ['#0d1f31', '#152d45', '#1e4160', '#2b587d', '#3c739c'],
  stone: ['#33332f', '#4a4a45', '#61615a', '#787870', '#909088'],
  wood: ['#33220f', '#4b331a', '#634527', '#7d5b35', '#966f45'],
  plaster: ['#52493a', '#6d6250', '#897c66', '#a4977e', '#bfb298'],
  roof: ['#331a14', '#4e281e', '#68382a', '#804a37', '#996046'],
  leaf: ['#152b13', '#20401c', '#2e5827', '#3d7133', '#508c42'],
  metal: ['#24242a', '#38383f', '#4e4e56', '#66666e', '#828289'],
  cloth: ['#2f2338', '#453352', '#5c466c', '#745c86', '#8d75a0'],
  linen: ['#4a4335', '#665e4c', '#837a65', '#a0977f', '#bdb49b'],
  skin: ['#5e3c2a', '#7d5238', '#9c6b4c', '#b98964', '#d2a882'],
  gold: ['#5e4010', '#80591a', '#a17529', '#bf933d', '#d9b25e'],
  fire: ['#6b1f07', '#98380b', '#c25f13', '#e08f28', '#f5c95f'],
  blood: ['#3d1414', '#5c1f1d', '#7a2f28', '#963f35', '#b05446'],
  royal: ['#141f3d', '#1f2f5c', '#2b4180', '#3a559c', '#4d6db8'],
} as const;

export type RampName = keyof typeof RAMPS;

/** Couleur d'une rampe. `level` va de 0 (ombre) a 4 (haute lumiere). */
export function tone(ramp: RampName, level: number): string {
  const colors = RAMPS[ramp];
  const index = Math.max(0, Math.min(colors.length - 1, Math.round(level)));
  return colors[index]!;
}

/** Noir de l'ombre portee, commun a toute la scene. */
export const SHADOW = '#0b0a08';

/**
 * Matrice de Bayer 4x4 : l'ordre dans lequel les pixels s'allument quand on
 * fait varier une densite. C'est le tramage ordonne classique, celui qu'on
 * voit dans les degrades d'Ultima VII.
 */
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Seuil de Bayer pour un pixel, normalise dans [0, 1). */
export function bayer(x: number, y: number): number {
  const row = BAYER_4[((y % 4) + 4) % 4]!;
  return row[((x % 4) + 4) % 4]! / 16;
}

/**
 * Remplit une zone en alternant deux teintes selon une densite tramee.
 * `density` = 0 : uniquement `back` ; 1 : uniquement `front`.
 */
export function ditherRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  back: string,
  front: string,
  density: number,
): void {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = front;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (density > bayer(x + px, y + py)) ctx.fillRect(x + px, y + py, 1, 1);
    }
  }
}

/**
 * Degrade tramé vertical : la densite passe de `topDensity` a `bottomDensity`.
 * Sert aux murs, aux troncs, a tout ce qui doit sembler cylindrique ou eclaire
 * par le haut.
 */
export function ditherGradientV(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  back: string,
  front: string,
  topDensity: number,
  bottomDensity: number,
): void {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = front;
  for (let py = 0; py < h; py++) {
    const t = h <= 1 ? 0 : py / (h - 1);
    const density = topDensity + (bottomDensity - topDensity) * t;
    for (let px = 0; px < w; px++) {
      if (density > bayer(x + px, y + py)) ctx.fillRect(x + px, y + py, 1, 1);
    }
  }
}

/**
 * Applique un masque d'opacite tramé a un canvas deja dessine.
 * `alphaAt` retourne une opacite dans [0, 1] ; le tramage la transforme en
 * pixels pleins ou transparents, ce qui evite les bords flous — un degrade
 * lisse sur du pixel art se voit immediatement et fait « moderne », pas VGA.
 */
export function applyDitheredMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alphaAt: (x: number, y: number) => number,
): void {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = alphaAt(x, y);
      const keep = alpha > bayer(x, y);
      if (!keep) data[(y * width + x) * 4 + 3] = 0;
    }
  }
  ctx.putImageData(image, 0, 0);
}

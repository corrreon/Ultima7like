import type { World } from './world';

/**
 * Transitions entre terrains.
 *
 * Un damier de tuiles carrees aux bords francs se voit immediatement : c'est
 * le signe qui trahit un prototype avant meme la qualite du dessin. Ultima VII
 * dessine des tuiles de raccord entre chaque paire de terrains (herbe vers
 * terre, sable vers eau), et c'est ce qui donne au monde son aspect peint
 * plutot que carrele.
 *
 * On obtient le meme resultat sans dessiner des centaines de tuiles a la main :
 * chaque terrain recoit une **priorite**, et un terrain de priorite superieure
 * deborde sur ses voisins par un liseré tramé. Huit debordements suffisent —
 * quatre cotes et quatre coins.
 */

/**
 * Qui deborde sur qui. Le plus eleve recouvre le plus bas.
 *
 * L'ordre suit la logique physique : l'eau est le fond du decor, le sable se
 * depose sur ses bords, la terre battue mord sur le sable, l'herbe reprend ses
 * droits sur la terre. Les sols construits, eux, ne debordent sur rien : une
 * dalle de pierre a un bord net, c'est ce qui la fait lire comme un ouvrage
 * humain au milieu de la nature.
 */
const PRIORITY: Record<string, number> = {
  water: 0,
  sand: 1,
  dirt: 2,
  grass: 3,
  stone: 0,
  woodfloor: 0,
};

export function terrainPriority(id: string): number {
  return PRIORITY[id] ?? 0;
}

/** Les huit voisins, dans l'ordre des masques de transition. */
export const DIRECTIONS = [
  'n',
  'e',
  's',
  'w',
  'ne',
  'se',
  'sw',
  'nw',
] as const;

export type TransitionDir = (typeof DIRECTIONS)[number];

const OFFSETS: Record<TransitionDir, [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
  ne: [1, -1],
  se: [1, 1],
  sw: [-1, 1],
  nw: [-1, -1],
};

export interface Transition {
  /** Terrain qui deborde sur la tuile. */
  terrain: string;
  dir: TransitionDir;
}

/**
 * Liste les debordements a dessiner par-dessus une tuile.
 *
 * Subtilite qui compte visuellement : un coin n'est dessine que si les deux
 * cotes adjacents ne debordent pas deja. Sinon on empile deux liserés au meme
 * endroit, ce qui produit une tache sombre a chaque angle.
 */
export function transitionsAt(world: World, tx: number, ty: number): Transition[] {
  const own = terrainPriority(world.terrainAt(tx, ty));
  const result: Transition[] = [];

  const neighbour = (dir: TransitionDir): string => {
    const [dx, dy] = OFFSETS[dir];
    return world.terrainAt(tx + dx, ty + dy);
  };

  const overlaps = (dir: TransitionDir): boolean => terrainPriority(neighbour(dir)) > own;

  for (const dir of ['n', 'e', 's', 'w'] as const) {
    if (overlaps(dir)) result.push({ terrain: neighbour(dir), dir });
  }

  const corners: Array<[TransitionDir, TransitionDir, TransitionDir]> = [
    ['ne', 'n', 'e'],
    ['se', 's', 'e'],
    ['sw', 's', 'w'],
    ['nw', 'n', 'w'],
  ];
  for (const [corner, sideA, sideB] of corners) {
    if (!overlaps(corner)) continue;
    if (overlaps(sideA) || overlaps(sideB)) continue;
    result.push({ terrain: neighbour(corner), dir: corner });
  }

  // Les debordements les plus prioritaires se posent en dernier.
  result.sort((a, b) => terrainPriority(a.terrain) - terrainPriority(b.terrain));
  return result;
}

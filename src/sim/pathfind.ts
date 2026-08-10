import type { Actor } from '../objects/actor';
import type { World } from '../world/world';

export interface Step {
  tx: number;
  ty: number;
}

interface Node {
  tx: number;
  ty: number;
  g: number;
  f: number;
  parent: Node | null;
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

/** Distance octile : heuristique admissible pour un deplacement 8 directions. */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

export interface PathOptions {
  /** L'acteur qui se deplace (ignore par les tests de collision). */
  actor?: Actor;
  /** Accepter d'arriver a cette distance de la cible (en tuiles). */
  tolerance?: number;
  /** Garde-fou : nombre maximum de noeuds explores. */
  maxNodes?: number;
  /** L'acteur sait ouvrir les portes : elles ne barrent donc pas le chemin. */
  openDoors?: boolean;
}

/**
 * A* sur la grille de tuiles.
 *
 * Deux details comptent pour que le rendu paraisse « vivant » :
 *  - on interdit de couper les angles entre deux obstacles diagonaux, sinon les
 *    PNJ traversent visuellement les coins de murs ;
 *  - on accepte une tolerance d'arrivee, car la destination d'un emploi du temps
 *    (le lit, l'enclume) est souvent une case occupee par du mobilier.
 */
export function findPath(
  world: World,
  from: Step,
  to: Step,
  options: PathOptions = {},
): Step[] {
  const tolerance = options.tolerance ?? 0;
  const maxNodes = options.maxNodes ?? 4000;
  const actor = options.actor;
  const doors = options.openDoors ?? false;

  if (from.tx === to.tx && from.ty === to.ty) return [];

  const open: Node[] = [
    { tx: from.tx, ty: from.ty, g: 0, f: heuristic(from.tx, from.ty, to.tx, to.ty), parent: null },
  ];
  const bestG = new Map<number, number>();
  const encode = (x: number, y: number) => y * world.widthTiles + x;
  bestG.set(encode(from.tx, from.ty), 0);

  let explored = 0;

  while (open.length > 0 && explored < maxNodes) {
    // File de priorite naive : suffisante a cette echelle, a remplacer par un
    // tas binaire si la carte grandit.
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i]!.f < open[bestIndex]!.f) bestIndex = i;
    }
    const current = open.splice(bestIndex, 1)[0]!;
    explored++;

    const distance = Math.max(Math.abs(current.tx - to.tx), Math.abs(current.ty - to.ty));
    if (distance <= tolerance) return reconstruct(current);

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = current.tx + dx;
      const ny = current.ty + dy;
      if (!world.inBounds(nx, ny)) continue;

      // Invariant : un chemin ne pose jamais le pied sur une tuile bloquee.
      // Pour rejoindre une cible occupee (un lit, une enclume), on passe par
      // `tolerance` plutot que par une exception sur la case d'arrivee.
      if (world.isOccupied(nx, ny, actor, doors)) continue;

      // Pas de coupe d'angle en diagonale.
      if (dx !== 0 && dy !== 0) {
        if (world.isBlocked(current.tx + dx, current.ty, doors)) continue;
        if (world.isBlocked(current.tx, current.ty + dy, doors)) continue;
      }

      const stepCost = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
      const g = current.g + stepCost;
      const key = encode(nx, ny);
      const known = bestG.get(key);
      if (known !== undefined && known <= g) continue;

      bestG.set(key, g);
      open.push({ tx: nx, ty: ny, g, f: g + heuristic(nx, ny, to.tx, to.ty), parent: current });
    }
  }

  return [];
}

function reconstruct(node: Node): Step[] {
  const path: Step[] = [];
  let current: Node | null = node;
  while (current && current.parent) {
    path.push({ tx: current.tx, ty: current.ty });
    current = current.parent;
  }
  return path.reverse();
}

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

/**
 * Tas binaire minimal, ordonne sur `f`.
 *
 * La file de priorite etait un tableau balaye lineairement a chaque extraction.
 * A l'echelle d'un bourg de quatre habitants cela ne se voyait pas ; mesure a
 * quarante, un changement d'heure ou tout le monde se remet en route coutait
 * trois quarts de seconde, soit quarante-cinq images perdues d'un coup.
 *
 * C'est le facteur constant, pas la complexite du probleme : le nombre de
 * noeuds explores ne change pas, seul le cout de trouver le meilleur passe de
 * O(n) a O(log n).
 */
class Tas {
  private readonly items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]!.f <= items[i]!.f) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }

  pop(): Node | undefined {
    const items = this.items;
    const premier = items[0];
    const dernier = items.pop();
    if (items.length > 0 && dernier !== undefined) {
      items[0] = dernier;
      let i = 0;
      for (;;) {
        const gauche = i * 2 + 1;
        const droite = gauche + 1;
        let petit = i;
        if (gauche < items.length && items[gauche]!.f < items[petit]!.f) petit = gauche;
        if (droite < items.length && items[droite]!.f < items[petit]!.f) petit = droite;
        if (petit === i) break;
        [items[petit], items[i]] = [items[i]!, items[petit]!];
        i = petit;
      }
    }
    return premier;
  }
}

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

  // Memo des cases infranchissables, valable le temps de cette recherche.
  //
  // C'est ici que se jouait l'essentiel du cout, et pas la ou je l'attendais.
  // `isOccupied` appelle `objectsAt`, qui alloue un tableau et teste l'emprise
  // de tous les objets de quatre chunks — pres de deux cents objets. A* appelle
  // ce test jusqu'a dix fois par noeud, et une meme case est interrogee par
  // chacun de ses huit voisins : le meme travail etait refait huit fois.
  //
  // Le monde ne bouge pas pendant une recherche, donc une case interrogee une
  // fois donne la meme reponse jusqu'a la fin. Un cache persistant tenu par le
  // monde irait plus loin encore, mais il faudrait l'invalider a chaque objet
  // deplace ; celui-ci ne peut pas se desynchroniser.
  // Deux caches et non un seul : l'arrivee sur une case tient compte des
  // personnes presentes, la coupe d'angle non. Les confondre rendrait la regle
  // plus stricte — deux passants places en diagonale condamneraient le passage
  // entre eux — et changerait le comportement des foules sans qu'on l'ait
  // demande.
  const memoOccupe = new Map<number, boolean>();
  const memoBloque = new Map<number, boolean>();
  const occupe = (x: number, y: number): boolean => {
    const clef = y * world.widthTiles + x;
    let reponse = memoOccupe.get(clef);
    if (reponse === undefined) {
      reponse = world.isOccupied(x, y, actor, doors);
      memoOccupe.set(clef, reponse);
    }
    return reponse;
  };
  const bloque = (x: number, y: number): boolean => {
    const clef = y * world.widthTiles + x;
    let reponse = memoBloque.get(clef);
    if (reponse === undefined) {
      reponse = world.isBlocked(x, y, doors);
      memoBloque.set(clef, reponse);
    }
    return reponse;
  };

  const open = new Tas();
  open.push({
    tx: from.tx, ty: from.ty, g: 0, f: heuristic(from.tx, from.ty, to.tx, to.ty), parent: null,
  });
  const bestG = new Map<number, number>();
  const encode = (x: number, y: number) => y * world.widthTiles + x;
  bestG.set(encode(from.tx, from.ty), 0);

  let explored = 0;

  while (open.size > 0 && explored < maxNodes) {
    const current = open.pop()!;
    explored++;

    // Le tas ne sait pas mettre a jour une priorite : quand on retrouve un
    // meilleur chemin vers une case, on empile un second noeud pour elle. Le
    // moins bon ressort donc ensuite, perime — on le jette ici.
    if ((bestG.get(encode(current.tx, current.ty)) ?? Infinity) < current.g) continue;

    const distance = Math.max(Math.abs(current.tx - to.tx), Math.abs(current.ty - to.ty));
    if (distance <= tolerance) return reconstruct(current);

    for (const [dx, dy] of NEIGHBOURS) {
      const nx = current.tx + dx;
      const ny = current.ty + dy;
      if (!world.inBounds(nx, ny)) continue;

      // Invariant : un chemin ne pose jamais le pied sur une tuile bloquee.
      // Pour rejoindre une cible occupee (un lit, une enclume), on passe par
      // `tolerance` plutot que par une exception sur la case d'arrivee.
      if (occupe(nx, ny)) continue;

      // Pas de coupe d'angle en diagonale, sur la geometrie seule.
      if (dx !== 0 && dy !== 0) {
        if (bloque(current.tx + dx, current.ty)) continue;
        if (bloque(current.tx, current.ty + dy)) continue;
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

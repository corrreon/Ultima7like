import { Rng } from '../core/rng';
import { GameObject } from '../objects/gameobject';
import { World } from '../world/world';

/**
 * Le bourg de Valmoret : la carte de demonstration.
 *
 * Les batiments sont decrits par de petits plans ASCII plutot qu'en dur dans du
 * code : c'est lisible, modifiable sans recompiler mentalement, et c'est la
 * forme intermediaire naturelle avant d'ecrire un vrai editeur de carte (Exult
 * a le sien, Exult Studio — un clone serieux finira par en avoir besoin).
 */

export const WORLD_SIZE = 96;

/** Hauteur a laquelle sont posees les tuiles de toiture. */
const ROOF_LIFT = 4;
/**
 * Le decalage diagonal du lift vaut une demi-tuile par niveau. On decale donc
 * les toits de ROOF_LIFT / 2 tuiles pour qu'ils retombent pile sur les murs.
 */
const ROOF_SHIFT = ROOF_LIFT / 2;

interface Blueprint {
  name: string;
  ox: number;
  oy: number;
  rows: string[];
}

const BLUEPRINTS: Blueprint[] = [
  {
    name: 'Taverne du Chat Endormi',
    ox: 26,
    oy: 24,
    rows: [
      '#############',
      '#===k=k=k===#',
      '#=b=======b=#',
      '#=t=c===t=c=#',
      '#==rrr=rrr==#',
      '#=C===h===B=#',
      '#=o=====p=o=#',
      '#=t=c=====t=#',
      '#####D#######',
    ],
  },
  {
    name: 'Forge d\'Aldric',
    ox: 52,
    oy: 26,
    rows: [
      '###########',
      '#=========#',
      '#=b=====C=#',
      '#=rr===rr=#',
      '#=a===h===#',
      '#=========#',
      '#=B=====t=#',
      '#=====o===#',
      '#####D#####',
    ],
  },
  {
    name: 'Maison de Basile',
    ox: 30,
    oy: 48,
    rows: [
      '####D#####',
      '#=====k==#',
      '#=b====t=#',
      '#=rr==rr=#',
      '#=C====c=#',
      '#=p====o=#',
      '#=t====B=#',
      '##########',
    ],
  },
  {
    name: 'Corps de garde',
    ox: 54,
    oy: 48,
    rows: [
      '####D####',
      '#=======#',
      '#=b===C=#',
      '#=rr=rr=#',
      '#=t===c=#',
      '#=o===p=#',
      '#########',
    ],
  },
];

/** Lieux nommes, references par les emplois du temps des PNJ. */
export const LANDMARKS = {
  tavernBedA: { tx: 28, ty: 26 },
  tavernBedB: { tx: 36, ty: 26 },
  tavernTableA: { tx: 28, ty: 27 },
  tavernTableB: { tx: 34, ty: 27 },
  tavernHearth: { tx: 32, ty: 29 },
  tavernCorner: { tx: 36, ty: 31 },
  smithyBed: { tx: 54, ty: 28 },
  smithyAnvil: { tx: 54, ty: 30 },
  bardBed: { tx: 32, ty: 50 },
  bardTable: { tx: 32, ty: 54 },
  guardBed: { tx: 56, ty: 50 },
  guardTable: { tx: 56, ty: 52 },
  square: { tx: 44, ty: 41 },
  crossroads: { tx: 44, ty: 38 },
  avatarStart: { tx: 44, ty: 44 },
} as const;

function stampRoad(world: World, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) world.setTerrain(x, y, 'dirt', (x * 5 + y * 3) % 4);
  }
}

function stampStone(world: World, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) world.setTerrain(x, y, 'stone', (x * 3 + y * 7) % 4);
  }
}

function place(world: World, shape: string, tx: number, ty: number, init: Partial<{ frame: number; quality: number; name: string; quantity: number }> = {}): GameObject {
  const obj = new GameObject({ shape, tx, ty, ...init });
  world.addObject(obj);
  return obj;
}

function stampBuilding(world: World, plan: Blueprint): void {
  const height = plan.rows.length;
  const width = Math.max(...plan.rows.map((r) => r.length));
  // Le faitage court au milieu du batiment, dans le sens de la longueur.
  const ridgeRow = Math.floor((height - 1) / 2);

  world.regions.push({
    name: plan.name,
    x0: plan.ox,
    y0: plan.oy,
    x1: plan.ox + width - 1,
    y1: plan.oy + height - 1,
  });

  for (let row = 0; row < height; row++) {
    const line = plan.rows[row]!;
    for (let col = 0; col < line.length; col++) {
      const char = line[col]!;
      const tx = plan.ox + col;
      const ty = plan.oy + row;

      // Sol : pierre sous les murs, plancher a l'interieur.
      world.setTerrain(tx, ty, char === '#' ? 'stone' : 'woodfloor', (tx * 3 + ty * 5) % 4);

      switch (char) {
        case '#': {
          // Trois variantes de mur reparties de facon deterministe : panneau
          // nu, croix de Saint-Andre, fenetre a meneaux. Une facade dont
          // chaque tuile est identique se lit comme une texture repetee, pas
          // comme un batiment.
          const hash = (tx * 7 + ty * 13) % 11;
          const variant = hash === 0 ? 2 : hash === 4 || hash === 8 ? 1 : 0;
          place(world, 'wall', tx, ty, { frame: variant });
          break;
        }
        case 'D':
          place(world, 'door', tx, ty);
          break;
        case 't':
          place(world, 'table', tx, ty);
          break;
        case 'c':
          place(world, 'chair', tx, ty);
          break;
        case 'b':
          place(world, 'bed', tx, ty);
          break;
        case 'C':
          place(world, 'chest', tx, ty);
          break;
        case 'B':
          place(world, 'barrel', tx, ty);
          break;
        case 'a':
          place(world, 'anvil', tx, ty);
          break;
        case 'h':
          place(world, 'hearth', tx, ty);
          break;
        case 'k':
          place(world, 'bookshelf', tx, ty, { frame: (tx + ty) % 2 });
          break;
        case 'r':
          place(world, 'rug', tx, ty);
          break;
        case 'p':
          place(world, 'pot', tx, ty);
          break;
        case 'o':
          place(world, 'stool', tx, ty);
          break;
        default:
          break; // '=' : plancher nu
      }

      // Toiture : decalee pour compenser le lift, et marquee au nom du
      // batiment afin de pouvoir disparaitre quand on entre.
      //
      // La frame encode la position de la tuile dans la toiture : faitage au
      // milieu, versants de part et d'autre, egout aux extremites, rives a
      // gauche et a droite. C'est ce qui transforme un plan de tuiles
      // identiques en toit a deux pentes.
      const rowKind =
        row === ridgeRow ? 0 : row === 0 || row === height - 1 ? 3 : row < ridgeRow ? 1 : 2;
      const colKind = col === 0 ? 0 : col === width - 1 ? 2 : 1;
      const roof = place(world, 'roof', tx + ROOF_SHIFT, ty + ROOF_SHIFT, {
        name: plan.name,
        frame: rowKind * 3 + colKind,
      });
      roof.tz = ROOF_LIFT;
    }
  }

  // Cheminee, posee sur le faitage vers l'extremite ouest.
  const chimney = place(world, 'chimney', plan.ox + 2 + ROOF_SHIFT, plan.oy + ridgeRow + ROOF_SHIFT, {
    name: plan.name,
  });
  chimney.tz = ROOF_LIFT;
}

/**
 * Ameublement d'appoint, ajoute apres coup.
 *
 * Deux details que les plans ASCII ne savent pas exprimer, et qui pesent
 * lourd dans la lecture d'un interieur : la vaisselle qui traine sur les
 * tables, et les appliques accrochees aux murs. L'applique est posee sur la
 * tuile devant le mur avec un lift de 2 — le decalage diagonal de la hauteur
 * la fait retomber pile sur la maconnerie.
 */
function furnishInteriors(world: World, rng: Rng): void {
  for (const region of world.regions) {
    let wallProps = 0;
    for (let ty = region.y0 + 1; ty < region.y1; ty++) {
      for (let tx = region.x0 + 1; tx < region.x1; tx++) {
        const here = world.objectsAt(tx, ty);

        // Vaisselle sur une table sur deux.
        if (here.some((o) => o.shapeId === 'table') && rng.chance(0.55)) {
          const dishes = place(world, 'dishes', tx, ty);
          dishes.tz = 1;
          continue;
        }

        // Accroches murales : tuile libre dont le voisin nord est un mur.
        if (wallProps >= 5 || here.length > 0) continue;
        if (world.terrainAt(tx, ty) !== 'woodfloor') continue;
        const north = world.objectsAt(tx, ty - 1);
        if (!north.some((o) => o.shapeId === 'wall')) continue;
        if (!rng.chance(0.45)) continue;

        // Applique, ecu ou jambon : ce sont ces objets sans utilite mecanique
        // qui font qu'une piece raconte quelque chose.
        const roll = rng.next();
        const shapeId = roll < 0.5 ? 'sconce' : roll < 0.8 ? 'shield' : 'ham';
        const prop = place(world, shapeId, tx, ty, {
          frame: shapeId === 'shield' ? rng.int(0, 2) : 0,
        });
        prop.tz = 2;
        wallProps++;
      }
    }
  }
}

/** Remplit les coffres, tonneaux et tables d'objets manipulables. */
function fillContainers(world: World): void {
  const at = (tx: number, ty: number, shapeId: string): GameObject | undefined =>
    world.objectsAt(tx, ty).find((o) => o.shapeId === shapeId);

  const tavernChest = at(28, 29, 'chest');
  if (tavernChest) {
    tavernChest.add(new GameObject({ shape: 'gold', quantity: 32 }));
    tavernChest.add(new GameObject({ shape: 'key', quality: 1 }));
    const pouch = new GameObject({ shape: 'bag' });
    pouch.add(new GameObject({ shape: 'apple', quantity: 2 }));
    tavernChest.add(pouch);
  }

  const tavernBarrel = at(36, 29, 'barrel');
  if (tavernBarrel) {
    for (let i = 0; i < 4; i++) tavernBarrel.add(new GameObject({ shape: 'ale' }));
  }

  const smithyChest = at(60, 28, 'chest');
  if (smithyChest) {
    smithyChest.add(new GameObject({ shape: 'sword' }));
    smithyChest.add(new GameObject({ shape: 'gold', quantity: 14 }));
  }

  const bardChest = at(32, 52, 'chest');
  if (bardChest) {
    bardChest.add(new GameObject({ shape: 'lute' }));
    bardChest.add(new GameObject({ shape: 'torch' }));
  }

  const guardChest = at(60, 50, 'chest');
  if (guardChest) {
    guardChest.add(new GameObject({ shape: 'gold', quantity: 8 }));
    guardChest.add(new GameObject({ shape: 'torch' }));
  }

  // Quelques objets simplement poses : la table de taverne doit ressembler a
  // une table de taverne.
  place(world, 'bread', 28, 27, {});
  place(world, 'ale', 34, 27, {});
  place(world, 'apple', 36, 31, {});
  place(world, 'hammer', 60, 32, {});
  place(world, 'bread', 32, 54, {});
}

/** Construit la carte complete. */
export function buildTown(seed = 1337): World {
  const world = new World(WORLD_SIZE, WORLD_SIZE);
  const rng = new Rng(seed);

  // Terrain de base
  for (let ty = 0; ty < WORLD_SIZE; ty++) {
    for (let tx = 0; tx < WORLD_SIZE; tx++) {
      world.setTerrain(tx, ty, 'grass', rng.int(0, 5));
    }
  }

  // Etang, avec sa greve de sable
  const pond = { cx: 74, cy: 60, r: 6 };
  for (let ty = pond.cy - pond.r - 2; ty <= pond.cy + pond.r + 2; ty++) {
    for (let tx = pond.cx - pond.r - 2; tx <= pond.cx + pond.r + 2; tx++) {
      const d = Math.hypot(tx - pond.cx, ty - pond.cy);
      if (d <= pond.r) world.setTerrain(tx, ty, 'water', rng.int(0, 3));
      else if (d <= pond.r + 1.8) world.setTerrain(tx, ty, 'sand', rng.int(0, 3));
    }
  }

  // Routes et place centrale
  stampRoad(world, 20, 38, 72, 39);
  stampRoad(world, 44, 16, 45, 62);
  stampStone(world, 41, 36, 48, 42);
  stampRoad(world, 31, 33, 31, 38); // sortie de la taverne
  stampRoad(world, 57, 35, 57, 38); // sortie de la forge
  stampRoad(world, 34, 40, 34, 47); // vers la maison de Basile
  stampRoad(world, 58, 40, 58, 47); // vers le corps de garde

  for (const plan of BLUEPRINTS) stampBuilding(world, plan);

  // Vegetation : on evite les routes, les batiments et leurs abords.
  const isFree = (tx: number, ty: number): boolean => {
    if (world.terrainAt(tx, ty) !== 'grass') return false;
    if (world.objectsAt(tx, ty).length > 0) return false;
    for (const region of world.regions) {
      if (tx >= region.x0 - 2 && tx <= region.x1 + 2 && ty >= region.y0 - 2 && ty <= region.y1 + 2) {
        return false;
      }
    }
    return true;
  };

  for (let i = 0; i < 260; i++) {
    const tx = rng.int(2, WORLD_SIZE - 3);
    const ty = rng.int(2, WORLD_SIZE - 3);
    if (!isFree(tx, ty)) continue;
    // Un arbre sur trois est roux : c'est ce qui donne sa couleur au paysage.
    if (rng.chance(0.72)) place(world, 'tree', tx, ty, { frame: rng.int(0, 5) });
    else place(world, 'bush', tx, ty, { frame: rng.int(0, 1) });
  }

  // Menu decor de sol. Aucun effet sur le jeu, mais c'est l'un des plus gros
  // ecarts avec Ultima VII : chacun de ses plans est dense en petits details,
  // et un sol nu fait immediatement « niveau de test ».
  for (let i = 0; i < 900; i++) {
    const tx = rng.int(1, WORLD_SIZE - 2);
    const ty = rng.int(1, WORLD_SIZE - 2);
    const terrain = world.terrainAt(tx, ty);
    if (world.objectsAt(tx, ty).length > 0) continue;

    if (terrain === 'grass') {
      const roll = rng.next();
      if (roll < 0.42) place(world, 'tuft', tx, ty, { frame: rng.int(0, 1) });
      else if (roll < 0.72) place(world, 'flower', tx, ty, { frame: rng.int(0, 2) });
      else if (roll < 0.88) place(world, 'pebble', tx, ty, { frame: rng.int(0, 1) });
      else place(world, 'mushroom', tx, ty);
    } else if (terrain === 'dirt' && rng.chance(0.35)) {
      place(world, 'pebble', tx, ty, { frame: rng.int(0, 1) });
    } else if (terrain === 'sand' && rng.chance(0.25)) {
      place(world, 'pebble', tx, ty, { frame: rng.int(0, 1) });
    }
  }

  // Encombrement des abords : des caisses et tonneaux contre les facades,
  // comme dans n'importe quel bourg habite.
  for (const [tx, ty, shape] of [
    [25, 31, 'crate'], [25, 30, 'barrel'], [39, 27, 'crate'],
    [51, 32, 'barrel'], [63, 30, 'crate'], [63, 31, 'crate'],
    [29, 56, 'barrel'], [53, 52, 'crate'],
    [25, 29, 'sack'], [63, 32, 'sack'], [51, 33, 'sack'],
  ] as Array<[number, number, string]>) {
    if (!world.isBlocked(tx, ty)) place(world, shape, tx, ty);
  }

  // Barrieres : deux enclos de part et d'autre de la place. Une cloture donne
  // au paysage des lignes construites, ce qui manque cruellement a une prairie
  // uniquement peuplee d'arbres.
  for (let tx = 36; tx <= 40; tx++) {
    if (!world.isBlocked(tx, 45)) place(world, 'fence', tx, 45);
  }
  for (let ty = 45; ty <= 48; ty++) {
    if (!world.isBlocked(36, ty)) place(world, 'fence', 36, ty);
  }
  for (let tx = 49; tx <= 53; tx++) {
    if (!world.isBlocked(tx, 45)) place(world, 'fence', tx, 45);
  }

  // Eclairage public le long des routes
  for (const [tx, ty] of [
    [40, 37], [49, 37], [40, 42], [49, 42],
    [31, 36], [57, 36], [34, 43], [58, 43],
  ] as Array<[number, number]>) {
    place(world, 'lamppost', tx, ty);
  }

  place(world, 'sign', 32, 33, { name: 'Le Chat Endormi — gite et couvert' });
  place(world, 'sign', 58, 35, { name: 'Aldric, maitre forgeron' });

  fillContainers(world);
  furnishInteriors(world, rng);

  return world;
}

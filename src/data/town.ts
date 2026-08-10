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
      '#===========#',
      '#=b=======b=#',
      '#=t=c===t=c=#',
      '#===========#',
      '#=C===h===B=#',
      '#===========#',
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
      '#=========#',
      '#=a===h===#',
      '#=========#',
      '#=B=====t=#',
      '#=========#',
      '#####D#####',
    ],
  },
  {
    name: 'Maison de Basile',
    ox: 30,
    oy: 48,
    rows: [
      '####D#####',
      '#========#',
      '#=b====t=#',
      '#========#',
      '#=C====c=#',
      '#========#',
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
      '#=======#',
      '#=t===c=#',
      '#=======#',
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
    for (let x = x0; x <= x1; x++) world.setTerrain(x, y, 'dirt', (x + y) % 2);
  }
}

function stampStone(world: World, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) world.setTerrain(x, y, 'stone', (x * 3 + y) % 2);
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
      world.setTerrain(tx, ty, char === '#' ? 'stone' : 'woodfloor', (tx + ty) % 2);

      switch (char) {
        case '#':
          place(world, 'wall', tx, ty);
          break;
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
        default:
          break; // '=' : plancher nu
      }

      // Toiture : decalee pour compenser le lift, et marquee au nom du
      // batiment afin de pouvoir disparaitre quand on entre.
      const roof = place(world, 'roof', tx + ROOF_SHIFT, ty + ROOF_SHIFT, { name: plan.name });
      roof.tz = ROOF_LIFT;
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
      world.setTerrain(tx, ty, 'grass', rng.int(0, 3));
    }
  }

  // Etang, avec sa greve de sable
  const pond = { cx: 74, cy: 60, r: 6 };
  for (let ty = pond.cy - pond.r - 2; ty <= pond.cy + pond.r + 2; ty++) {
    for (let tx = pond.cx - pond.r - 2; tx <= pond.cx + pond.r + 2; tx++) {
      const d = Math.hypot(tx - pond.cx, ty - pond.cy);
      if (d <= pond.r) world.setTerrain(tx, ty, 'water', rng.int(0, 1));
      else if (d <= pond.r + 1.8) world.setTerrain(tx, ty, 'sand', rng.int(0, 1));
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
    place(world, rng.chance(0.72) ? 'tree' : 'bush', tx, ty, { frame: rng.int(0, 1) });
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

  return world;
}

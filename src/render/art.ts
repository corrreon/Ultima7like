import { TILE_SIZE } from '../core/constants';
import { Rng } from '../core/rng';
import { allShapes, type ShapeDef } from '../world/shapes';

/**
 * Generation procedurale des sprites.
 *
 * Tous les graphismes sont dessines a l'execution : le projet ne contient donc
 * aucune donnee issue d'Ultima VII. C'est une contrainte volontaire — un moteur
 * reimplemente est licite, redistribuer les assets d'origine ne l'est pas.
 * Remplacer ce module par un chargeur d'atlas PNG ne change rien au reste du
 * moteur : seule l'interface Sprite est publique.
 */

export interface Sprite {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

type Ctx2D = CanvasRenderingContext2D;

function makeSprite(width: number, height: number, draw: (ctx: Ctx2D) => void): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return { canvas, width, height };
}

function px(ctx: Ctx2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Bruit tres leger, pour eviter les aplats de couleur trop plats. */
function speckle(ctx: Ctx2D, w: number, h: number, colors: string[], count: number, rng: Rng): void {
  for (let i = 0; i < count; i++) {
    const color = colors[rng.int(0, colors.length - 1)]!;
    px(ctx, rng.int(0, w - 1), rng.int(0, h - 1), 1, 1, color);
  }
}

const T = TILE_SIZE;

// --- Terrains -------------------------------------------------------------

function terrainSprite(base: string, specks: string[], seed: number): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    px(ctx, 0, 0, T, T, base);
    speckle(ctx, T, T, specks, 26, rng);
  });
}

function waterSprite(seed: number): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#1d3f5e');
    speckle(ctx, T, T, ['#255072', '#2b5a80'], 30, rng);
    for (let i = 0; i < 3; i++) {
      px(ctx, rng.int(1, T - 5), rng.int(1, T - 2), 4, 1, '#4d86ad');
    }
  });
}

function woodFloorSprite(seed: number): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#6b4a2c');
    for (let y = 0; y < T; y += 4) px(ctx, 0, y, T, 1, '#553a22');
    speckle(ctx, T, T, ['#7a5533', '#5e4128'], 18, rng);
  });
}

function stoneSprite(seed: number): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#6d6a63');
    px(ctx, 0, 0, T, 1, '#807d75');
    px(ctx, 0, T - 1, T, 1, '#575550');
    speckle(ctx, T, T, ['#7b7871', '#5f5c56'], 20, rng);
  });
}

// --- Objets ---------------------------------------------------------------

function wallSprite(): Sprite {
  const h = T * 2;
  return makeSprite(T, h, (ctx) => {
    px(ctx, 0, 0, T, h, '#9c8f74');
    px(ctx, 0, 0, T, 2, '#c3b493'); // arete eclairee
    px(ctx, T - 2, 0, 2, h, '#7d7360'); // arete a l'ombre
    for (let y = 4; y < h; y += 6) {
      px(ctx, 0, y, T, 1, '#847a66');
      px(ctx, (y / 6) % 2 === 0 ? 6 : 12, y, 1, 6, '#847a66');
    }
  });
}

function roofSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#7a3b2e');
    for (let y = 0; y < T; y += 3) px(ctx, 0, y, T, 1, '#653026');
    px(ctx, 0, 0, T, 1, '#8f4a39');
  });
}

function doorSprite(open: boolean): Sprite {
  const h = T * 2;
  return makeSprite(T, h, (ctx) => {
    if (open) {
      px(ctx, 0, 0, 4, h, '#4a3221');
      px(ctx, 4, 0, T - 4, h, '#171310');
    } else {
      px(ctx, 0, 0, T, h, '#5c4126');
      px(ctx, 1, 1, T - 2, h - 2, '#6f5030');
      px(ctx, T - 5, h / 2, 2, 2, '#d8c06a'); // poignee
      for (let y = 3; y < h; y += 7) px(ctx, 2, y, T - 4, 1, '#543c23');
    }
  });
}

function treeSprite(seed: number): Sprite {
  const rng = new Rng(seed);
  const h = T * 3;
  return makeSprite(T + 8, h, (ctx) => {
    px(ctx, T / 2, h - 10, 5, 10, '#4a3423'); // tronc
    ctx.fillStyle = '#2f5d2c';
    ctx.beginPath();
    ctx.ellipse((T + 8) / 2, h - 22, 11, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d7538';
    ctx.beginPath();
    ctx.ellipse((T + 8) / 2 - 2, h - 26, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    speckle(ctx, T + 8, h - 12, ['#4f8a45', '#27502a'], 40, rng);
  });
}

function bushSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    ctx.fillStyle = '#356a30';
    ctx.beginPath();
    ctx.ellipse(T / 2, T - 5, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, T / 2 - 3, T - 9, 2, 2, '#4b8a41');
  });
}

function tableSprite(): Sprite {
  return makeSprite(T, T + 4, (ctx) => {
    px(ctx, 1, 4, T - 2, 7, '#8a6238');
    px(ctx, 1, 4, T - 2, 2, '#a5794a');
    px(ctx, 2, 11, 2, 6, '#5e4327');
    px(ctx, T - 4, 11, 2, 6, '#5e4327');
  });
}

function chairSprite(): Sprite {
  return makeSprite(T, T + 4, (ctx) => {
    px(ctx, 4, 2, 8, 8, '#7a5533'); // dossier
    px(ctx, 3, 10, 10, 3, '#8f6640'); // assise
    px(ctx, 4, 13, 2, 5, '#5b3f26');
    px(ctx, 10, 13, 2, 5, '#5b3f26');
  });
}

function bedSprite(): Sprite {
  return makeSprite(T, T * 2, (ctx) => {
    px(ctx, 1, 2, T - 2, T * 2 - 4, '#6b4a2c');
    px(ctx, 2, 4, T - 4, T * 2 - 8, '#c9bfa6'); // draps
    px(ctx, 2, 4, T - 4, 6, '#e2dac4'); // oreiller
    px(ctx, 2, T + 2, T - 4, 8, '#8d4a44'); // couverture
  });
}

function chestSprite(open: boolean): Sprite {
  return makeSprite(T, T, (ctx) => {
    px(ctx, 1, 5, T - 2, 10, '#7a5533');
    px(ctx, 1, 5, T - 2, 3, open ? '#3a2a1a' : '#96693c');
    px(ctx, 1, 9, T - 2, 1, '#4a3421');
    px(ctx, T / 2 - 1, 9, 2, 3, '#d8c06a'); // ferrure
    if (open) px(ctx, 2, 2, T - 4, 3, '#96693c');
  });
}

function barrelSprite(): Sprite {
  return makeSprite(T, T + 4, (ctx) => {
    px(ctx, 3, 3, 10, 15, '#7d5a34');
    px(ctx, 3, 6, 10, 2, '#4f3a22');
    px(ctx, 3, 13, 10, 2, '#4f3a22');
    px(ctx, 3, 3, 10, 2, '#96693c');
  });
}

function bagSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    px(ctx, 4, 7, 8, 8, '#8a6a3a');
    px(ctx, 5, 5, 6, 3, '#6d5330');
    px(ctx, 6, 4, 4, 1, '#a5824a');
  });
}

function anvilSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    px(ctx, 2, 6, 12, 4, '#4b4b52');
    px(ctx, 5, 10, 6, 5, '#3b3b41');
    px(ctx, 2, 6, 12, 1, '#6a6a72');
  });
}

function signSprite(): Sprite {
  return makeSprite(T, T + 8, (ctx) => {
    px(ctx, 7, 10, 2, 14, '#5b3f26');
    px(ctx, 2, 3, 12, 9, '#8a6238');
    px(ctx, 3, 4, 10, 7, '#a5794a');
    px(ctx, 4, 6, 8, 1, '#5b3f26');
    px(ctx, 4, 8, 6, 1, '#5b3f26');
  });
}

function lamppostSprite(): Sprite {
  return makeSprite(T, T * 2, (ctx) => {
    px(ctx, 7, 8, 2, T * 2 - 8, '#3c3a36');
    px(ctx, 5, 3, 6, 6, '#e8c76a');
    px(ctx, 4, 2, 8, 2, '#57544e');
    px(ctx, 6, 4, 4, 4, '#fff0b8');
  });
}

function hearthSprite(lit: boolean): Sprite {
  return makeSprite(T, T + 6, (ctx) => {
    px(ctx, 0, 6, T, 16, '#6d6a63');
    px(ctx, 3, 10, 10, 11, '#241d18');
    if (lit) {
      px(ctx, 5, 14, 6, 6, '#e2721f');
      px(ctx, 6, 12, 4, 5, '#f4b64a');
      px(ctx, 7, 11, 2, 3, '#fde9a8');
    } else {
      px(ctx, 5, 17, 6, 3, '#5a4034');
    }
  });
}

// --- Petits objets --------------------------------------------------------

function smallItem(draw: (ctx: Ctx2D) => void): Sprite {
  return makeSprite(T, T, draw);
}

const itemPainters: Record<string, (ctx: Ctx2D) => void> = {
  bread: (ctx) => {
    ctx.fillStyle = '#b98a4a';
    ctx.beginPath();
    ctx.ellipse(8, 10, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 5, 8, 6, 1, '#8f6431');
  },
  apple: (ctx) => {
    ctx.fillStyle = '#b8342f';
    ctx.beginPath();
    ctx.arc(8, 10, 4, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 8, 5, 1, 3, '#4a3423');
    px(ctx, 6, 8, 1, 1, '#e07a6a');
  },
  ale: (ctx) => {
    px(ctx, 5, 6, 6, 9, '#c9a55e');
    px(ctx, 5, 5, 6, 2, '#f2e6c8');
    px(ctx, 11, 8, 2, 4, '#a07f43');
  },
  gold: (ctx) => {
    ctx.fillStyle = '#e0b23c';
    ctx.beginPath();
    ctx.arc(8, 10, 3, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 7, 8, 2, 1, '#fbe89a');
  },
  key: (ctx) => {
    px(ctx, 5, 9, 7, 2, '#c9b06a');
    px(ctx, 3, 7, 3, 5, '#c9b06a');
    px(ctx, 11, 11, 1, 2, '#c9b06a');
  },
  sword: (ctx) => {
    px(ctx, 7, 2, 2, 10, '#c3c8d0');
    px(ctx, 5, 11, 6, 1, '#8a7440');
    px(ctx, 7, 12, 2, 3, '#5b3f26');
  },
  hammer: (ctx) => {
    px(ctx, 4, 4, 8, 4, '#5b5b62');
    px(ctx, 7, 8, 2, 7, '#7a5533');
  },
  torch: (ctx) => {
    px(ctx, 7, 6, 2, 9, '#5b3f26');
    px(ctx, 6, 3, 4, 4, '#e2721f');
    px(ctx, 7, 2, 2, 2, '#fde9a8');
  },
  lute: (ctx) => {
    ctx.fillStyle = '#8a6238';
    ctx.beginPath();
    ctx.ellipse(7, 11, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 9, 2, 2, 8, '#6d4b2a');
    px(ctx, 6, 9, 1, 4, '#e6d8b8');
  },
};

// --- Acteurs --------------------------------------------------------------

interface ActorPalette {
  skin: string;
  hair: string;
  tunic: string;
  legs: string;
  accent: string;
}

const actorPalettes: Record<string, ActorPalette> = {
  avatar: { skin: '#d9a87c', hair: '#3a2a1a', tunic: '#2f5b8f', legs: '#3a3f4a', accent: '#d8c06a' },
  townsman: { skin: '#d0a077', hair: '#5a3a20', tunic: '#6b7a4a', legs: '#4a3f30', accent: '#8a6238' },
  townswoman: { skin: '#dcb089', hair: '#7a4322', tunic: '#8f4a6b', legs: '#5a3a4a', accent: '#d9c7a8' },
  guard: { skin: '#c99a70', hair: '#2f2a24', tunic: '#5a6068', legs: '#3a3f46', accent: '#b8bcc4' },
  smith: { skin: '#c08a5e', hair: '#2a1f16', tunic: '#7a4a2c', legs: '#4a3524', accent: '#4b4b52' },
};

/**
 * Sprite d'acteur : 16x24, ancre en bas.
 * `dir` : 0 nord (de dos), 1 est, 2 sud (de face), 3 ouest. `pose` : 0 ou 1.
 */
function actorSprite(palette: ActorPalette, dir: number, pose: number): Sprite {
  return makeSprite(T, 24, (ctx) => {
    const back = dir === 0;
    const side = dir === 1 || dir === 3;
    const swing = pose === 1 ? 1 : 0;

    // jambes
    px(ctx, 6, 18 + swing, 2, 6 - swing, palette.legs);
    px(ctx, 9, 18 + (1 - swing), 2, 6 - (1 - swing), palette.legs);
    // torse
    px(ctx, 5, 10, 7, 9, palette.tunic);
    px(ctx, 5, 10, 7, 2, palette.accent);
    // bras
    if (side) {
      px(ctx, dir === 1 ? 11 : 4, 11, 2, 6, palette.tunic);
    } else {
      px(ctx, 3, 11, 2, 6, palette.tunic);
      px(ctx, 12, 11, 2, 6, palette.tunic);
    }
    // tete
    px(ctx, 5, 3, 7, 7, palette.skin);
    px(ctx, 5, 2, 7, 3, palette.hair);
    if (back) {
      px(ctx, 5, 2, 7, 6, palette.hair);
    } else if (side) {
      px(ctx, dir === 1 ? 5 : 10, 3, 2, 5, palette.hair);
      px(ctx, dir === 1 ? 10 : 6, 6, 1, 1, '#241d18'); // oeil de profil
    } else {
      px(ctx, 7, 6, 1, 1, '#241d18');
      px(ctx, 10, 6, 1, 1, '#241d18');
    }
  });
}

// --- Atlas ----------------------------------------------------------------

const atlas = new Map<string, Sprite[]>();

/** Construit tous les sprites. A appeler une fois au demarrage. */
export function buildArt(): void {
  if (atlas.size > 0) return;

  atlas.set('grass', [0, 1, 2, 3].map((i) => terrainSprite('#3f6b33', ['#4b7d3c', '#365c2c'], 100 + i)));
  atlas.set('dirt', [0, 1].map((i) => terrainSprite('#8a7047', ['#9b7f53', '#77603c'], 200 + i)));
  atlas.set('sand', [0, 1].map((i) => terrainSprite('#c2ab73', ['#d3bc84', '#ad9764'], 300 + i)));
  atlas.set('water', [waterSprite(400), waterSprite(401)]);
  atlas.set('stone', [stoneSprite(500), stoneSprite(501)]);
  atlas.set('woodfloor', [woodFloorSprite(600), woodFloorSprite(601)]);

  atlas.set('wall', [wallSprite()]);
  atlas.set('roof', [roofSprite()]);
  atlas.set('door', [doorSprite(false), doorSprite(true)]);
  atlas.set('tree', [treeSprite(700), treeSprite(701)]);
  atlas.set('bush', [bushSprite()]);
  atlas.set('table', [tableSprite()]);
  atlas.set('chair', [chairSprite()]);
  atlas.set('bed', [bedSprite()]);
  atlas.set('anvil', [anvilSprite()]);
  atlas.set('sign', [signSprite()]);
  atlas.set('lamppost', [lamppostSprite()]);
  atlas.set('hearth', [hearthSprite(true), hearthSprite(false)]);
  atlas.set('chest', [chestSprite(false), chestSprite(true)]);
  atlas.set('barrel', [barrelSprite()]);
  atlas.set('bag', [bagSprite()]);

  for (const [id, painter] of Object.entries(itemPainters)) {
    atlas.set(id, [smallItem(painter)]);
  }

  for (const [id, palette] of Object.entries(actorPalettes)) {
    const frames: Sprite[] = [];
    for (let dir = 0; dir < 4; dir++) {
      for (let pose = 0; pose < 2; pose++) frames.push(actorSprite(palette, dir, pose));
    }
    atlas.set(id, frames);
  }

  // Filet de securite : toute shape sans art recoit un carre magenta visible.
  for (const shape of allShapes()) {
    if (!atlas.has(shape.id)) atlas.set(shape.id, [missingSprite(shape)]);
  }
}

function missingSprite(shape: ShapeDef): Sprite {
  return makeSprite(T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#c020c0');
    px(ctx, 1, 1, T - 2, T - 2, '#301030');
    ctx.fillStyle = '#ffffff';
    ctx.font = '8px monospace';
    ctx.fillText(shape.id.slice(0, 2), 3, 11);
  });
}

export function getSprite(shapeId: string, frame: number): Sprite {
  const frames = atlas.get(shapeId);
  if (!frames || frames.length === 0) throw new Error(`Art manquant pour ${shapeId}`);
  return frames[frame % frames.length]!;
}

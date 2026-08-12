import { TILE_SIZE } from '../core/constants';
import { Rng } from '../core/rng';
import { allShapes, type ShapeDef } from '../world/shapes';
import { DIRECTIONS, type TransitionDir } from '../world/terrain';
import {
  applyDitheredMask,
  bayer,
  ditherGradientV,
  ditherRect,
  hashNoise,
  noiseFill,
  tone,
  type RampName,
} from './palette';

/**
 * Generation procedurale des sprites.
 *
 * Tous les graphismes sont dessines a l'execution : le projet ne contient donc
 * aucune donnee issue d'Ultima VII. Remplacer ce module par un chargeur
 * d'atlas PNG ne change rien au reste du moteur — seule l'interface `Sprite`
 * est publique, et c'est ce qui rend la substitution possible le jour ou de
 * vrais dessins existeront (voir docs/GRAPHISMES.md).
 *
 * Regles de dessin, valables pour chaque sprite sans exception :
 *  - toutes les couleurs viennent des rampes de palette.ts ;
 *  - la lumiere vient du haut a gauche : hautes lumieres en haut a gauche,
 *    ombres en bas a droite ;
 *  - les degrades passent par le tramage, jamais par un fondu lisse.
 */

export interface Sprite {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

type Ctx2D = CanvasRenderingContext2D;

/**
 * Unite de dessin des sprites procéduraux, en pixels.
 *
 * Elle reste figee a 16 alors que la tuile du moteur fait desormais 32 : toutes
 * les fonctions de dessin ci-dessous placent leurs pixels dans ce repere, et
 * `makeSprite` agrandit d'un facteur entier a la fin. Sans cela, passer la
 * tuile a 32 aurait demande de replacer a la main chaque pixel des cinquante et
 * quelques sprites — pour un resultat identique, puisqu'un agrandissement au
 * plus proche voisin conserve exactement l'aspect pixel.
 *
 * Les vrais dessins, eux, arrivent par l'atlas en resolution native : ils ne
 * passent pas par ce chemin (voir src/render/atlas.ts).
 */
const T = 16;

/** Facteur d'agrandissement des sprites procéduraux. */
const ART_SCALE = Math.max(1, Math.round(TILE_SIZE / T));

function makeSprite(width: number, height: number, draw: (ctx: Ctx2D) => void): Sprite {
  const base = document.createElement('canvas');
  base.width = width;
  base.height = height;
  const ctx = base.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);

  if (ART_SCALE === 1) return { canvas: base, width, height };

  const canvas = document.createElement('canvas');
  canvas.width = width * ART_SCALE;
  canvas.height = height * ART_SCALE;
  const out = canvas.getContext('2d')!;
  out.imageSmoothingEnabled = false;
  out.drawImage(base, 0, 0, canvas.width, canvas.height);
  return { canvas, width: canvas.width, height: canvas.height };
}

function px(ctx: Ctx2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// --- Terrains -------------------------------------------------------------

/**
 * Motif enroule sur les bords de la tuile.
 *
 * C'est la technique qui casse la grille. Un galet dessine pres d'un bord est
 * aussi dessine de l'autre cote, si bien que la tuile se raccorde a elle-meme :
 * les formes traversent les jointures au lieu de s'arreter dessus. Sans cela,
 * un sol pave se lit comme un carrelage, ce qui est exactement le defaut que
 * les sols d'Ultima VII n'ont pas.
 */
function wrapEllipse(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  ctx.fillStyle = color;
  for (const ox of [-T, 0, T]) {
    for (const oy of [-T, 0, T]) {
      ctx.beginPath();
      ctx.ellipse(cx + ox, cy + oy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Texture de terrain meuble : bruit fin apériodique, plus des taches larges
 * enroulees qui font varier la valeur a grande echelle.
 */
function terrainSprite(ramp: RampName, seed: number, base = 2, speckles = 10): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    noiseFill(ctx, T, T, [tone(ramp, base - 1), tone(ramp, base)], [3, 4], seed, 2);
    // Taches larges : la variation de valeur a grande echelle empeche le sol
    // de ressembler a du papier de verre uniforme.
    for (let i = 0; i < 3; i++) {
      wrapEllipse(
        ctx,
        rng.int(0, T),
        rng.int(0, T),
        rng.int(3, 6),
        rng.int(2, 4),
        tone(ramp, rng.chance(0.5) ? base - 1 : base + 1),
      );
    }
    for (let i = 0; i < speckles; i++) {
      px(ctx, rng.int(0, T - 1), rng.int(0, T - 1), 1, 1, tone(ramp, base + 2));
    }
  });
}

/**
 * Herbe.
 *
 * Le premier jet mettait sept touffes vivement contrastees dans chaque tuile :
 * repete sur tout un ecran, cela ne lit plus comme de l'herbe mais comme du
 * gresillement. Ultima VII fait l'inverse — un sol calme, et le detail apporte
 * par des objets poses dessus (voir les shapes `tuft`, `flower`, `pebble`).
 *
 * Les quatre variantes vont donc du sol nu au sol legerement herbu : la
 * variete vient de l'alternance des tuiles, pas de la densite de chacune.
 */
function grassSprite(seed: number, detail: number): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    // Bruit fin plutot que tramage : le damier de Bayer se lit comme un
    // grillage regulier des qu'il couvre une pelouse entiere.
    // Bande de valeurs resserree : l'herbe doit lire comme une masse, pas
    // comme un semis de points clairs et sombres.
    noiseFill(ctx, T, T, [tone('grass', 1), tone('grass', 2)], [4, 3], seed, 2);
    // Quelques amas a peine plus sombres. Le premier reglage utilisait le
    // niveau le plus sombre de la rampe : sur une pelouse entiere, cela
    // redevenait du bruit au lieu d'une variation de matiere.
    for (let i = 0; i < 3; i++) {
      wrapEllipse(ctx, rng.int(0, T - 1), rng.int(0, T - 1), 2.2, 1.6, tone('grass', 1));
    }
    // Plaques d'herbe plus rase ou plus drue, enroulees sur les bords.
    for (let i = 0; i < 2; i++) {
      wrapEllipse(
        ctx,
        rng.int(0, T),
        rng.int(0, T),
        rng.int(4, 7),
        rng.int(3, 5),
        tone('grass', rng.chance(0.5) ? 1 : 2),
      );
    }
    for (let i = 0; i < detail; i++) {
      const x = rng.int(1, T - 2);
      const y = rng.int(2, T - 2);
      px(ctx, x, y, 1, 2, tone('grass', 3));
    }
    // Petites fleurs incrustees dans le sol. Ultima VII en seme dans ses
    // pelouses : ce sont elles qui donnent la couleur, pas l'herbe.
    if (detail > 0 && rng.chance(0.55)) {
      const fx = rng.int(2, T - 3);
      const fy = rng.int(2, T - 3);
      const ramp: RampName = rng.chance(0.6) ? 'royal' : 'linen';
      px(ctx, fx, fy, 1, 1, tone(ramp, 4));
      px(ctx, fx + 1, fy + 1, 1, 1, tone(ramp, 3));
    }
  });
}

/** Eau animee : la houle se decale d'une frame a l'autre. */
function waterSprite(phase: number): Sprite {
  return makeSprite(T, T, (ctx) => {
    noiseFill(ctx, T, T, [tone('water', 0), tone('water', 1), tone('water', 2)], [1, 3, 2], 40 + phase, 2);
    // Trois trainees de crete qui defilent horizontalement.
    for (let i = 0; i < 3; i++) {
      const y = 2 + i * 5 + ((phase + i) % 2);
      const x = ((phase * 3 + i * 7) % T) - 2;
      px(ctx, x, y, 5, 1, tone('water', 3));
      px(ctx, x + 1, y, 3, 1, tone('water', 4));
    }
    for (let i = 0; i < 6; i++) {
      const bx = (i * 5 + phase * 2) % T;
      const by = (i * 7 + phase) % T;
      px(ctx, bx, by, 1, 1, tone('water', 0));
    }
  });
}

/**
 * Dallage de galets.
 *
 * Le premier jet dessinait une dalle carree par tuile, avec un joint sur les
 * quatre bords : resultat, un carrelage impeccable et parfaitement artificiel.
 * Les sols d'Ultima VII sont des semis de galets de tailles variees, dont
 * aucun ne s'aligne sur la grille — c'est ce desordre qui les fait lire comme
 * un vrai sol.
 *
 * Chaque galet est donc pose au hasard et **enroule** sur les bords, avec sa
 * haute lumiere en haut a gauche et son ombre en bas a droite.
 */
function stoneFloorSprite(seed: number): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    // Mortier : bruit sombre, visible seulement entre les galets.
    noiseFill(ctx, T, T, [tone('stone', 0), tone('stone', 1)], [2, 1], seed, 2);

    const count = rng.int(6, 8);
    for (let i = 0; i < count; i++) {
      const cx = rng.int(0, T - 1);
      const cy = rng.int(0, T - 1);
      const rx = rng.int(2, 4) + rng.next();
      const ry = rx * (0.7 + rng.next() * 0.5);
      const level = rng.chance(0.35) ? 3 : 2;

      wrapEllipse(ctx, cx, cy, rx, ry, tone('stone', level));
      // Haute lumiere : un galet legerement plus petit, decale en haut a gauche.
      wrapEllipse(ctx, cx - rx * 0.28, cy - ry * 0.3, rx * 0.62, ry * 0.62, tone('stone', level + 1));
      // Ombre de contact, en bas a droite.
      wrapEllipse(ctx, cx + rx * 0.5, cy + ry * 0.55, rx * 0.4, ry * 0.35, tone('stone', level - 1));
    }
  });
}

/**
 * Plancher.
 *
 * Volontairement sombre et peu contraste : c'est un fond, pas un motif. Des
 * lames trop marquees zebrent la piece et noient le mobilier, qui est lui
 * aussi en bois — il faut que la table se detache du sol sur lequel elle pose.
 */
function woodFloorSprite(seed: number, offset: number): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    noiseFill(ctx, T, T, [tone('wood', 1), tone('wood', 2)], [2, 1], seed, 2);
    // Les joints de lames sont decales d'une variante a l'autre : alignes, ils
    // dessineraient des lignes continues sur toute la largeur de la piece.
    for (let y = offset; y < T; y += 6) {
      px(ctx, 0, y, T, 1, tone('wood', 0));
      px(ctx, 0, y + 1, T, 1, tone('wood', 3));
    }
    // Bouts de lames : les joints verticaux ne tombent pas au meme endroit.
    px(ctx, rng.int(2, T - 3), offset, 1, 6, tone('wood', 0));
    for (let i = 0; i < 4; i++) {
      const y = rng.int(0, T - 1);
      px(ctx, rng.int(0, T - 7), y, rng.int(3, 6), 1, tone('wood', 2));
    }
  });
}

// --- Debordements de terrain ---------------------------------------------

/**
 * Opacite d'un pixel pour un debordement donne.
 * La valeur decroit avec la distance au bord concerne ; le tramage la
 * transforme ensuite en pixels pleins ou transparents.
 */
function edgeAlpha(dir: TransitionDir, x: number, y: number): number {
  const depth = T * 0.5; // profondeur du liseré
  const fromN = y;
  const fromS = T - 1 - y;
  const fromW = x;
  const fromE = T - 1 - x;

  // La frontiere ondule au lieu de suivre une bande d'epaisseur constante.
  // Sur la greve d'Ultima VII, l'herbe mord sur le sable par avancees et
  // reculs irreguliers ; un liseré rectiligne fait tout de suite « masque
  // calcule ». Deux octaves de bruit suffisent a rompre la regularite.
  const wobble =
    (hashNoise(Math.floor(x / 3), Math.floor(y / 3), 91) - 0.5) * 5 +
    (hashNoise(x, y, 17) - 0.5) * 2;

  const fade = (d: number): number => Math.max(0, 1 - (d + wobble) / depth);

  switch (dir) {
    case 'n':
      return fade(fromN);
    case 's':
      return fade(fromS);
    case 'w':
      return fade(fromW);
    case 'e':
      return fade(fromE);
    case 'ne':
      return fade(Math.hypot(fromN, fromE));
    case 'se':
      return fade(Math.hypot(fromS, fromE));
    case 'sw':
      return fade(Math.hypot(fromS, fromW));
    case 'nw':
      return fade(Math.hypot(fromN, fromW));
  }
}

/**
 * Bordure de trottoir, posee sur le bord d'une surface pavee.
 *
 * Sur les captures d'Ultima VII, une rue pavee est cernee d'un rang de pierres
 * de taille plus claires. C'est ce qui la fait lire comme un ouvrage : sans
 * bordure, une zone pavee n'est qu'une tache de texture differente au milieu
 * de l'herbe.
 *
 * `dir` designe le cote exterieur, celui qui touche autre chose que du pave.
 */
function kerbSprite(dir: 'n' | 'e' | 's' | 'w'): Sprite {
  const W = 4; // largeur du rang de bordure
  return makeSprite(T, T, (ctx) => {
    ctx.clearRect(0, 0, T, T);
    const horizontal = dir === 'n' || dir === 's';
    const x = dir === 'e' ? T - W : 0;
    const y = dir === 's' ? T - W : 0;
    const w = horizontal ? T : W;
    const h = horizontal ? W : T;

    noiseFill2(ctx, x, y, w, h, [tone('stone', 3), tone('stone', 4)], [2, 3], dir.charCodeAt(0));

    // Arete eclairee du cote de la lumiere, ombre a l'oppose.
    if (dir === 'n') {
      px(ctx, 0, 0, T, 1, tone('stone', 4));
      px(ctx, 0, W - 1, T, 1, tone('stone', 1));
    } else if (dir === 's') {
      px(ctx, 0, T - W, T, 1, tone('stone', 4));
      px(ctx, 0, T - 1, T, 1, tone('stone', 1));
    } else if (dir === 'w') {
      px(ctx, 0, 0, 1, T, tone('stone', 4));
      px(ctx, W - 1, 0, 1, T, tone('stone', 1));
    } else {
      px(ctx, T - W, 0, 1, T, tone('stone', 4));
      px(ctx, T - 1, 0, 1, T, tone('stone', 1));
    }

    // Joints entre pierres de taille.
    for (let i = 5; i < T; i += 6) {
      if (horizontal) px(ctx, i, y, 1, W, tone('stone', 2));
      else px(ctx, x, i, W, 1, tone('stone', 2));
    }
  });
}

/** Variante de `noiseFill` limitee a un rectangle. */
function noiseFill2(
  ctx: Ctx2D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  colors: string[],
  weights: number[],
  seed: number,
): void {
  const total = weights.reduce((a, b) => a + b, 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let pick = hashNoise(Math.floor((x0 + x) / 2), Math.floor((y0 + y) / 2), seed) * total;
      let index = 0;
      while (index < weights.length - 1 && pick > weights[index]!) {
        pick -= weights[index]!;
        index++;
      }
      px(ctx, x0 + x, y0 + y, 1, 1, colors[index] ?? colors[0]!);
    }
  }
}

/** Construit le liseré d'un terrain pour une direction. */
function transitionSprite(source: Sprite, dir: TransitionDir): Sprite {
  return makeSprite(T, T, (ctx) => {
    ctx.drawImage(source.canvas, 0, 0);
    applyDitheredMask(ctx, T, T, (x, y) => edgeAlpha(dir, x, y));
  });
}

// --- Constructions --------------------------------------------------------

/**
 * Mur de torchis a colombages.
 *
 * Un mur uni de 16 pixels de large est le plus sur moyen d'avoir l'air pauvre.
 * On lui donne donc une structure : sabliere haute eclairee, panneaux de
 * torchis tramés, poutres verticales, et une ombre franche a droite qui
 * indique d'ou vient la lumiere.
 */
/**
 * Mur a colombages, avec **couronnement visible**.
 *
 * C'est le detail qui manquait le plus. Sur les captures d'Ultima VII, on voit
 * la tranche superieure du mur — une bande de pierre eclairee, vue de dessus —
 * puis la face en dessous. Un mur reduit a un panneau vertical se lit comme un
 * decor de theatre ; la couronne lui donne une epaisseur, et le batiment
 * devient un volume.
 *
 * La couronne est prise **dans** la hauteur du sprite plutot qu'ajoutee : un
 * mur plus haut depasserait du toit, qui est cale sur la geometrie existante.
 */
function wallSprite(variant: number): Sprite {
  const h = T * 2;
  const CAP = 7; // epaisseur apparente du mur, vue de dessus
  return makeSprite(T, h, (ctx) => {
    // --- Face du mur, sous le couronnement.
    ditherGradientV(ctx, 0, CAP, T, h - CAP, tone('plaster', 2), tone('plaster', 3), 0.85, 0.15);

    // Colombages : un seul poteau par tuile, sur le bord gauche.
    //
    // En mettre un de chaque cote semble logique tuile par tuile, mais les
    // tuiles voisines produisent alors des poteaux jumeles et la facade se lit
    // comme une palissade. Un poteau par tuile donne un rythme regulier, donc
    // un mur continu.
    px(ctx, 0, CAP, 2, h - CAP, tone('wood', 2));
    px(ctx, 0, CAP, 1, h - CAP, tone('wood', 3));
    px(ctx, T - 1, CAP, 1, h - CAP, tone('plaster', 0)); // ombre du joint

    if (variant === 1) {
      // Croix de Saint-Andre, pour casser la repetition d'une facade longue.
      const span = h - CAP - 3;
      for (let i = 0; i < span; i++) {
        const t = i / (span - 1);
        px(ctx, Math.round(2 + t * (T - 6)), CAP + 2 + i, 2, 1, tone('wood', 2));
        px(ctx, Math.round(T - 4 - t * (T - 6)), CAP + 2 + i, 2, 1, tone('wood', 1));
      }
    } else if (variant === 2) {
      // Fenetre a meneaux, volet ouvert sur l'obscurite.
      px(ctx, 4, CAP + 4, 8, 9, tone('wood', 1));
      px(ctx, 5, CAP + 5, 6, 7, '#0f0d0b');
      px(ctx, 8, CAP + 5, 1, 7, tone('wood', 2));
      px(ctx, 5, CAP + 8, 6, 1, tone('wood', 2));
      px(ctx, 5, CAP + 5, 6, 1, tone('wood', 0));
    }

    // --- Couronnement : la tranche du mur, en vue de dessus.
    noiseFill(ctx, T, CAP, [tone('stone', 2), tone('stone', 3)], [2, 3], 55 + variant, 2);
    px(ctx, 0, 0, T, 1, tone('stone', 4)); // arete lointaine, en pleine lumiere
    px(ctx, 0, CAP - 2, T, 1, tone('stone', 1));
    px(ctx, 0, CAP - 1, T, 1, tone('stone', 0)); // arete proche, dans l'ombre
    // Joints de pierre, pour que la tranche ne soit pas un aplat.
    for (let x = (variant * 5) % 8; x < T; x += 8) px(ctx, x, 1, 1, CAP - 3, tone('stone', 1));

    // Ombre portee du couronnement sur la face.
    ditherGradientV(ctx, 2, CAP, T - 4, 5, tone('plaster', 1), tone('plaster', 0), 0.75, 0.0);
  });
}

/**
 * Toiture a deux pentes.
 *
 * C'est le defaut le plus visible d'un plan de toits uniformes : un batiment
 * coiffe d'un plan plat de tuiles identiques ne ressemble pas a une maison, il
 * ressemble a une boite. Ultima VII donne a ses villes leur silhouette par des
 * toitures a deux versants, avec faitage, rives et cheminees.
 *
 * On encode la position de chaque tuile dans la toiture :
 *  - `row` : 0 faitage, 1 versant haut, 2 versant bas, 3 egout ;
 *  - `col` : 0 rive ouest, 1 plein champ, 2 rive est.
 *
 * Le versant nord recoit plus de lumiere que le versant sud — c'est cette
 * difference de valeur de part et d'autre du faitage qui fait lire la pente.
 */
function roofSprite(row: number, col: number): Sprite {
  const shade = [4, 3, 2, 1][row] ?? 2;
  return makeSprite(T, T + 4, (ctx) => {
    // Rangs de tuiles decales, comme un vrai appareillage.
    ditherRect(ctx, 0, 4, T, T, tone('roof', shade - 1), tone('roof', shade), 0.45);
    for (let y = 4; y < T + 4; y += 4) {
      const offset = ((y - 4) / 4) % 2 === 0 ? 0 : 3;
      px(ctx, 0, y, T, 1, tone('roof', Math.max(0, shade - 2)));
      for (let x = offset; x < T; x += 6) {
        px(ctx, x, y + 1, 1, 3, tone('roof', Math.max(0, shade - 2)));
      }
    }

    if (row === 0) {
      // Faitiere : tuiles rondes en couronnement, la crete attrape la lumiere.
      px(ctx, 0, 1, T, 4, tone('roof', 2));
      px(ctx, 0, 1, T, 1, tone('roof', 4));
      px(ctx, 0, 4, T, 1, tone('roof', 0));
      for (let x = 1; x < T; x += 4) px(ctx, x, 2, 1, 2, tone('roof', 3));
    }

    if (row === 3) {
      // Egout : planche de rive et ombre portee sous le debord.
      px(ctx, 0, T + 1, T, 2, tone('wood', 1));
      px(ctx, 0, T + 1, T, 1, tone('wood', 2));
      px(ctx, 0, T + 3, T, 1, '#000000');
    }

    if (col === 0) {
      px(ctx, 0, 4, 2, T, tone('wood', 2)); // rive ouest, eclairee
      px(ctx, 0, 4, 1, T, tone('wood', 3));
    }
    if (col === 2) {
      px(ctx, T - 2, 4, 2, T, tone('wood', 0)); // rive est, a l'ombre
    }
  });
}

/** Cheminee de pierre, posee sur le faitage. */
function chimneySprite(): Sprite {
  const h = T * 2;
  return makeSprite(T, h, (ctx) => {
    const w = 9;
    const x = 4;
    ditherGradientV(ctx, x, 6, w, h - 6, tone('stone', 2), tone('stone', 3), 0.8, 0.2);
    px(ctx, x, 6, 1, h - 6, tone('stone', 4)); // arete eclairee
    px(ctx, x + w - 1, 6, 1, h - 6, tone('stone', 0));
    // Assises de pierre
    for (let y = 10; y < h; y += 5) px(ctx, x, y, w, 1, tone('stone', 1));
    // Couronnement et conduit
    px(ctx, x - 1, 3, w + 2, 4, tone('stone', 3));
    px(ctx, x - 1, 3, w + 2, 1, tone('stone', 4));
    px(ctx, x + 2, 4, w - 4, 3, '#0d0b09');
  });
}

function doorSprite(open: boolean): Sprite {
  const h = T * 2;
  return makeSprite(T, h, (ctx) => {
    if (open) {
      // Battant rabattu contre le montant, et l'interieur qui s'ouvre.
      px(ctx, 0, 0, 4, h, tone('wood', 1));
      px(ctx, 0, 0, 1, h, tone('wood', 3));
      ditherGradientV(ctx, 4, 0, T - 4, h, '#0a0908', tone('wood', 0), 0.0, 0.5);
      return;
    }
    ditherGradientV(ctx, 0, 0, T, h, tone('wood', 2), tone('wood', 3), 0.7, 0.2);
    // Planches verticales.
    for (let x = 2; x < T - 1; x += 4) px(ctx, x, 1, 1, h - 2, tone('wood', 1));
    // Ferrures et clous.
    for (const y of [5, h - 8]) {
      px(ctx, 1, y, T - 2, 2, tone('metal', 2));
      px(ctx, 1, y, T - 2, 1, tone('metal', 3));
      for (let x = 2; x < T - 2; x += 4) px(ctx, x, y, 1, 1, tone('metal', 4));
    }
    px(ctx, T - 5, h / 2, 2, 3, tone('gold', 3));
    px(ctx, T - 5, h / 2, 2, 1, tone('gold', 4));
    // Encadrement.
    px(ctx, 0, 0, 1, h, tone('wood', 4));
    px(ctx, T - 1, 0, 1, h, tone('wood', 0));
  });
}

// --- Vegetation -----------------------------------------------------------

/**
 * Arbre : masse feuillue construite en trois passes (ombre, corps, lumiere)
 * plutot qu'une ellipse unie, avec une silhouette irreguliere obtenue par
 * amas de disques.
 */
function treeSprite(seed: number, ramp: RampName = 'leaf', big = false): Sprite {
  const rng = new Rng(seed);
  const w = T + (big ? 20 : 12);
  const h = T * 3 + (big ? 20 : 8);
  return makeSprite(w, h, (ctx) => {
    const cx = w / 2;
    const trunkTop = h - 16;

    // Tronc, eclaire a gauche.
    const tw = big ? 8 : 6;
    ditherGradientV(ctx, cx - tw / 2, trunkTop, tw, 16, tone('wood', 1), tone('wood', 2), 0.6, 0.2);
    px(ctx, cx - tw / 2, trunkTop, 1, 16, tone('wood', 3));
    px(ctx, cx + tw / 2 - 1, trunkTop, 1, 16, tone('wood', 0));
    // Racines.
    px(ctx, cx - 5, h - 3, 3, 2, tone('wood', 1));
    px(ctx, cx + 2, h - 3, 3, 2, tone('wood', 1));

    const blob = (x: number, y: number, r: number, color: string): void => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const cy = trunkTop - (big ? 20 : 12);
    const s = big ? 1.45 : 1;
    // Passe 1 : masse d'ombre.
    for (let i = 0; i < 8; i++) {
      blob(cx + rng.int(-8, 8) * s, cy + rng.int(-8, 8) * s, rng.int(7, 10) * s, tone(ramp, 1));
    }
    // Passe 2 : corps, decale vers le haut a gauche.
    for (let i = 0; i < 8; i++) {
      blob(cx - 2 * s + rng.int(-6, 6) * s, cy - 3 * s + rng.int(-6, 6) * s, rng.int(5, 8) * s, tone(ramp, 2));
    }
    // Passe 3 : hautes lumieres, franchement en haut a gauche.
    for (let i = 0; i < 6; i++) {
      blob(cx - 5 * s + rng.int(-4, 4) * s, cy - 7 * s + rng.int(-4, 4) * s, rng.int(3, 5) * s, tone(ramp, 3));
    }
    for (let i = 0; i < 20; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = rng.int(2, 9) * s;
      px(ctx, Math.round(cx - 5 * s + Math.cos(a) * d), Math.round(cy - 7 * s + Math.sin(a) * d), 1, 1, tone(ramp, 4));
    }
    // Bordure basse-droite assombrie : la mise en volume.
    for (let i = 0; i < 16; i++) {
      const a = rng.next() * Math.PI * 0.7 + Math.PI * 0.1;
      const d = rng.int(8, 13) * s;
      px(ctx, Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1, tone(ramp, 0));
    }
  });
}

function bushSprite(seed: number): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    const cx = T / 2;
    const cy = T - 6;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = tone('leaf', 1);
      ctx.beginPath();
      ctx.arc(cx + rng.int(-4, 4), cy + rng.int(-2, 2), rng.int(3, 5), 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = tone('leaf', 3);
      ctx.beginPath();
      ctx.arc(cx - 2 + rng.int(-2, 2), cy - 2 + rng.int(-2, 2), rng.int(2, 3), 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 4; i++) {
      px(ctx, cx - 4 + rng.int(0, 8), cy - 4 + rng.int(0, 6), 1, 1, tone('leaf', 4));
    }
  });
}

// --- Menu decor de sol ----------------------------------------------------

function flowerSprite(variant: number): Sprite {
  const ramps: RampName[] = ['blood', 'gold', 'cloth'];
  const ramp = ramps[variant % ramps.length]!;
  return makeSprite(T, T, (ctx) => {
    px(ctx, 8, 10, 1, 4, tone('leaf', 2));
    px(ctx, 7, 12, 1, 1, tone('leaf', 3));
    px(ctx, 7, 8, 3, 3, tone(ramp, 3));
    px(ctx, 7, 8, 2, 2, tone(ramp, 4));
    px(ctx, 9, 10, 1, 1, tone(ramp, 1));
  });
}

function pebbleSprite(seed: number): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    for (let i = 0; i < 3; i++) {
      const x = rng.int(3, T - 5);
      const y = rng.int(8, T - 3);
      px(ctx, x, y, 2, 2, tone('stone', 2));
      px(ctx, x, y, 1, 1, tone('stone', 4));
    }
  });
}

function tuftSprite(seed: number): Sprite {
  const rng = new Rng(seed);
  return makeSprite(T, T, (ctx) => {
    for (let i = 0; i < 5; i++) {
      const x = rng.int(2, T - 3);
      const y = rng.int(9, T - 3);
      const height = rng.int(2, 4);
      px(ctx, x, y - height, 1, height, tone('grass', 3));
      px(ctx, x, y - height, 1, 1, tone('grass', 4));
    }
  });
}

function mushroomSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    px(ctx, 7, 11, 2, 3, tone('linen', 3));
    px(ctx, 5, 8, 6, 3, tone('blood', 3));
    px(ctx, 5, 8, 4, 2, tone('blood', 4));
    px(ctx, 6, 9, 1, 1, tone('linen', 4));
  });
}

// --- Mobilier -------------------------------------------------------------

function tableSprite(): Sprite {
  return makeSprite(T, T + 6, (ctx) => {
    ditherRect(ctx, 1, 3, T - 2, 8, tone('wood', 2), tone('wood', 3), 0.5);
    px(ctx, 1, 3, T - 2, 1, tone('wood', 4));
    px(ctx, 1, 10, T - 2, 1, tone('wood', 0));
    for (let x = 3; x < T - 2; x += 4) px(ctx, x, 4, 1, 6, tone('wood', 1));
    px(ctx, 2, 11, 2, 7, tone('wood', 1));
    px(ctx, T - 4, 11, 2, 7, tone('wood', 0));
    px(ctx, 2, 11, 1, 7, tone('wood', 2));
  });
}

function chairSprite(): Sprite {
  return makeSprite(T, T + 6, (ctx) => {
    ditherRect(ctx, 4, 1, 8, 9, tone('wood', 1), tone('wood', 2), 0.5);
    px(ctx, 4, 1, 8, 1, tone('wood', 3));
    px(ctx, 6, 3, 1, 6, tone('wood', 0));
    px(ctx, 9, 3, 1, 6, tone('wood', 0));
    px(ctx, 3, 10, 10, 3, tone('wood', 3));
    px(ctx, 3, 10, 10, 1, tone('wood', 4));
    px(ctx, 4, 13, 2, 6, tone('wood', 1));
    px(ctx, 10, 13, 2, 6, tone('wood', 0));
  });
}

function bedSprite(): Sprite {
  // Deux tuiles sur deux, comme le lit a baldaquin : la tete est au nord,
  // l'oreiller en haut, la couverture rabattue vers le sud.
  const W = T * 2;
  const H = T * 2;
  return makeSprite(W, H, (ctx) => {
    // Cadre
    ditherRect(ctx, 0, 1, W, H - 2, tone('wood', 1), tone('wood', 2), 0.4);
    px(ctx, 0, 1, W, 1, tone('wood', 3));
    // Matelas
    ditherRect(ctx, 2, 4, W - 4, H - 9, tone('linen', 3), tone('linen', 4), 0.5);
    // Oreiller
    px(ctx, 4, 5, W - 8, 6, tone('linen', 4));
    px(ctx, 4, 5, W - 8, 1, '#d8d0bc');
    px(ctx, 4, 10, W - 8, 1, tone('linen', 2));
    // Couverture, plis tramés
    ditherRect(ctx, 2, H / 2 + 1, W - 4, H / 2 - 6, tone('blood', 2), tone('blood', 3), 0.5);
    px(ctx, 2, H / 2 + 1, W - 4, 1, tone('blood', 4));
    for (let y = H / 2 + 3; y < H - 5; y += 3) px(ctx, 3, y, W - 6, 1, tone('blood', 1));
    // Montants
    px(ctx, 0, 0, 2, 4, tone('wood', 2));
    px(ctx, W - 2, 0, 2, 4, tone('wood', 1));
  });
}

function chestSprite(open: boolean): Sprite {
  return makeSprite(T, T + 2, (ctx) => {
    const bodyTop = open ? 8 : 6;
    ditherRect(ctx, 1, bodyTop, T - 2, 16 - bodyTop + 2, tone('wood', 2), tone('wood', 3), 0.45);
    px(ctx, 1, bodyTop, T - 2, 1, tone('wood', 4));
    px(ctx, 1, 16, T - 2, 1, tone('wood', 0));
    // Cerclages
    px(ctx, 3, bodyTop, 2, 17 - bodyTop, tone('metal', 2));
    px(ctx, T - 5, bodyTop, 2, 17 - bodyTop, tone('metal', 1));
    if (open) {
      // Couvercle rabattu vers l'arriere, interieur sombre.
      px(ctx, 1, 1, T - 2, 5, tone('wood', 1));
      px(ctx, 1, 1, T - 2, 1, tone('wood', 3));
      px(ctx, 2, 6, T - 4, 3, '#0d0b09');
    } else {
      px(ctx, 1, 3, T - 2, 4, tone('wood', 3));
      px(ctx, 1, 3, T - 2, 1, tone('wood', 4));
      px(ctx, 1, 7, T - 2, 1, tone('wood', 0));
      px(ctx, T / 2 - 1, 6, 3, 4, tone('gold', 3));
      px(ctx, T / 2 - 1, 6, 3, 1, tone('gold', 4));
    }
  });
}

function barrelSprite(): Sprite {
  return makeSprite(T, T + 4, (ctx) => {
    ditherGradientV(ctx, 3, 3, 10, 16, tone('wood', 2), tone('wood', 3), 0.8, 0.15);
    // Douves
    for (let x = 4; x < 12; x += 3) px(ctx, x, 4, 1, 14, tone('wood', 1));
    // Cerclages
    for (const y of [6, 14]) {
      px(ctx, 3, y, 10, 2, tone('metal', 2));
      px(ctx, 3, y, 10, 1, tone('metal', 3));
    }
    // Dessus
    px(ctx, 3, 2, 10, 2, tone('wood', 4));
    px(ctx, 4, 2, 8, 1, tone('wood', 3));
    px(ctx, 12, 4, 1, 14, tone('wood', 0));
  });
}

function crateSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    ditherRect(ctx, 2, 4, 12, 11, tone('wood', 2), tone('wood', 3), 0.4);
    px(ctx, 2, 4, 12, 1, tone('wood', 4));
    px(ctx, 2, 14, 12, 1, tone('wood', 0));
    px(ctx, 13, 4, 1, 11, tone('wood', 0));
    px(ctx, 2, 8, 12, 1, tone('wood', 1));
    px(ctx, 7, 4, 1, 11, tone('wood', 1));
  });
}

/**
 * Bibliotheque : le meuble qui remplit un mur.
 *
 * Les interieurs d'Ultima VII sont encombres ; les miens etaient de grandes
 * pieces vides. Un meuble haut adosse a un mur change immediatement la lecture
 * d'une piece, parce qu'il donne une elevation a autre chose que les murs.
 */
function bookshelfSprite(seed: number): Sprite {
  const rng = new Rng(seed);
  const h = T + 14;
  return makeSprite(T, h, (ctx) => {
    ditherRect(ctx, 0, 0, T, h - 2, tone('wood', 1), tone('wood', 2), 0.4);
    px(ctx, 0, 0, T, 1, tone('wood', 3));
    px(ctx, T - 1, 0, 1, h - 2, tone('wood', 0));
    // Trois etageres garnies de livres de largeurs variables.
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 3 + shelf * 9;
      px(ctx, 1, y + 7, T - 2, 1, tone('wood', 0));
      let x = 2;
      while (x < T - 3) {
        const w = rng.int(1, 3);
        const ramps: RampName[] = ['blood', 'leaf', 'royal', 'gold', 'cloth'];
        const ramp = ramps[rng.int(0, ramps.length - 1)]!;
        px(ctx, x, y + 1, w, 6, tone(ramp, 2));
        px(ctx, x, y + 1, w, 1, tone(ramp, 3));
        x += w + 1;
      }
    }
    px(ctx, 0, h - 2, T, 2, tone('wood', 0));
  });
}

/**
 * Tapis de 3x2 tuiles.
 *
 * Le premier jet posait trois tapis d'une tuile cote a cote : le motif se
 * repetait a l'identique et l'ensemble se lisait comme du carrelage, pas comme
 * un tapis. Un objet unique de 3x2 a un galon qui fait le tour et un motif
 * central unique — c'est-a-dire qu'il ressemble a un tapis.
 *
 * Le sprite est ancre sur le coin bas-droit de l'emprise, comme tous les
 * autres : il s'etend donc vers le nord-ouest.
 */
function rugSprite(): Sprite {
  const W = T * 3;
  const H = T * 2;
  return makeSprite(W, H, (ctx) => {
    ditherRect(ctx, 0, 0, W, H, tone('blood', 1), tone('blood', 2), 0.5);
    px(ctx, 0, 0, W, 1, tone('blood', 3));
    px(ctx, 0, H - 1, W, 1, tone('blood', 0));
    px(ctx, W - 1, 0, 1, H, tone('blood', 0));

    // Galon exterieur, puis interieur.
    for (const inset of [3, 6]) {
      px(ctx, inset, inset, W - inset * 2, 1, tone('gold', 2));
      px(ctx, inset, H - inset - 1, W - inset * 2, 1, tone('gold', 2));
      px(ctx, inset, inset, 1, H - inset * 2, tone('gold', 2));
      px(ctx, W - inset - 1, inset, 1, H - inset * 2, tone('gold', 2));
    }

    // Medaillon central.
    const cx = W / 2;
    const cy = H / 2;
    ctx.fillStyle = tone('gold', 2);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tone('blood', 0);
    ctx.beginPath();
    ctx.ellipse(cx, cy, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, cx - 2, cy - 1, 4, 2, tone('gold', 3));

    // Franges aux deux extremites.
    for (let x = 1; x < W; x += 3) {
      px(ctx, x, 0, 1, 2, tone('linen', 3));
      px(ctx, x, H - 2, 1, 2, tone('linen', 2));
    }
  });
}

/** Table de banquet, 2x1 tuiles : le meuble central d'une salle commune. */
function longTableSprite(): Sprite {
  const W = T * 2;
  return makeSprite(W, T + 6, (ctx) => {
    ditherRect(ctx, 1, 3, W - 2, 8, tone('wood', 2), tone('wood', 3), 0.5);
    px(ctx, 1, 3, W - 2, 1, tone('wood', 4));
    px(ctx, 1, 10, W - 2, 1, tone('wood', 0));
    for (let x = 3; x < W - 2; x += 5) px(ctx, x, 4, 1, 6, tone('wood', 1));
    // Quatre pieds plutot que deux : c'est ce qui distingue une table longue
    // d'une table carree etiree.
    for (const x of [2, W - 4]) {
      px(ctx, x, 11, 2, 7, tone('wood', 1));
      px(ctx, x, 11, 1, 7, tone('wood', 2));
    }
    px(ctx, W / 2 - 1, 11, 2, 7, tone('wood', 0));
  });
}

/** Lit a baldaquin, 2x2 tuiles. */
function canopyBedSprite(): Sprite {
  const W = T * 2;
  const H = T * 3;
  return makeSprite(W, H, (ctx) => {
    // Ciel de lit, porte par quatre colonnes.
    px(ctx, 0, 0, W, 4, tone('cloth', 2));
    px(ctx, 0, 0, W, 1, tone('cloth', 3));
    px(ctx, 0, 3, W, 1, tone('cloth', 0));
    for (const x of [1, W - 4]) {
      px(ctx, x, 4, 3, H - 6, tone('wood', 1));
      px(ctx, x, 4, 1, H - 6, tone('wood', 3));
    }
    // Tentures retenues aux colonnes.
    px(ctx, 4, 4, 3, H - 14, tone('cloth', 1));
    px(ctx, W - 7, 4, 3, H - 14, tone('cloth', 1));

    // Couche.
    ditherRect(ctx, 7, 10, W - 14, H - 16, tone('linen', 3), tone('linen', 4), 0.5);
    px(ctx, 7, 10, W - 14, 7, tone('linen', 4)); // oreillers
    px(ctx, 7, 17, W - 14, 1, tone('linen', 1));
    ditherRect(ctx, 7, H - 14, W - 14, 9, tone('royal', 1), tone('royal', 2), 0.5);
    px(ctx, 7, H - 14, W - 14, 1, tone('royal', 3));
    px(ctx, 4, H - 5, W - 8, 3, tone('wood', 1));
  });
}

/** Puits, 2x2 tuiles : le point de repere d'une place de village. */
function wellSprite(): Sprite {
  const W = T * 2;
  const H = T * 2 + 12;
  return makeSprite(W, H, (ctx) => {
    // Toiture du puits.
    px(ctx, 2, 2, W - 4, 6, tone('roof', 2));
    px(ctx, 2, 2, W - 4, 1, tone('roof', 4));
    px(ctx, 2, 7, W - 4, 1, tone('roof', 0));
    px(ctx, W / 2 - 1, 0, 2, 3, tone('wood', 2));
    // Montants.
    px(ctx, 4, 8, 3, 14, tone('wood', 1));
    px(ctx, 4, 8, 1, 14, tone('wood', 3));
    px(ctx, W - 7, 8, 3, 14, tone('wood', 0));
    // Treuil et corde.
    px(ctx, 5, 13, W - 10, 3, tone('wood', 2));
    px(ctx, 5, 13, W - 10, 1, tone('wood', 3));
    px(ctx, W / 2, 16, 1, 8, tone('linen', 2));
    px(ctx, W / 2 - 2, 24, 5, 4, tone('wood', 1));

    // Margelle de pierre.
    const top = H - 14;
    ditherRect(ctx, 3, top, W - 6, 12, tone('stone', 2), tone('stone', 3), 0.45);
    px(ctx, 3, top, W - 6, 2, tone('stone', 4));
    px(ctx, 3, H - 2, W - 6, 2, tone('stone', 0));
    for (let x = 6; x < W - 4; x += 6) px(ctx, x, top + 2, 1, 8, tone('stone', 1));
    // Gueule du puits.
    ctx.fillStyle = '#0a0908';
    ctx.beginPath();
    ctx.ellipse(W / 2, top + 5, W / 2 - 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Charrette, 2x2 tuiles. */
function cartSprite(): Sprite {
  const W = T * 2;
  const H = T * 2;
  return makeSprite(W, H, (ctx) => {
    // Timon.
    px(ctx, W / 2 - 1, 0, 2, 8, tone('wood', 2));
    // Caisse.
    ditherRect(ctx, 3, 7, W - 6, H - 14, tone('wood', 2), tone('wood', 3), 0.45);
    px(ctx, 3, 7, W - 6, 1, tone('wood', 4));
    px(ctx, W - 4, 8, 1, H - 15, tone('wood', 0));
    for (let x = 6; x < W - 4; x += 5) px(ctx, x, 8, 1, H - 16, tone('wood', 1));
    // Chargement : sacs et foin.
    px(ctx, 6, 9, 7, 5, tone('linen', 2));
    px(ctx, 6, 9, 5, 1, tone('linen', 3));
    px(ctx, 15, 10, 8, 4, tone('gold', 2));
    // Roues.
    for (const cx of [6, W - 7]) {
      ctx.fillStyle = tone('wood', 1);
      ctx.beginPath();
      ctx.arc(cx, H - 6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tone('wood', 3);
      ctx.beginPath();
      ctx.arc(cx, H - 6, 2, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, cx - 5, H - 7, 10, 1, tone('wood', 0));
    }
  });
}

/** Plante en pot : de la verticale et du vivant dans une piece. */
function potSprite(): Sprite {
  return makeSprite(T, T + 6, (ctx) => {
    // Feuillage
    for (const [x, y, w, h] of [[6, 2, 2, 8], [3, 4, 2, 6], [10, 4, 2, 6], [8, 1, 2, 7]] as Array<
      [number, number, number, number]
    >) {
      px(ctx, x, y, w, h, tone('leaf', 2));
      px(ctx, x, y, w, 2, tone('leaf', 3));
    }
    // Pot en terre cuite
    ditherRect(ctx, 4, 11, 8, 8, tone('sand', 1), tone('sand', 2), 0.5);
    px(ctx, 3, 10, 10, 2, tone('sand', 3));
    px(ctx, 3, 10, 8, 1, tone('sand', 4));
    px(ctx, 11, 12, 1, 7, tone('sand', 0));
  });
}

function stoolSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    px(ctx, 4, 7, 8, 3, tone('wood', 3));
    px(ctx, 4, 7, 8, 1, tone('wood', 4));
    px(ctx, 5, 10, 2, 5, tone('wood', 1));
    px(ctx, 9, 10, 2, 5, tone('wood', 0));
  });
}

/** Vaisselle posee sur une table : le detail qui fait « habite ». */
function dishesSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    ctx.fillStyle = tone('linen', 3);
    ctx.beginPath();
    ctx.ellipse(6, 10, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 3, 9, 3, 1, tone('linen', 4));
    px(ctx, 5, 10, 2, 1, tone('linen', 1));
    // Bouteille
    px(ctx, 11, 6, 2, 4, tone('leaf', 1));
    px(ctx, 10, 9, 4, 6, tone('leaf', 2));
    px(ctx, 10, 9, 1, 6, tone('leaf', 3));
  });
}

/** Applique murale : une source de lumiere qui a une forme. */
function sconceSprite(lit: boolean): Sprite {
  return makeSprite(T, T, (ctx) => {
    px(ctx, 6, 8, 4, 6, tone('metal', 1));
    px(ctx, 6, 8, 1, 6, tone('metal', 3));
    px(ctx, 5, 13, 6, 2, tone('metal', 2));
    if (lit) {
      px(ctx, 6, 3, 4, 6, tone('fire', 1));
      px(ctx, 7, 1, 2, 7, tone('fire', 3));
      px(ctx, 7, 0, 2, 3, tone('fire', 4));
    }
  });
}

/**
 * Barriere de bois. Se pose en enfilade : les traverses touchent les bords de
 * la tuile pour que deux barrieres voisines se raccordent.
 */
function fenceSprite(): Sprite {
  const h = T + 8;
  return makeSprite(T, h, (ctx) => {
    // Traverses, d'un bord a l'autre.
    for (const y of [8, 15]) {
      px(ctx, 0, y, T, 3, tone('wood', 2));
      px(ctx, 0, y, T, 1, tone('wood', 3));
      px(ctx, 0, y + 2, T, 1, tone('wood', 0));
    }
    // Poteau, decale du bord pour ne pas doubler avec le voisin.
    px(ctx, 3, 4, 4, h - 6, tone('wood', 1));
    px(ctx, 3, 4, 1, h - 6, tone('wood', 3));
    px(ctx, 6, 4, 1, h - 6, tone('wood', 0));
    px(ctx, 3, 4, 4, 1, tone('wood', 4));
  });
}

/** Ecu accroche au mur : trophee, et tache de couleur en hauteur. */
function shieldSprite(variant: number): Sprite {
  const ramps: RampName[] = ['royal', 'blood', 'leaf'];
  const ramp = ramps[variant % ramps.length]!;
  return makeSprite(T, T, (ctx) => {
    ctx.fillStyle = tone('metal', 2);
    ctx.beginPath();
    ctx.moveTo(3, 3);
    ctx.lineTo(13, 3);
    ctx.lineTo(13, 9);
    ctx.lineTo(8, 14);
    ctx.lineTo(3, 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tone(ramp, 2);
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.lineTo(12, 4);
    ctx.lineTo(12, 9);
    ctx.lineTo(8, 13);
    ctx.lineTo(4, 9);
    ctx.closePath();
    ctx.fill();
    px(ctx, 4, 4, 5, 1, tone(ramp, 3));
    px(ctx, 7, 6, 2, 5, tone('gold', 3)); // meuble heraldique
    px(ctx, 5, 8, 6, 1, tone('gold', 3));
    px(ctx, 11, 6, 1, 4, tone(ramp, 0));
  });
}

/** Jambon suspendu : le detail qui fait qu'une cuisine est une cuisine. */
function hamSprite(): Sprite {
  return makeSprite(T, T + 4, (ctx) => {
    px(ctx, 8, 0, 1, 5, tone('metal', 2)); // crochet
    ctx.fillStyle = tone('blood', 2);
    ctx.beginPath();
    ctx.ellipse(8, 11, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tone('blood', 3);
    ctx.beginPath();
    ctx.ellipse(6, 9, 3, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 7, 4, 3, 3, tone('linen', 3)); // couenne
    px(ctx, 7, 17, 2, 2, tone('linen', 1)); // os
  });
}

/** Sac de grain : encombre les reserves sans coûter cher a dessiner. */
function sackSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    ditherRect(ctx, 3, 6, 10, 9, tone('linen', 2), tone('linen', 3), 0.5);
    px(ctx, 3, 6, 10, 1, tone('linen', 4));
    px(ctx, 12, 7, 1, 8, tone('linen', 1));
    px(ctx, 5, 3, 6, 4, tone('linen', 2));
    px(ctx, 5, 3, 4, 1, tone('linen', 3));
    px(ctx, 6, 2, 4, 1, tone('wood', 2)); // lien
  });
}

function bagSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    ditherRect(ctx, 4, 7, 8, 8, tone('linen', 2), tone('linen', 3), 0.5);
    px(ctx, 4, 7, 8, 1, tone('linen', 4));
    px(ctx, 11, 8, 1, 7, tone('linen', 1));
    px(ctx, 5, 5, 6, 3, tone('linen', 1));
    px(ctx, 6, 4, 4, 1, tone('wood', 2));
  });
}

function anvilSprite(): Sprite {
  return makeSprite(T, T, (ctx) => {
    px(ctx, 2, 5, 12, 4, tone('metal', 2));
    px(ctx, 2, 5, 12, 1, tone('metal', 4));
    px(ctx, 2, 8, 12, 1, tone('metal', 0));
    px(ctx, 0, 6, 3, 2, tone('metal', 2)); // corne
    px(ctx, 5, 9, 6, 4, tone('metal', 1));
    px(ctx, 4, 13, 8, 2, tone('metal', 2));
    px(ctx, 4, 13, 8, 1, tone('metal', 3));
  });
}

function signSprite(): Sprite {
  return makeSprite(T, T + 10, (ctx) => {
    px(ctx, 7, 12, 2, 14, tone('wood', 1));
    px(ctx, 7, 12, 1, 14, tone('wood', 2));
    // Potence
    px(ctx, 3, 2, 10, 2, tone('wood', 2));
    ditherRect(ctx, 2, 4, 12, 9, tone('wood', 2), tone('wood', 3), 0.5);
    px(ctx, 2, 4, 12, 1, tone('wood', 4));
    px(ctx, 2, 12, 12, 1, tone('wood', 0));
    // Inscription illisible, comme dans le jeu d'origine.
    px(ctx, 4, 7, 8, 1, tone('wood', 0));
    px(ctx, 4, 9, 5, 1, tone('wood', 0));
  });
}

function lamppostSprite(lit: boolean): Sprite {
  return makeSprite(T, T * 2, (ctx) => {
    const h = T * 2;
    px(ctx, 7, 9, 2, h - 9, tone('metal', 1));
    px(ctx, 7, 9, 1, h - 9, tone('metal', 2));
    px(ctx, 5, h - 2, 6, 2, tone('metal', 0));
    // Lanterne. Eteinte, le verre doit rester du verre : un carre noir se lit
    // comme un trou dans le decor, pas comme une lampe au repos.
    px(ctx, 4, 2, 8, 8, tone('metal', 2));
    if (lit) {
      px(ctx, 5, 3, 6, 6, tone('fire', 4));
      px(ctx, 6, 4, 4, 4, '#fff3c4');
      px(ctx, 5, 3, 6, 1, tone('fire', 3));
    } else {
      px(ctx, 5, 3, 6, 6, tone('metal', 3));
      px(ctx, 5, 3, 3, 3, tone('metal', 4)); // reflet sur la vitre
      px(ctx, 8, 6, 3, 3, tone('metal', 1));
    }
    px(ctx, 4, 1, 8, 2, tone('metal', 3));
    px(ctx, 7, 0, 2, 1, tone('metal', 2));
  });
}

/** Atre : trois frames de flamme, plus une frame de braises couvertes. */
function hearthSprite(state: number): Sprite {
  return makeSprite(T, T + 8, (ctx) => {
    // Manteau de pierre
    ditherRect(ctx, 0, 4, T, 20, tone('stone', 2), tone('stone', 3), 0.4);
    px(ctx, 0, 4, T, 1, tone('stone', 4));
    px(ctx, 0, 23, T, 1, tone('stone', 0));
    // Foyer
    px(ctx, 3, 9, 10, 14, '#120e0b');

    if (state === 3) {
      // Braises couvertes
      px(ctx, 5, 19, 6, 3, tone('fire', 1));
      px(ctx, 6, 20, 4, 1, tone('fire', 2));
      return;
    }

    // Flammes, silhouette variable selon la frame
    const spread = [0, 1, 0][state] ?? 0;
    px(ctx, 5 - spread, 15, 6 + spread * 2, 7, tone('fire', 1));
    px(ctx, 5, 13 - spread, 6, 8, tone('fire', 2));
    px(ctx, 6, 11 - spread, 4, 7, tone('fire', 3));
    px(ctx, 7, 10 - spread, 2, 4, tone('fire', 4));
    px(ctx, 4, 21, 8, 2, tone('fire', 0));
  });
}

// --- Petits objets --------------------------------------------------------

function smallItem(draw: (ctx: Ctx2D) => void): Sprite {
  return makeSprite(T, T, draw);
}

const itemPainters: Record<string, (ctx: Ctx2D) => void> = {
  // Le grimoire : un livre ferme, tranche doree, vu de trois quarts. Ce qui le
  // distingue d'une simple boite est l'epaisseur des pages sur le cote.
  spellbook: (ctx) => {
    px(ctx, 3, 5, 10, 8, tone('royal', 1));
    px(ctx, 3, 5, 10, 1, tone('royal', 3));
    px(ctx, 4, 6, 8, 6, tone('royal', 2));
    px(ctx, 12, 6, 2, 6, tone('sand', 3)); // tranche des pages
    px(ctx, 12, 6, 2, 1, tone('sand', 4));
    px(ctx, 6, 8, 4, 1, tone('gold', 3)); // fermoir
    px(ctx, 7, 7, 2, 3, tone('gold', 4));
    px(ctx, 3, 12, 10, 1, tone('royal', 0));
  },
  // Les quatre reactifs se distinguent par la **silhouette** autant que par la
  // couleur : a seize pixels, deux taches de teintes voisines se confondent.
  ginseng: (ctx) => {
    px(ctx, 7, 6, 2, 6, tone('sand', 2)); // racine fourchue
    px(ctx, 5, 10, 2, 3, tone('sand', 1));
    px(ctx, 9, 10, 2, 3, tone('sand', 1));
    px(ctx, 7, 6, 1, 6, tone('sand', 3));
    px(ctx, 6, 4, 4, 2, tone('leaf', 3)); // feuilles
    px(ctx, 5, 3, 2, 2, tone('leaf', 2));
    px(ctx, 9, 3, 2, 2, tone('leaf', 2));
  },
  soufre: (ctx) => {
    // Un tas de cristaux jaunes, anguleux : rien d'autre dans le jeu n'a cette
    // silhouette en dents de scie.
    px(ctx, 4, 10, 8, 3, tone('gold', 1));
    px(ctx, 5, 8, 2, 3, tone('gold', 3));
    px(ctx, 8, 7, 2, 4, tone('gold', 4));
    px(ctx, 10, 9, 2, 2, tone('gold', 2));
    px(ctx, 4, 12, 8, 1, tone('gold', 0));
  },
  perle: (ctx) => {
    ctx.fillStyle = tone('stone', 0);
    ctx.beginPath();
    ctx.arc(8, 10, 3, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 6, 8, 2, 2, tone('royal', 2)); // reflet froid, pas un blanc
    px(ctx, 7, 8, 1, 1, tone('cloth', 4));
  },
  racine: (ctx) => {
    // Mandragore : un corps trapu et deux jambes, la forme qu'on lui prete.
    px(ctx, 6, 5, 4, 5, tone('wood', 1));
    px(ctx, 6, 5, 4, 1, tone('wood', 2));
    px(ctx, 5, 10, 2, 3, tone('wood', 0));
    px(ctx, 9, 10, 2, 3, tone('wood', 0));
    px(ctx, 4, 6, 2, 2, tone('wood', 0));
    px(ctx, 10, 6, 2, 2, tone('wood', 0));
    px(ctx, 6, 3, 4, 2, tone('leaf', 2));
  },
  bread: (ctx) => {
    ctx.fillStyle = tone('sand', 2);
    ctx.beginPath();
    ctx.ellipse(8, 10, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tone('sand', 3);
    ctx.beginPath();
    ctx.ellipse(7, 9, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 5, 8, 6, 1, tone('dirt', 1));
    px(ctx, 6, 7, 4, 1, tone('sand', 4));
  },
  apple: (ctx) => {
    ctx.fillStyle = tone('blood', 2);
    ctx.beginPath();
    ctx.arc(8, 10, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tone('blood', 3);
    ctx.beginPath();
    ctx.arc(7, 9, 3, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 6, 8, 2, 1, tone('blood', 4));
    px(ctx, 8, 5, 1, 3, tone('wood', 1));
    px(ctx, 9, 5, 2, 1, tone('leaf', 3));
  },
  ale: (ctx) => {
    ditherRect(ctx, 5, 6, 6, 9, tone('gold', 2), tone('gold', 3), 0.5);
    px(ctx, 5, 4, 6, 3, tone('linen', 4));
    px(ctx, 5, 4, 5, 1, '#efe8d4');
    px(ctx, 10, 7, 1, 8, tone('gold', 1));
    px(ctx, 11, 8, 2, 1, tone('metal', 2));
    px(ctx, 12, 9, 1, 3, tone('metal', 2));
    px(ctx, 11, 12, 2, 1, tone('metal', 2));
  },
  gold: (ctx) => {
    for (const [x, y] of [[6, 11], [9, 10], [7, 8]] as Array<[number, number]>) {
      ctx.fillStyle = tone('gold', 2);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, x - 2, y - 2, 2, 1, tone('gold', 4));
      px(ctx, x - 1, y + 1, 2, 1, tone('gold', 1));
    }
  },
  key: (ctx) => {
    px(ctx, 6, 9, 7, 2, tone('gold', 2));
    px(ctx, 6, 9, 7, 1, tone('gold', 3));
    px(ctx, 3, 7, 4, 5, tone('gold', 2));
    px(ctx, 4, 8, 2, 3, '#0d0b09');
    px(ctx, 12, 11, 1, 3, tone('gold', 2));
    px(ctx, 10, 11, 1, 2, tone('gold', 2));
  },
  sword: (ctx) => {
    ditherRect(ctx, 7, 1, 2, 10, tone('metal', 3), tone('metal', 4), 0.5);
    px(ctx, 7, 1, 1, 10, '#c8ccd4');
    px(ctx, 8, 11, 1, 1, tone('metal', 2));
    px(ctx, 4, 11, 8, 2, tone('gold', 2));
    px(ctx, 4, 11, 8, 1, tone('gold', 3));
    px(ctx, 7, 13, 2, 3, tone('wood', 1));
    px(ctx, 7, 15, 2, 1, tone('gold', 3));
  },
  dagger: (ctx) => {
    ditherRect(ctx, 7, 4, 2, 7, tone('metal', 3), tone('metal', 4), 0.5);
    px(ctx, 7, 4, 1, 7, '#c8ccd4');
    px(ctx, 5, 11, 6, 1, tone('metal', 1));
    px(ctx, 7, 12, 2, 3, tone('wood', 1));
    px(ctx, 7, 14, 2, 1, tone('metal', 2));
  },
  hammer: (ctx) => {
    px(ctx, 3, 3, 9, 5, tone('metal', 2));
    px(ctx, 3, 3, 9, 1, tone('metal', 4));
    px(ctx, 3, 7, 9, 1, tone('metal', 0));
    px(ctx, 7, 8, 2, 8, tone('wood', 2));
    px(ctx, 7, 8, 1, 8, tone('wood', 3));
  },
  torch: (ctx) => {
    px(ctx, 7, 7, 2, 9, tone('wood', 1));
    px(ctx, 7, 7, 1, 9, tone('wood', 2));
    px(ctx, 5, 4, 6, 4, tone('fire', 1));
    px(ctx, 6, 2, 4, 4, tone('fire', 3));
    px(ctx, 7, 1, 2, 3, tone('fire', 4));
  },
  lute: (ctx) => {
    ctx.fillStyle = tone('wood', 2);
    ctx.beginPath();
    ctx.ellipse(7, 11, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tone('wood', 3);
    ctx.beginPath();
    ctx.ellipse(6, 10, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 6, 11, 2, 2, '#0d0b09');
    px(ctx, 9, 2, 2, 9, tone('wood', 1));
    px(ctx, 9, 1, 3, 2, tone('wood', 2));
    px(ctx, 7, 6, 1, 6, tone('linen', 4));
  },
};

// --- Acteurs --------------------------------------------------------------

interface ActorPalette {
  skinLevel: number;
  hair: RampName;
  hairLevel: number;
  tunic: RampName;
  legs: RampName;
  accent: RampName;
}

const actorPalettes: Record<string, ActorPalette> = {
  avatar: { skinLevel: 3, hair: 'wood', hairLevel: 1, tunic: 'royal', legs: 'metal', accent: 'gold' },
  townsman: { skinLevel: 2, hair: 'wood', hairLevel: 2, tunic: 'leaf', legs: 'wood', accent: 'linen' },
  townswoman: { skinLevel: 4, hair: 'fire', hairLevel: 1, tunic: 'cloth', legs: 'cloth', accent: 'linen' },
  guard: { skinLevel: 2, hair: 'metal', hairLevel: 0, tunic: 'metal', legs: 'metal', accent: 'metal' },
  smith: { skinLevel: 1, hair: 'wood', hairLevel: 0, tunic: 'blood', legs: 'wood', accent: 'metal' },
  brigand: { skinLevel: 1, hair: 'stone', hairLevel: 0, tunic: 'dirt', legs: 'leaf', accent: 'blood' },
};

/**
 * Sprite d'acteur : 16x26, ancre en bas.
 *
 * Trois choses font qu'un personnage minuscule « existe » : une silhouette
 * lisible (epaules plus larges que la tete), un contour assombri sur le cote
 * oppose a la lumiere, et une vraie pose de marche — bras et jambes en
 * opposition, pas seulement decales.
 */
function actorSprite(p: ActorPalette, dir: number, pose: number): Sprite {
  const H = 26;
  return makeSprite(T, H, (ctx) => {
    const back = dir === 0;
    const side = dir === 1 || dir === 3;
    const facingEast = dir === 1;
    const swing = pose === 1 ? 1 : -1;

    const skin = (l: number) => tone('skin', p.skinLevel + l);

    // Jambes en opposition.
    const legY = 19;
    px(ctx, 6, legY + (swing > 0 ? 0 : 1), 2, 7 - (swing > 0 ? 0 : 1), tone(p.legs, 1));
    px(ctx, 9, legY + (swing > 0 ? 1 : 0), 2, 7 - (swing > 0 ? 1 : 0), tone(p.legs, 1));
    px(ctx, 6, 25, 3, 1, tone('wood', 0));
    px(ctx, 9, 25, 3, 1, tone('wood', 0));

    // Torse : plus large aux epaules.
    ditherRect(ctx, 4, 11, 9, 9, tone(p.tunic, 1), tone(p.tunic, 2), 0.55);
    px(ctx, 4, 11, 9, 1, tone(p.tunic, 3));
    px(ctx, 12, 12, 1, 8, tone(p.tunic, 0));
    // Ceinture
    px(ctx, 4, 18, 9, 2, tone(p.accent, 2));
    px(ctx, 4, 18, 9, 1, tone(p.accent, 3));

    // Bras.
    if (side) {
      const ax = facingEast ? 11 : 4;
      px(ctx, ax, 12, 2, 7 + swing, tone(p.tunic, facingEast ? 0 : 2));
      px(ctx, ax, 18 + swing, 2, 2, skin(0));
    } else {
      px(ctx, 2, 12, 2, 6 + swing, tone(p.tunic, 2));
      px(ctx, 13, 12, 2, 6 - swing, tone(p.tunic, 0));
      px(ctx, 2, 17 + swing, 2, 2, skin(0));
      px(ctx, 13, 17 - swing, 2, 2, skin(0));
    }

    // Cou et tete.
    px(ctx, 7, 10, 3, 2, skin(-1));
    px(ctx, 5, 3, 7, 8, skin(0));
    px(ctx, 5, 3, 4, 1, skin(1)); // haute lumiere en haut a gauche
    px(ctx, 11, 4, 1, 7, skin(-2)); // contour a l'ombre

    // Chevelure.
    px(ctx, 4, 2, 9, 3, tone(p.hair, p.hairLevel));
    px(ctx, 4, 2, 5, 1, tone(p.hair, p.hairLevel + 1));
    if (back) {
      px(ctx, 4, 2, 9, 8, tone(p.hair, p.hairLevel));
      px(ctx, 4, 2, 5, 2, tone(p.hair, p.hairLevel + 1));
    } else if (side) {
      px(ctx, facingEast ? 4 : 11, 3, 2, 6, tone(p.hair, p.hairLevel));
      px(ctx, facingEast ? 10 : 6, 6, 1, 1, '#1a120c'); // oeil de profil
      px(ctx, facingEast ? 11 : 5, 8, 1, 1, skin(-2)); // menton
    } else {
      px(ctx, 6, 6, 2, 1, '#1a120c');
      px(ctx, 10, 6, 2, 1, '#1a120c');
      px(ctx, 8, 8, 1, 1, skin(-2));
    }

    // Le garde porte un casque.
    if (p.tunic === 'metal') {
      px(ctx, 4, 1, 9, 4, tone('metal', 3));
      px(ctx, 4, 1, 5, 1, tone('metal', 4));
      px(ctx, 4, 5, 9, 1, tone('metal', 1));
      if (!back) px(ctx, 8, 2, 1, 5, tone('metal', 1)); // nasal
    }
  });
}

// --- Portraits ------------------------------------------------------------

/**
 * Portrait de dialogue, 44x52.
 *
 * Dans Ultima VII, le portrait fait la moitie de la presence d'un personnage :
 * sans lui, une conversation n'est qu'un panneau de texte. A cette taille on
 * peut donner des traits, une carnation modelee et un vetement — ce qu'un
 * sprite de 16 pixels ne permet pas.
 */
function portraitSprite(p: ActorPalette): Sprite {
  const W = 44;
  const H = 52;
  return makeSprite(W, H, (ctx) => {
    const skin = (l: number) => tone('skin', p.skinLevel + l);

    // Fond : arriere-plan sombre avec une lueur derriere la tete.
    ditherRect(ctx, 0, 0, W, H, '#14100c', '#211a13', 0.5);
    ctx.fillStyle = '#2b2218';
    ctx.beginPath();
    ctx.ellipse(W / 2, 26, 17, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Epaules et vetement.
    ditherRect(ctx, 5, 40, W - 10, H - 40, tone(p.tunic, 1), tone(p.tunic, 2), 0.55);
    px(ctx, 5, 40, W - 10, 1, tone(p.tunic, 3));
    px(ctx, 16, 40, 12, 3, skin(-1)); // cou
    px(ctx, 16, 40, 12, 1, skin(-2)); // ombre sous le menton
    // Col
    px(ctx, 14, 43, 4, 6, tone(p.accent, 2));
    px(ctx, 26, 43, 4, 6, tone(p.accent, 2));

    // Visage : ovale, modele en trois valeurs.
    ctx.fillStyle = skin(0);
    ctx.beginPath();
    ctx.ellipse(22, 25, 11, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin(1);
    ctx.beginPath();
    ctx.ellipse(19, 22, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ombre du cote oppose a la lumiere.
    ctx.fillStyle = skin(-2);
    ctx.beginPath();
    ctx.ellipse(30, 28, 4, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Yeux, sourcils, nez, bouche.
    px(ctx, 16, 24, 3, 2, '#efe6d2');
    px(ctx, 25, 24, 3, 2, '#efe6d2');
    px(ctx, 17, 24, 2, 2, '#1d1710');
    px(ctx, 26, 24, 2, 2, '#1d1710');
    px(ctx, 15, 21, 5, 1, tone(p.hair, p.hairLevel));
    px(ctx, 25, 21, 5, 1, tone(p.hair, p.hairLevel));
    px(ctx, 21, 27, 2, 4, skin(-1)); // arete du nez
    px(ctx, 20, 31, 4, 1, skin(-2));
    px(ctx, 18, 35, 7, 1, tone('blood', 1)); // bouche
    px(ctx, 19, 34, 5, 1, skin(-1));

    // Chevelure : masse par-dessus le crane, plus une meche eclairee.
    ctx.fillStyle = tone(p.hair, p.hairLevel);
    ctx.beginPath();
    ctx.ellipse(22, 15, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 9, 14, 4, 18, tone(p.hair, p.hairLevel));
    px(ctx, 31, 14, 4, 18, tone(p.hair, p.hairLevel));
    ctx.fillStyle = tone(p.hair, p.hairLevel + 1);
    ctx.beginPath();
    ctx.ellipse(17, 12, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Casque du garde.
    if (p.tunic === 'metal') {
      ctx.fillStyle = tone('metal', 3);
      ctx.beginPath();
      ctx.ellipse(22, 14, 14, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tone('metal', 4);
      ctx.beginPath();
      ctx.ellipse(17, 10, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      px(ctx, 8, 18, 28, 2, tone('metal', 1));
      px(ctx, 21, 18, 2, 14, tone('metal', 2)); // nasal
    }

    // Encadrement grave.
    px(ctx, 0, 0, W, 2, tone('wood', 3));
    px(ctx, 0, 0, 2, H, tone('wood', 3));
    px(ctx, 0, H - 2, W, 2, tone('wood', 0));
    px(ctx, W - 2, 0, 2, H, tone('wood', 0));
  });
}

// --- Atlas ----------------------------------------------------------------

const atlas = new Map<string, Sprite[]>();
const transitions = new Map<string, Sprite[]>();
const portraits = new Map<string, Sprite>();

/** Construit tous les sprites. A appeler une fois au demarrage. */
export function buildArt(): void {
  if (atlas.size > 0) return;

  // Variantes d'herbe : de la tuile nue a la tuile legerement herbue.
  // Six variantes d'herbe : plus il y en a, moins la repetition se voit.
  atlas.set('grass', [0, 1, 2, 3, 4, 5].map((i) => grassSprite(100 + i, [0, 1, 2, 1, 0, 2][i]!)));
  atlas.set('dirt', [0, 1, 2, 3].map((i) => terrainSprite('dirt', 200 + i)));
  atlas.set('sand', [0, 1, 2, 3].map((i) => terrainSprite('sand', 300 + i, 3)));
  atlas.set('water', [0, 1, 2, 3].map((i) => waterSprite(i)));
  atlas.set('stone', [0, 1, 2, 3].map((i) => stoneFloorSprite(500 + i)));
  atlas.set('woodfloor', [0, 1, 2, 3].map((i) => woodFloorSprite(600 + i, i % 3)));

  atlas.set('wall', [wallSprite(0), wallSprite(1), wallSprite(2)]);
  // Toiture : 4 positions en rang (faitage, versants, egout) x 3 en colonne
  // (rive ouest, plein champ, rive est).
  const roofFrames: Sprite[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) roofFrames.push(roofSprite(row, col));
  }
  atlas.set('roof', roofFrames);
  atlas.set('chimney', [chimneySprite()]);
  atlas.set('bookshelf', [bookshelfSprite(800), bookshelfSprite(801)]);
  atlas.set('rug', [rugSprite()]);
  atlas.set('longtable', [longTableSprite()]);
  atlas.set('canopybed', [canopyBedSprite()]);
  atlas.set('well', [wellSprite()]);
  atlas.set('cart', [cartSprite()]);
  atlas.set('pot', [potSprite()]);
  atlas.set('stool', [stoolSprite()]);
  atlas.set('dishes', [dishesSprite()]);
  atlas.set('sconce', [sconceSprite(true), sconceSprite(false)]);
  atlas.set('door', [doorSprite(false), doorSprite(true)]);
  // Six arbres : trois verts dont un grand, trois roux. La variete de taille
  // et de saison est ce qui donne leur couleur aux villes d'Ultima VII.
  atlas.set('tree', [
    treeSprite(700),
    treeSprite(701),
    treeSprite(702, 'leaf', true),
    treeSprite(703, 'autumn'),
    treeSprite(704, 'autumn', true),
    treeSprite(705, 'autumn'),
  ]);
  atlas.set('bush', [bushSprite(710), bushSprite(711)]);
  atlas.set('flower', [flowerSprite(0), flowerSprite(1), flowerSprite(2)]);
  atlas.set('pebble', [pebbleSprite(720), pebbleSprite(721)]);
  atlas.set('tuft', [tuftSprite(730), tuftSprite(731)]);
  atlas.set('mushroom', [mushroomSprite()]);
  atlas.set('table', [tableSprite()]);
  atlas.set('chair', [chairSprite()]);
  atlas.set('bed', [bedSprite()]);
  atlas.set('anvil', [anvilSprite()]);
  atlas.set('sign', [signSprite()]);
  atlas.set('lamppost', [lamppostSprite(true), lamppostSprite(false)]);
  atlas.set('hearth', [hearthSprite(0), hearthSprite(1), hearthSprite(2), hearthSprite(3)]);
  atlas.set('chest', [chestSprite(false), chestSprite(true)]);
  atlas.set('barrel', [barrelSprite()]);
  atlas.set('crate', [crateSprite()]);
  atlas.set('bag', [bagSprite()]);
  atlas.set('fence', [fenceSprite()]);
  atlas.set('shield', [shieldSprite(0), shieldSprite(1), shieldSprite(2)]);
  atlas.set('ham', [hamSprite()]);
  atlas.set('sack', [sackSprite()]);

  for (const [id, painter] of Object.entries(itemPainters)) {
    atlas.set(id, [smallItem(painter)]);
  }

  for (const [id, palette] of Object.entries(actorPalettes)) {
    const frames: Sprite[] = [];
    for (let dir = 0; dir < 4; dir++) {
      for (let pose = 0; pose < 2; pose++) frames.push(actorSprite(palette, dir, pose));
    }
    atlas.set(id, frames);
    portraits.set(id, portraitSprite(palette));
  }

  // Filet de securite : toute shape sans art recoit un carre magenta visible.
  for (const shape of allShapes()) {
    if (!atlas.has(shape.id)) atlas.set(shape.id, [missingSprite(shape)]);
  }

  buildTransitions();
  buildKerbs();
  verifierFrames();
}

/**
 * Le registre annonce-t-il le bon nombre de dessins ?
 *
 * `getSprite` fait un modulo sur la longueur reelle, si bien qu'un ecart entre
 * le registre et l'art ne casse rien et ne se voit nulle part. Huit shapes en
 * avaient accumule un — le mur en declarait une pour trois variantes dessinees,
 * les terrains la moitie des leurs.
 *
 * Ce n'est pas benin : c'est `shape.frames` qui decide combien de frames une
 * planche doit remplacer. Sous-declaree, une shape se retrouve peinte pour
 * partie et procedurale pour le reste, au milieu de la meme facade.
 *
 * Un avertissement plutot qu'une exception : une incoherence de donnees ne doit
 * pas empecher de jouer, et la console est l'endroit ou celui qui ajoute un
 * dessin la lira dans la seconde.
 */
function verifierFrames(): void {
  for (const shape of allShapes()) {
    const dessines = atlas.get(shape.id)?.length ?? 0;
    if (dessines > 0 && dessines !== shape.frames) {
      console.warn(
        `Shape « ${shape.id} » : le registre declare ${shape.frames} frame(s),`
        + ` l'art en dessine ${dessines}.`,
      );
    }
  }
}

const kerbs = new Map<string, Sprite>();

function buildKerbs(): void {
  for (const dir of ['n', 'e', 's', 'w'] as const) kerbs.set(dir, kerbSprite(dir));
}

/** Bordure de trottoir pour un cote donne. */
export function getKerb(dir: 'n' | 'e' | 's' | 'w'): Sprite | undefined {
  return kerbs.get(dir);
}

/** Liserés de debordement, pour chaque terrain et chaque direction. */
function buildTransitions(): void {
  for (const id of ['grass', 'dirt', 'sand', 'water']) {
    const source = atlas.get(id)?.[0];
    if (!source) continue;
    transitions.set(
      id,
      DIRECTIONS.map((dir) => transitionSprite(source, dir)),
    );
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

/**
 * Remplace un sprite procédural par un vrai dessin issu d'une planche.
 *
 * Le remplacement est **partiel et progressif** : chaque cellule d'atlas
 * ecrase une frame, les autres continuent d'utiliser le procédural. Une
 * planche a moitie faite ameliore donc le jeu sans le casser, ce qui est la
 * seule facon realiste de remplacer cinquante sprites.
 */
export function overrideSprite(shapeId: string, frame: number, sprite: Sprite): void {
  const frames = atlas.get(shapeId);
  if (!frames) {
    atlas.set(shapeId, [sprite]);
    return;
  }
  // On complete le tableau si la frame visee n'existe pas encore.
  while (frames.length <= frame) frames.push(frames[frames.length - 1] ?? sprite);
  frames[frame] = sprite;
}

export function getSprite(shapeId: string, frame: number): Sprite {
  const frames = atlas.get(shapeId);
  if (!frames || frames.length === 0) throw new Error(`Art manquant pour ${shapeId}`);
  return frames[frame % frames.length]!;
}

export function frameCount(shapeId: string): number {
  return atlas.get(shapeId)?.length ?? 1;
}

/** Portrait de dialogue d'un acteur, ou undefined s'il n'en a pas. */
/**
 * Remplace le portrait de dialogue d'une shape.
 *
 * Sans equivalent de `frames` : un personnage n'a qu'un portrait, et c'est
 * bien pour cela que c'est le dessin le plus facile a remplacer.
 */
export function overridePortrait(shapeId: string, sprite: Sprite): void {
  portraits.set(shapeId, sprite);
}

export function getPortrait(shapeId: string): Sprite | undefined {
  return portraits.get(shapeId);
}

/** Liseré de debordement d'un terrain, ou undefined s'il n'en a pas. */
export function getTransition(terrainId: string, dir: TransitionDir): Sprite | undefined {
  const set = transitions.get(terrainId);
  if (!set) return undefined;
  return set[DIRECTIONS.indexOf(dir)];
}

/** Expose le tramage pour les effets du renderer (ombres portees). */
export { bayer };

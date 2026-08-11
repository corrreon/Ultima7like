import { TILE_SIZE } from '../core/constants';
import type { Sprite } from './art';

/**
 * Chargement de vrais dessins depuis des planches d'images.
 *
 * L'art procédural de `art.ts` a un plafond : aucun algorithme ne remplace des
 * dessins faits par quelqu'un. Ce module est le chemin de substitution, et il
 * a ete pense pour que ce remplacement soit **progressif** : le jeu demarre
 * avec les sprites procéduraux, puis les planches arrivent de facon
 * asynchrone et remplacent, une par une, les shapes qu'elles couvrent. Une
 * planche manquante ou illisible n'empeche pas de jouer.
 *
 * Convention de planche : une grille reguliere de cellules, un objet par
 * cellule, sur un fond magenta uni. Le magenta est la couleur de fond
 * historique des planches de sprites — elle n'apparait dans aucun dessin, donc
 * on peut la retirer sans ambiguite.
 */

/** Fond a retirer : magenta pur. */
export const KEY_COLOR = { r: 255, g: 0, b: 255 };

/**
 * Le pixel appartient-il au fond a detourer ?
 *
 * On ne compare pas a `KEY_COLOR` a une tolerance pres : en pratique les
 * planches generees n'ont pas un fond parfaitement uni — la teinte derive d'une
 * cellule a l'autre, parfois jusqu'a un rose franchement plus clair, et une
 * tolerance assez large pour l'absorber commencerait a mordre dans les objets.
 *
 * On teste plutot le *caractere magenta* : rouge et bleu forts et proches l'un
 * de l'autre, vert faible. C'est vrai de tous les roses du fond, et d'aucune
 * couleur utilisee dans les dessins — le cramoisi et l'or ont le bleu bas, le
 * violet et le bleu roi ont le rouge bas.
 */
export function isKeyColor(r: number, g: number, b: number): boolean {
  return r > 180 && b > 180 && g < 120 && Math.abs(r - b) < 60;
}

/** Retrait par defaut sur le bord des cellules, en fraction de la cellule. */
export const DEFAULT_MARGIN = 0.02;

/**
 * Rectangle utile d'une cellule, borde retiree.
 *
 * Les modeles d'image dessinent volontiers les traits de grille qu'on leur a
 * pourtant interdits. Un seul pixel de trait le long du bord suffit a fausser
 * tout le recadrage : `contentBounds` le voit comme du contenu et retourne la
 * cellule entiere, ce qui donne un objet minuscule au milieu d'un vide, mal
 * ancre. Rogner quelques pour cent avant de chercher le contenu coute un
 * dessin qui touche le bord — ce que la consigne interdit de toute facon.
 */
export function insetRect(cellW: number, cellH: number, margin: number): Bounds {
  const fraction = Math.min(Math.max(margin, 0), 0.4);
  const inset = Math.floor(Math.min(cellW, cellH) * fraction);
  return {
    x: inset,
    y: inset,
    width: Math.max(1, cellW - inset * 2),
    height: Math.max(1, cellH - inset * 2),
  };
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rectangle occupe par le dessin dans une cellule.
 *
 * Indispensable : les modeles d'image ne centrent pas leurs objets au pixel
 * pres et laissent des marges inegales. Recadrer sur le contenu reel est ce qui
 * permet d'ancrer le sprite correctement dans le monde, au lieu d'heriter du
 * cadrage approximatif de la planche.
 *
 * Retourne null si la cellule est vide.
 */
export function contentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3] ?? 0;
      if (alpha === 0) continue;
      if (isKeyColor(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Rend transparents les pixels de fond, sur place.
 *
 * On ne se contente pas de comparer a la couleur exacte : le liseré ou le
 * bord anti-aliase autour d'un objet contient des teintes intermediaires qui
 * laisseraient une frange magenta bien visible sur le decor.
 */
export function keyOutBackground(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    if (isKeyColor(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)) {
      data[i + 3] = 0;
    }
  }
}

/** Une cellule de planche affectee a une shape. */
export interface AtlasEntry {
  shape: string;
  /** Frame remplacee, 0 par defaut. */
  frame?: number;
  /** Index de la cellule dans la planche, en lecture ligne par ligne. */
  cell: number;
  /**
   * Largeur voulue dans le jeu, en tuiles. La hauteur suit le rapport
   * d'aspect du dessin recadre, ce qui permet aux objets hauts (un puits, une
   * bibliotheque) de depasser leur emprise au sol.
   */
  tilesWide: number;
}

export interface SheetDef {
  /** Chemin de l'image, relatif a la racine servie. */
  url: string;
  columns: number;
  rows: number;
  /**
   * Bord ignore autour de chaque cellule, en fraction de la cellule.
   * Vaut `DEFAULT_MARGIN` par defaut, ce qui absorbe les traits de grille.
   * A mettre a 0 pour une planche dont les dessins touchent le bord.
   */
  margin?: number;
  entries: AtlasEntry[];
}

/** Sprite issu d'une planche, pret a remplacer un sprite procédural. */
export interface LoadedSprite {
  shape: string;
  frame: number;
  sprite: Sprite;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Planche introuvable : ${url}`));
    image.src = url;
  });
}

/**
 * Decoupe une planche et retourne ses sprites.
 *
 * Le redimensionnement se fait au plus proche voisin : un dessin en pixel art
 * reduit avec interpolation devient une bouillie, et cela se voit
 * immediatement a cote des sprites procéduraux.
 */
export async function loadSheet(sheet: SheetDef): Promise<LoadedSprite[]> {
  const image = await loadImage(sheet.url);

  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  const sctx = source.getContext('2d', { willReadFrequently: true })!;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(image, 0, 0);

  const cellW = Math.floor(image.width / sheet.columns);
  const cellH = Math.floor(image.height / sheet.rows);
  const inner = insetRect(cellW, cellH, sheet.margin ?? DEFAULT_MARGIN);
  const out: LoadedSprite[] = [];

  for (const entry of sheet.entries) {
    const col = entry.cell % sheet.columns;
    const row = Math.floor(entry.cell / sheet.columns);
    if (row >= sheet.rows) continue;

    const cell = sctx.getImageData(
      col * cellW + inner.x,
      row * cellH + inner.y,
      inner.width,
      inner.height,
    );
    const bounds = contentBounds(cell.data, inner.width, inner.height);
    if (!bounds) continue; // cellule vide

    // Recadrage sur le contenu, puis detourage.
    const cropped = document.createElement('canvas');
    cropped.width = bounds.width;
    cropped.height = bounds.height;
    const cctx = cropped.getContext('2d', { willReadFrequently: true })!;
    cctx.putImageData(cell, -bounds.x, -bounds.y);
    const cropData = cctx.getImageData(0, 0, bounds.width, bounds.height);
    keyOutBackground(cropData.data);
    cctx.putImageData(cropData, 0, 0);

    // Mise a l'echelle du jeu.
    const targetW = Math.max(1, Math.round(entry.tilesWide * TILE_SIZE));
    const targetH = Math.max(1, Math.round((targetW * bounds.height) / bounds.width));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const octx = canvas.getContext('2d')!;
    octx.imageSmoothingEnabled = false;
    octx.drawImage(cropped, 0, 0, targetW, targetH);

    out.push({
      shape: entry.shape,
      frame: entry.frame ?? 0,
      sprite: { canvas, width: targetW, height: targetH },
    });
  }

  return out;
}

/**
 * Charge toutes les planches et remplace les sprites correspondants.
 *
 * Volontairement tolerante : une planche qui manque, dont l'image est cassee
 * ou dont une cellule est vide n'interrompt pas le chargement des autres. Le
 * jeu tourne deja avec ses sprites procéduraux au moment ou cette fonction
 * s'execute — elle ne fait qu'ameliorer ce qui est deja a l'ecran.
 *
 * Retourne le nombre de sprites effectivement remplaces.
 */
export async function loadSheets(
  sheets: readonly SheetDef[],
  override: (shape: string, frame: number, sprite: Sprite) => void,
): Promise<number> {
  let count = 0;
  for (const sheet of sheets) {
    try {
      for (const loaded of await loadSheet(sheet)) {
        override(loaded.shape, loaded.frame, loaded.sprite);
        count++;
      }
    } catch (error) {
      console.warn(`Planche ignoree : ${sheet.url}`, error);
    }
  }
  return count;
}

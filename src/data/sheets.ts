import type { SheetDef } from '../render/atlas';

/**
 * Planches de dessins a charger au demarrage.
 *
 * Chaque planche est une grille reguliere de cellules sur fond magenta, un
 * objet par cellule. `cell` est l'index en lecture ligne par ligne, en partant
 * de zero en haut a gauche.
 *
 * `tilesWide` donne la largeur voulue **dans le jeu**, en tuiles ; la hauteur
 * suit le rapport d'aspect du dessin recadre. C'est ce qui permet a une
 * bibliotheque de n'occuper qu'une tuile au sol tout en se dessinant sur trois
 * de haut. En regle generale, prendre l'emprise au sol de la shape
 * (`footprint[0]`) comme point de depart, puis ajuster a l'oeil.
 *
 * `margin` est le bord ignore autour de chaque cellule, en fraction de la
 * cellule. Il vaut 2 % par defaut, ce qui suffit a avaler les traits de grille
 * que les modeles d'image dessinent malgre la consigne — sans ce retrait, un
 * trait le long du bord fait recadrer sur la cellule entiere et l'objet se
 * retrouve minuscule et mal ancre. A mettre a 0 si un dessin touche le bord.
 *
 * Une planche absente ou illisible n'empeche pas de jouer : le jeu garde ses
 * sprites procéduraux et se contente d'un avertissement dans la console.
 *
 * Les fichiers vont dans `public/sheets/` et sont servis a la racine.
 *
 * Exemple, a decommenter quand la premiere planche existe :
 *
 * ```ts
 * {
 *   url: 'sheets/mobilier.png',
 *   columns: 3,
 *   rows: 3,
 *   entries: [
 *     { shape: 'chair', cell: 0, tilesWide: 1 },
 *     { shape: 'stool', cell: 1, tilesWide: 1 },
 *     { shape: 'table', cell: 2, tilesWide: 1 },
 *     { shape: 'longtable', cell: 3, tilesWide: 2 },
 *     { shape: 'bed', cell: 4, tilesWide: 1 },
 *     { shape: 'canopybed', cell: 5, tilesWide: 2 },
 *     { shape: 'bookshelf', cell: 6, tilesWide: 1 },
 *     { shape: 'crate', cell: 7, tilesWide: 1 },
 *     { shape: 'rug', cell: 8, tilesWide: 3 },
 *   ],
 * },
 * ```
 */
export const SHEETS: SheetDef[] = [];

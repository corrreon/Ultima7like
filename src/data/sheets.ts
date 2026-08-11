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
 * ## Deux regles apprises a l'usage
 *
 * **Ne jamais remplacer une partie des frames d'une shape.** Une frame peinte
 * a cote d'une frame procédurale saute aux yeux, bien plus que la repetition
 * du meme dessin. Quand une planche ne fournit qu'un dessin pour une shape qui
 * a plusieurs frames, on affecte ce dessin a toutes ses frames — sauf a en
 * avoir un autre qui fasse une variante credible.
 *
 * **Une case sans shape correspondante reste dans la planche, inutilisee.**
 * Elle ne coute rien et attend que le registre s'etoffe. C'est le cas ici du
 * fromage, du poulet roti, de la bouteille de vin, de la marmite, de la dague,
 * de la hache, de l'arc, de la bougie, du chaudron, de l'abreuvoir, de la
 * botte de foin, du tas de rondins, de la souche, du seau, de la ruche, du
 * lingot, de la gemme, de la bague, de l'amulette, du parchemin et du livre.
 */
export const SHEETS: SheetDef[] = [
  {
    // Planche 3. Le fromage, le poulet, le vin et la marmite attendent leur
    // shape.
    url: 'sheets/nourriture.png',
    columns: 3,
    rows: 3,
    entries: [
      { shape: 'bread', cell: 0, tilesWide: 1 },
      { shape: 'ham', cell: 2, tilesWide: 1 },
      { shape: 'apple', cell: 4, tilesWide: 1 },
      { shape: 'ale', cell: 5, tilesWide: 1 },
      { shape: 'dishes', cell: 7, tilesWide: 1 },
    ],
  },
  {
    // Planche 4. `shield` est la decoration murale des tavernes et des salles
    // de garde : ses trois frames sont tirees au hasard, il faut donc les
    // couvrir toutes les trois. Le heaume fait une troisieme piece credible a
    // cote des deux ecus.
    url: 'sheets/armes.png',
    columns: 3,
    rows: 3,
    entries: [
      { shape: 'sword', cell: 1, tilesWide: 1 },
      { shape: 'hammer', cell: 4, tilesWide: 1 },
      { shape: 'shield', frame: 0, cell: 6, tilesWide: 1 },
      { shape: 'shield', frame: 1, cell: 5, tilesWide: 1 },
      { shape: 'shield', frame: 2, cell: 7, tilesWide: 1 },
    ],
  },
  {
    // Planche 6. L'atre est anime sur trois frames, une image fixe le figerait
    // — il garde son dessin procédural. L'applique n'est jamais posee eteinte,
    // sa frame 1 peut rester telle quelle.
    url: 'sheets/lumiere.png',
    columns: 3,
    rows: 3,
    entries: [
      { shape: 'lamppost', cell: 0, tilesWide: 1 },
      { shape: 'sconce', frame: 0, cell: 1, tilesWide: 1 },
      { shape: 'torch', cell: 5, tilesWide: 1 },
    ],
  },
  {
    // Planche 7. Sans trait de grille, mais la barriere et le portail vont
    // d'un bord a l'autre de leur cellule : tout retrait les amputerait. La
    // barriere doit justement toucher les bords, c'est ce qui la fait se
    // raccorder a sa voisine.
    url: 'sheets/exterieur.png',
    columns: 3,
    rows: 3,
    margin: 0,
    entries: [
      { shape: 'well', cell: 0, tilesWide: 2 },
      { shape: 'cart', cell: 1, tilesWide: 2 },
      { shape: 'fence', cell: 2, tilesWide: 1 },
    ],
  },
  {
    // Planche 8. Le menu decor du sol, celui qu'on voit le plus souvent. La
    // branche morte sert de seconde variante a la touffe d'herbe, et le
    // bouquet d'herbes sechees de troisieme fleur : c'est ce qui evite un sol
    // ou le meme dessin se repete a l'identique.
    url: 'sheets/vegetation.png',
    columns: 3,
    rows: 3,
    entries: [
      { shape: 'mushroom', cell: 0, tilesWide: 1 },
      { shape: 'tuft', frame: 0, cell: 1, tilesWide: 1 },
      { shape: 'tuft', frame: 1, cell: 6, tilesWide: 1 },
      { shape: 'flower', frame: 0, cell: 2, tilesWide: 1 },
      { shape: 'flower', frame: 1, cell: 2, tilesWide: 1 },
      { shape: 'flower', frame: 2, cell: 8, tilesWide: 1 },
      { shape: 'bush', cell: 3, tilesWide: 1 },
      { shape: 'pot', cell: 4, tilesWide: 1 },
      { shape: 'pebble', frame: 0, cell: 5, tilesWide: 1 },
      { shape: 'pebble', frame: 1, cell: 5, tilesWide: 1 },
    ],
  },
  {
    // Planche 9. Le luth est l'objet de la quete de Basile.
    url: 'sheets/precieux.png',
    columns: 3,
    rows: 3,
    entries: [
      { shape: 'gold', cell: 0, tilesWide: 1 },
      { shape: 'key', cell: 5, tilesWide: 1 },
      { shape: 'lute', cell: 8, tilesWide: 1 },
    ],
  },
];

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
 * **Les objets transportables prennent une fraction de tuile.** Une emprise
 * d'une tuile veut dire qu'on ne peut pas en poser deux sur la meme case ;
 * elle ne veut pas dire que la miche de pain fait la largeur de la table. Un
 * objet dessine a `1` ecrase le meuble qui le porte et le rend invisible :
 * pain 0,5, pomme 0,35, chope 0,4. C'est le defaut le plus visible d'une
 * planche qu'on vient de brancher.
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
 * ## Les personnages, cas a part
 *
 * Un acteur a huit frames : quatre directions (dos, est, face, ouest) fois
 * deux poses de marche, dans cet ordre — `frames[direction * 2 + pose]`.
 *
 * Trois precautions, sans lesquelles le resultat est inutilisable :
 *
 * 1. **`group`.** Les acteurs sont dessines ancres en bas a droite. Recadrees
 *    chacune sur son contenu, deux poses n'ont pas la meme hauteur et le
 *    personnage sautille a chaque pas, puis change de taille en tournant. Un
 *    groupe commun leur donne le meme cadre.
 * 2. **`mirror`.** Le profil ouest est le miroir exact du profil est. Le
 *    demander en double, c'est demander une symetrie que personne ne tient a
 *    la main — et payer six dessins la ou quatre suffisent.
 * 3. **`portrait`.** Le portrait de dialogue est un dessin separe, sans
 *    contrainte de coherence avec ses voisins : c'est de loin le remplacement
 *    le plus facile, et celui qui change le plus la presence d'un personnage.
 *
 * La fonction `personnage` ci-dessous applique ces trois regles ; il suffit
 * de lui passer une planche et une shape.
 *
 * **Une case sans shape correspondante reste dans la planche, inutilisee.**
 * Elle ne coute rien et attend que le registre s'etoffe. C'est le cas ici du
 * panier, de la jarre, de l'etagere murale, du fromage, du poulet roti, de la
 * bouteille de vin, de la marmite, de la hache, du marteau de
 * guerre, de l'arc, du soufflet, de la scie, de la pelle, de la fourche, de la
 * faux, de l'etabli, de la meule, de la bougie, du chaudron, de l'abreuvoir,
 * de la botte de foin, du tas de rondins, de la souche, du seau, de la ruche,
 * du lingot, de la gemme, de la bague, de l'amulette, du parchemin et du
 * livre.
 */
/**
 * Planche de personnage : six poses, un cadre commun, deux miroirs.
 *
 * Les six cellules sont, dans l'ordre de lecture : dos immobile, dos en pas,
 * face immobile, face en pas, profil est immobile, profil est en pas.
 *
 * Le moteur, lui, range ses frames en `direction * 2 + pose` avec les
 * directions dos, est, face, ouest. Les deux ordres ne coincident donc pas, et
 * les profils ouest n'existent pas sur la planche : ce sont les profils est
 * retournes. Cette table est ecrite une fois ici plutot que recopiee pour
 * chaque habitant — c'est precisement le genre de correspondance qu'on finit
 * par se tromper en la repetant.
 *
 * `tilesWide` se regle par personnage, et pas une fois pour toutes. La mise a
 * l'echelle se fait sur la largeur : a largeur egale, un personnage large sort
 * plus court qu'un personnage mince. Laisses a 1, le forgeron — l'homme le
 * plus massif du bourg — se retrouvait le plus petit de douze pixels. Les
 * valeurs ci-dessous egalisent les hauteurs a l'ecran, et laissent au forgeron
 * les quelques pixels qui lui reviennent.
 */
function personnage(url: string, shape: string, tilesWide = 1): SheetDef {
  const poses: Array<[frame: number, cell: number, mirror: boolean]> = [
    [0, 0, false], // dos, immobile
    [1, 1, false], // dos, en pas
    [2, 4, false], // est, immobile
    [3, 5, false], // est, en pas
    [4, 2, false], // face, immobile
    [5, 3, false], // face, en pas
    [6, 4, true], // ouest, immobile — miroir de l'est
    [7, 5, true], // ouest, en pas
  ];
  return {
    url,
    columns: 3,
    rows: 3,
    entries: poses.map(([frame, cell, mirror]) => ({
      shape,
      frame,
      cell,
      tilesWide,
      group: shape,
      ...(mirror ? { mirror: true } : {}),
    })),
  };
}

export const SHEETS: SheetDef[] = [
  personnage('sheets/avatar.png', 'avatar'),
  personnage('sheets/villageois.png', 'townsman'),
  personnage('sheets/villageoise.png', 'townswoman', 1.05),
  personnage('sheets/garde.png', 'guard', 1.12),
  personnage('sheets/forgeron.png', 'smith', 1.28),
  personnage('sheets/brigand.png', 'brigand', 1.1),
  {
    // Portraits de dialogue. Ils ne sont pas sur fond magenta : chaque cellule
    // est un portrait plein cadre sur fond sombre, et c'est voulu — le
    // portrait garde son propre fond, seul le bord de cellule est retire.
    //
    // La clef est l'identifiant de **conversation** quand le personnage en a
    // un, et l'identifiant de shape sinon. Un barde et un paysan sont deux
    // `townsman` pour le moteur ; ils n'ont aucune raison d'avoir le meme
    // visage.
    url: 'sheets/portraits.png',
    columns: 3,
    rows: 3,
    entries: [
      { shape: 'avatar', cell: 0, tilesWide: 3.25, portrait: true },
      { shape: 'townsman', cell: 1, tilesWide: 3.25, portrait: true },
      { shape: 'townswoman', cell: 2, tilesWide: 3.25, portrait: true },
      { shape: 'guard', cell: 3, tilesWide: 3.25, portrait: true },
      { shape: 'smith', cell: 4, tilesWide: 3.25, portrait: true },
      { shape: 'brigand', cell: 5, tilesWide: 3.25, portrait: true },
      // Visages nommes. Le chef de bande et la vieille femme des cellules 6
      // et 8 attendent, l'un un dialogue, l'autre son habitante.
      { shape: 'mireille', cell: 2, tilesWide: 3.25, portrait: true },
      { shape: 'aldric', cell: 4, tilesWide: 3.25, portrait: true },
      { shape: 'jehan', cell: 3, tilesWide: 3.25, portrait: true },
      { shape: 'basile', cell: 7, tilesWide: 3.25, portrait: true },
    ],
  },
  {
    // Planche 1. Aucun trait de grille, mais les dessins vont d'un bord a
    // l'autre de leur cellule : tout retrait les amputerait.
    //
    // La bibliotheque est posee avec l'une ou l'autre de ses deux frames selon
    // la parite de la tuile ; le buffet fait la seconde, ce qui evite une
    // rangee de bibliotheques identiques le long d'un mur.
    url: 'sheets/mobilier.png',
    columns: 3,
    rows: 3,
    margin: 0,
    entries: [
      { shape: 'chair', cell: 0, tilesWide: 1 },
      { shape: 'stool', cell: 1, tilesWide: 1 },
      { shape: 'table', cell: 2, tilesWide: 1 },
      { shape: 'longtable', cell: 3, tilesWide: 2 },
      { shape: 'bed', cell: 4, tilesWide: 2 },
      { shape: 'canopybed', cell: 5, tilesWide: 2 },
      { shape: 'bookshelf', frame: 0, cell: 6, tilesWide: 1 },
      { shape: 'bookshelf', frame: 1, cell: 7, tilesWide: 1 },
      { shape: 'rug', cell: 8, tilesWide: 3 },
    ],
  },
  {
    // Planche 2. Le coffre a deux frames, fermee puis ouverte, et la planche
    // donne les deux — c'est ce qui rend le coffre lisible au moment ou on
    // l'ouvre. La sacoche sert de `bag`, le contenant transportable.
    url: 'sheets/contenants.png',
    columns: 3,
    rows: 3,
    margin: 0,
    entries: [
      { shape: 'chest', frame: 0, cell: 0, tilesWide: 1 },
      { shape: 'chest', frame: 1, cell: 1, tilesWide: 1 },
      { shape: 'barrel', cell: 2, tilesWide: 1 },
      { shape: 'crate', cell: 3, tilesWide: 1 },
      { shape: 'sack', cell: 4, tilesWide: 1 },
      { shape: 'bag', cell: 7, tilesWide: 0.6 },
    ],
  },
  {
    // Planche 5. Traits de grille bien visibles : on garde le retrait par
    // defaut. Le marteau vient d'ici et non de la planche d'armes : la shape
    // s'appelle « marteau de forge », c'est ce dessin-la et pas le marteau de
    // guerre.
    url: 'sheets/outils.png',
    columns: 3,
    rows: 3,
    entries: [
      { shape: 'anvil', cell: 0, tilesWide: 1 },
      { shape: 'hammer', cell: 2, tilesWide: 0.6 },
    ],
  },
  {
    // Planche 3. Le fromage, le poulet, le vin et la marmite attendent leur
    // shape.
    url: 'sheets/nourriture.png',
    columns: 3,
    rows: 3,
    entries: [
      { shape: 'bread', cell: 0, tilesWide: 0.5 },
      { shape: 'ham', cell: 2, tilesWide: 0.7 },
      { shape: 'apple', cell: 4, tilesWide: 0.35 },
      { shape: 'ale', cell: 5, tilesWide: 0.4 },
      { shape: 'dishes', cell: 7, tilesWide: 0.75 },
    ],
  },
  {
    // Planche 4. `shield` est la decoration murale des tavernes et des salles
    // de garde : ses trois frames sont tirees au hasard, il faut donc les
    // couvrir toutes les trois. Le heaume fait une troisieme piece credible a
    // cote des deux ecus. Le marteau de guerre reste inutilise, `hammer` etant
    // servi par le marteau de forge de la planche 5.
    url: 'sheets/armes.png',
    columns: 3,
    rows: 3,
    entries: [
      { shape: 'sword', cell: 1, tilesWide: 0.75 },
      { shape: 'dagger', cell: 2, tilesWide: 0.55 },
      { shape: 'shield', frame: 0, cell: 6, tilesWide: 0.8 },
      { shape: 'shield', frame: 1, cell: 5, tilesWide: 0.8 },
      { shape: 'shield', frame: 2, cell: 7, tilesWide: 0.8 },
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
      { shape: 'torch', cell: 5, tilesWide: 0.5 },
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
      { shape: 'mushroom', cell: 0, tilesWide: 0.5 },
      { shape: 'tuft', frame: 0, cell: 1, tilesWide: 0.8 },
      { shape: 'tuft', frame: 1, cell: 6, tilesWide: 0.8 },
      { shape: 'flower', frame: 0, cell: 2, tilesWide: 0.6 },
      { shape: 'flower', frame: 1, cell: 2, tilesWide: 0.6 },
      { shape: 'flower', frame: 2, cell: 8, tilesWide: 0.6 },
      { shape: 'bush', cell: 3, tilesWide: 1 },
      { shape: 'pot', cell: 4, tilesWide: 1 },
      { shape: 'pebble', frame: 0, cell: 5, tilesWide: 0.45 },
      { shape: 'pebble', frame: 1, cell: 5, tilesWide: 0.45 },
    ],
  },
  {
    // Planche 9. Le luth est l'objet de la quete de Basile.
    url: 'sheets/precieux.png',
    columns: 3,
    rows: 3,
    entries: [
      { shape: 'gold', cell: 0, tilesWide: 0.5 },
      { shape: 'key', cell: 5, tilesWide: 0.5 },
      { shape: 'lute', cell: 8, tilesWide: 0.7 },
    ],
  },
];

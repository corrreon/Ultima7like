/**
 * Registre des « shapes ».
 *
 * Dans Ultima VII tout est une shape : le brin d'herbe, le mur, la miche de
 * pain et le PNJ partagent la meme structure de donnees (un identifiant de
 * shape + un numero de frame + des drapeaux). C'est ce choix qui rend le monde
 * uniformement manipulable — si un objet a un poids et un volume, il peut etre
 * pris, pose, range dans un sac, jete a la figure de quelqu'un, sans code
 * special. On reproduit ce modele ici.
 *
 * Ce module est volontairement pur (aucune dependance au DOM) pour rester
 * testable en Node : la generation des pixels vit dans src/render/art.ts.
 */

export type ShapeKind = 'terrain' | 'object' | 'actor';

export interface ShapeDef {
  id: string;
  name: string;
  kind: ShapeKind;
  /** Emprise au sol, en tuiles : [largeur X, profondeur Y]. */
  footprint: [number, number];
  /** Hauteur occupee, en niveaux de lift. */
  height: number;
  /** Nombre de frames disponibles. */
  frames: number;
  /** Bloque le deplacement des acteurs. */
  solid?: boolean;
  /** Peut etre ramasse et transporte. */
  takeable?: boolean;
  /** Peut contenir d'autres objets. */
  container?: boolean;
  /** Volume interieur disponible, si container. */
  capacity?: number;
  /** Porte : le double-clic bascule entre frame 0 (fermee) et 1 (ouverte). */
  door?: boolean;
  /** Toit : masque quand le joueur entre dans le batiment. */
  roof?: boolean;
  /** Rayon d'eclairage, en tuiles (0 = pas de lumiere). */
  light?: number;
  /** La lumiere ne s'allume qu'a la nuit tombee. */
  lightAtNight?: boolean;
  /** Poids, en 1/10 de stone (unite d'origine d'Ultima VII). */
  weight?: number;
  /** Volume occupe dans un contenant. */
  volume?: number;
  /** Points de nourriture rendus a la consommation. */
  food?: number;
  /** Degats infliges si l'objet est utilise comme arme. */
  damage?: number;
  /**
   * Camp de l'acteur. Deux acteurs de camps differents sont hostiles.
   *
   * Porte par la shape et non par l'acteur : un brigand est un brigand parce
   * qu'il est de cette espece, pas parce qu'on le lui a dit a la creation. Le
   * format de sauvegarde n'a donc rien de plus a retenir.
   */
  faction?: string;
  /**
   * L'acteur se bat. Sans ce drapeau il continue son emploi du temps meme
   * quand on l'attaque : une aubergiste n'a pas a charger un brigand.
   */
  combatant?: boolean;
  /** Chances de toucher, opposees a la defense de la cible. */
  attack?: number;
  /** Difficulte a etre touche. */
  defense?: number;
  /** Valeur marchande, en pieces d'or. */
  value?: number;
  /** L'objet s'empile (or, fleches...). */
  stackable?: boolean;
  /** Les acteurs traversent la tuile mais y sont ralentis / en surbrillance. */
  surface?: 'water' | 'road' | 'interior';
  /**
   * Animation en boucle. Quand la frame de l'objet vaut `whenFrame`, le rendu
   * fait defiler `frames` a la cadence indiquee. Ultima VII obtenait le meme
   * effet par rotation de palette ; le principe est identique — un monde ou
   * rien ne bouge a l'air d'une maquette.
   */
  anim?: { whenFrame: number; frames: number[]; fps: number };
  /**
   * L'enveloppe des batiments : le generateur la reproduit a l'identique, donc
   * la sauvegarde ne la stocke pas.
   *
   * Le contrat est strict, et c'est ce qui rend l'economie sure : un objet
   * `rebuilt` n'a aucun usecode, ne se ramasse pas, ne contient rien, ne bouge
   * jamais et ne change pas d'etat. Rien de ce que fait le joueur ne peut donc
   * le distinguer de celui que le generateur reposera. L'empreinte de carte
   * garantit par ailleurs qu'une sauvegarde reprise vient bien de cette
   * carte-la.
   *
   * L'economie n'est pas marginale : murs et toits representent 57 % des objets
   * du bourg.
   */
  rebuilt?: boolean;
}

const defs = new Map<string, ShapeDef>();

function def(shape: ShapeDef): ShapeDef {
  defs.set(shape.id, shape);
  return shape;
}

// --- Terrains -------------------------------------------------------------

def({ id: 'grass', name: 'Herbe', kind: 'terrain', footprint: [1, 1], height: 0, frames: 6 });
def({ id: 'dirt', name: 'Terre battue', kind: 'terrain', footprint: [1, 1], height: 0, frames: 4, surface: 'road' });
def({ id: 'sand', name: 'Sable', kind: 'terrain', footprint: [1, 1], height: 0, frames: 4 });
def({ id: 'water', name: 'Eau', kind: 'terrain', footprint: [1, 1], height: 0, frames: 4, solid: true, surface: 'water' });
def({ id: 'stone', name: 'Dalle de pierre', kind: 'terrain', footprint: [1, 1], height: 0, frames: 4 });
def({ id: 'woodfloor', name: 'Plancher', kind: 'terrain', footprint: [1, 1], height: 0, frames: 4, surface: 'interior' });

// --- Decor et mobilier ----------------------------------------------------

// Trois variantes : panneau nu, croix de Saint-Andre, fenetre a meneaux. Le
// registre en declarait une seule alors que l'art en dessine trois — sans
// consequence tant que rien ne consultait `frames`, mais une planche qui aurait
// voulu remplacer le mur n'en aurait repeint qu'un tiers, et les deux autres
// variantes seraient restees procedurales au milieu de la facade.
def({ id: 'wall', name: 'Mur', kind: 'object', footprint: [1, 1], height: 5, frames: 3, solid: true, rebuilt: true });
// Toiture : 12 frames = 4 positions en rang x 3 en colonne. Voir art.ts.
def({ id: 'roof', name: 'Toit', kind: 'object', footprint: [1, 1], height: 1, frames: 12, roof: true, rebuilt: true });
def({ id: 'chimney', name: 'Cheminee', kind: 'object', footprint: [1, 1], height: 3, frames: 1, roof: true, rebuilt: true });
def({ id: 'door', name: 'Porte', kind: 'object', footprint: [1, 1], height: 5, frames: 2, solid: true, door: true });
def({ id: 'tree', name: 'Arbre', kind: 'object', footprint: [1, 1], height: 6, frames: 6, solid: true });
def({ id: 'bush', name: 'Buisson', kind: 'object', footprint: [1, 1], height: 1, frames: 2 });
def({ id: 'table', name: 'Table', kind: 'object', footprint: [1, 1], height: 2, frames: 1, solid: true });
def({ id: 'chair', name: 'Chaise', kind: 'object', footprint: [1, 1], height: 2, frames: 1 });
// Un lit fait deux tuiles sur deux. En une seule tuile de large il se dessinait
// plus etroit qu'un dormeur ; c'est aussi l'emprise du lit a baldaquin, ce qui
// evite deux echelles de lit dans le meme bourg.
def({ id: 'bed', name: 'Lit', kind: 'object', footprint: [2, 2], height: 1, frames: 1 });
def({ id: 'bookshelf', name: 'Bibliotheque', kind: 'object', footprint: [1, 1], height: 4, frames: 2, solid: true });
// --- Objets multi-tuiles --------------------------------------------------
// L'emprise est donnee en tuiles [largeur, profondeur], et la tuile de l'objet
// designe le coin bas-droit : un objet de 3x2 s'etend donc vers le nord-ouest.
// Trois tapis d'une tuile cote a cote se lisent comme du carrelage ; un tapis
// de 3x2 se lit comme un tapis.
def({ id: 'rug', name: 'Tapis', kind: 'object', footprint: [3, 2], height: 0, frames: 1 });
def({ id: 'longtable', name: 'Table de banquet', kind: 'object', footprint: [2, 1], height: 2, frames: 1, solid: true });
def({ id: 'canopybed', name: 'Lit a baldaquin', kind: 'object', footprint: [2, 2], height: 4, frames: 1 });
def({ id: 'well', name: 'Puits', kind: 'object', footprint: [2, 2], height: 5, frames: 1, solid: true });
def({ id: 'cart', name: 'Charrette', kind: 'object', footprint: [2, 2], height: 3, frames: 1, solid: true });
def({ id: 'pot', name: 'Plante en pot', kind: 'object', footprint: [1, 1], height: 2, frames: 1, solid: true });
def({ id: 'stool', name: 'Tabouret', kind: 'object', footprint: [1, 1], height: 1, frames: 1 });
def({ id: 'dishes', name: 'Vaisselle', kind: 'object', footprint: [1, 1], height: 1, frames: 1 });
// Applique murale : posee sur la tuile devant le mur, avec un lift de 2, elle
// se dessine pile sur le mur. Non solide, sinon elle condamne les couloirs.
def({ id: 'sconce', name: 'Applique', kind: 'object', footprint: [1, 1], height: 3, frames: 2, light: 3 });
def({ id: 'fence', name: 'Barriere', kind: 'object', footprint: [1, 1], height: 2, frames: 1, solid: true });
// Ecu et jambon sont poses sur la tuile devant le mur avec un lift de 2 :
// le decalage diagonal de la hauteur les accroche pile a la maconnerie.
def({ id: 'shield', name: 'Ecu', kind: 'object', footprint: [1, 1], height: 3, frames: 3 });
def({ id: 'ham', name: 'Jambon', kind: 'object', footprint: [1, 1], height: 3, frames: 1, takeable: true, weight: 40, volume: 6, food: 30, value: 8 });
def({ id: 'sack', name: 'Sac de grain', kind: 'object', footprint: [1, 1], height: 1, frames: 1, solid: true, container: true, capacity: 16, weight: 120, volume: 12 });
def({ id: 'anvil', name: 'Enclume', kind: 'object', footprint: [1, 1], height: 2, frames: 1, solid: true });
def({ id: 'sign', name: 'Enseigne', kind: 'object', footprint: [1, 1], height: 3, frames: 1, solid: true });
def({
  id: 'lamppost',
  name: 'Reverbere',
  kind: 'object',
  footprint: [1, 1],
  height: 5,
  // Deux : allume et eteint. Le rendu employait deja la frame 1 de jour alors
  // que le registre n'en declarait qu'une.
  frames: 2,
  solid: true,
  light: 4,
  lightAtNight: true,
});
def({
  id: 'hearth',
  name: 'Atre',
  kind: 'object',
  footprint: [1, 1],
  height: 3,
  frames: 4,
  solid: true,
  light: 4,
  anim: { whenFrame: 0, frames: [0, 1, 2], fps: 6 },
});

// --- Menu decor de sol ----------------------------------------------------
// Rien de tout cela n'a d'effet sur le jeu : ces objets existent uniquement
// pour remplir l'ecran. C'est pourtant l'un des plus gros ecarts avec Ultima
// VII, dont chaque plan est dense en petits details.

def({ id: 'flower', name: 'Fleur', kind: 'object', footprint: [1, 1], height: 1, frames: 3, takeable: true, weight: 1, volume: 1, value: 1 });
def({ id: 'pebble', name: 'Cailloux', kind: 'object', footprint: [1, 1], height: 0, frames: 2 });
def({ id: 'tuft', name: 'Touffe d\'herbe', kind: 'object', footprint: [1, 1], height: 0, frames: 2 });
def({ id: 'mushroom', name: 'Champignon', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 1, volume: 1, food: 4 });

// --- Contenants -----------------------------------------------------------

def({
  id: 'chest',
  name: 'Coffre',
  kind: 'object',
  footprint: [1, 1],
  height: 2,
  frames: 2,
  solid: true,
  container: true,
  capacity: 40,
  weight: 200,
  volume: 20,
});
def({
  id: 'barrel',
  name: 'Tonneau',
  kind: 'object',
  footprint: [1, 1],
  height: 3,
  frames: 1,
  solid: true,
  container: true,
  capacity: 25,
  weight: 150,
  volume: 15,
});
def({
  id: 'crate',
  name: 'Caisse',
  kind: 'object',
  footprint: [1, 1],
  height: 2,
  frames: 1,
  solid: true,
  container: true,
  capacity: 30,
  weight: 180,
  volume: 18,
});
def({
  id: 'bag',
  name: 'Sac',
  kind: 'object',
  footprint: [1, 1],
  height: 1,
  frames: 1,
  takeable: true,
  container: true,
  capacity: 20,
  weight: 5,
  volume: 3,
});

// --- Objets transportables ------------------------------------------------

def({ id: 'bread', name: 'Miche de pain', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 5, volume: 1, food: 20, value: 2 });
def({ id: 'apple', name: 'Pomme', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 2, volume: 1, food: 8, value: 1 });
def({ id: 'ale', name: 'Chope de biere', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 8, volume: 2, food: 5, value: 3 });
def({ id: 'gold', name: 'Piece d\'or', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 1, volume: 0, value: 1, stackable: true });
def({ id: 'key', name: 'Clef', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 1, volume: 0, value: 5 });
// Arme de depart. Sans elle, l'Avatar frappe a mains nues pour deux points :
// le premier combat est alors perdu d'avance, ce qui se lit comme un bug.
def({ id: 'dagger', name: 'Dague', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 20, volume: 3, damage: 4, value: 25 });
def({ id: 'sword', name: 'Epee', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 60, volume: 6, damage: 8, value: 60 });
def({ id: 'hammer', name: 'Marteau de forge', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 40, volume: 4, damage: 5, value: 20 });
def({ id: 'torch', name: 'Torche', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 10, volume: 2, light: 4, value: 4 });
def({ id: 'lute', name: 'Luth', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 30, volume: 8, value: 45 });

// --- Acteurs --------------------------------------------------------------
// 8 frames : 4 directions x 2 poses de marche.

def({ id: 'avatar', name: 'Avatar', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true, combatant: true, attack: 14, defense: 12 });
def({ id: 'townsman', name: 'Villageois', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true, defense: 8 });
def({ id: 'townswoman', name: 'Villageoise', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true, defense: 8 });
def({ id: 'guard', name: 'Garde', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true, combatant: true, attack: 15, defense: 14 });
def({ id: 'smith', name: 'Forgeron', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true, defense: 10 });
def({ id: 'brigand', name: 'Brigand', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true, faction: 'brigand', combatant: true, attack: 11, defense: 9 });

/** Recupere une shape, en levant une erreur si l'identifiant est inconnu. */
export function getShape(id: string): ShapeDef {
  const shape = defs.get(id);
  if (!shape) throw new Error(`Shape inconnue : ${id}`);
  return shape;
}

export function hasShape(id: string): boolean {
  return defs.has(id);
}

export function allShapes(): ShapeDef[] {
  return [...defs.values()];
}

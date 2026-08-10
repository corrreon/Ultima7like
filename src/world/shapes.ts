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
  /** Valeur marchande, en pieces d'or. */
  value?: number;
  /** L'objet s'empile (or, fleches...). */
  stackable?: boolean;
  /** Les acteurs traversent la tuile mais y sont ralentis / en surbrillance. */
  surface?: 'water' | 'road' | 'interior';
}

const defs = new Map<string, ShapeDef>();

function def(shape: ShapeDef): ShapeDef {
  defs.set(shape.id, shape);
  return shape;
}

// --- Terrains -------------------------------------------------------------

def({ id: 'grass', name: 'Herbe', kind: 'terrain', footprint: [1, 1], height: 0, frames: 4 });
def({ id: 'dirt', name: 'Terre battue', kind: 'terrain', footprint: [1, 1], height: 0, frames: 2, surface: 'road' });
def({ id: 'sand', name: 'Sable', kind: 'terrain', footprint: [1, 1], height: 0, frames: 2 });
def({ id: 'water', name: 'Eau', kind: 'terrain', footprint: [1, 1], height: 0, frames: 2, solid: true, surface: 'water' });
def({ id: 'stone', name: 'Dalle de pierre', kind: 'terrain', footprint: [1, 1], height: 0, frames: 2 });
def({ id: 'woodfloor', name: 'Plancher', kind: 'terrain', footprint: [1, 1], height: 0, frames: 2, surface: 'interior' });

// --- Decor et mobilier ----------------------------------------------------

def({ id: 'wall', name: 'Mur', kind: 'object', footprint: [1, 1], height: 5, frames: 1, solid: true });
def({ id: 'roof', name: 'Toit', kind: 'object', footprint: [1, 1], height: 1, frames: 1, roof: true });
def({ id: 'door', name: 'Porte', kind: 'object', footprint: [1, 1], height: 5, frames: 2, solid: true, door: true });
def({ id: 'tree', name: 'Arbre', kind: 'object', footprint: [1, 1], height: 6, frames: 2, solid: true });
def({ id: 'bush', name: 'Buisson', kind: 'object', footprint: [1, 1], height: 1, frames: 1 });
def({ id: 'table', name: 'Table', kind: 'object', footprint: [1, 1], height: 2, frames: 1, solid: true });
def({ id: 'chair', name: 'Chaise', kind: 'object', footprint: [1, 1], height: 2, frames: 1 });
def({ id: 'bed', name: 'Lit', kind: 'object', footprint: [1, 2], height: 1, frames: 1 });
def({ id: 'anvil', name: 'Enclume', kind: 'object', footprint: [1, 1], height: 2, frames: 1, solid: true });
def({ id: 'sign', name: 'Enseigne', kind: 'object', footprint: [1, 1], height: 3, frames: 1, solid: true });
def({
  id: 'lamppost',
  name: 'Reverbere',
  kind: 'object',
  footprint: [1, 1],
  height: 5,
  frames: 1,
  solid: true,
  light: 4,
  lightAtNight: true,
});
def({
  id: 'hearth',
  name: 'Ame',
  kind: 'object',
  footprint: [1, 1],
  height: 3,
  frames: 2,
  solid: true,
  light: 4,
});

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
def({ id: 'sword', name: 'Epee', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 60, volume: 6, damage: 8, value: 60 });
def({ id: 'hammer', name: 'Marteau de forge', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 40, volume: 4, damage: 5, value: 20 });
def({ id: 'torch', name: 'Torche', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 10, volume: 2, light: 4, value: 4 });
def({ id: 'lute', name: 'Luth', kind: 'object', footprint: [1, 1], height: 1, frames: 1, takeable: true, weight: 30, volume: 8, value: 45 });

// --- Acteurs --------------------------------------------------------------
// 8 frames : 4 directions x 2 poses de marche.

def({ id: 'avatar', name: 'Avatar', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true });
def({ id: 'townsman', name: 'Villageois', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true });
def({ id: 'townswoman', name: 'Villageoise', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true });
def({ id: 'guard', name: 'Garde', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true });
def({ id: 'smith', name: 'Forgeron', kind: 'actor', footprint: [1, 1], height: 4, frames: 8, solid: true });

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

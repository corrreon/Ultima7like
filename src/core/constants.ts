/**
 * Constantes du moteur.
 *
 * Reperes historiques (Ultima VII / Exult) :
 *  - une tuile fait 8x8 pixels a l'ecran, la carte du monde fait 3072x3072 tuiles ;
 *  - le monde est decoupe en « chunks » de 16x16 tuiles, eux-memes groupes en
 *    « superchunks » de 16x16 chunks (soit les 192 fichiers u7chunks/u7map) ;
 *  - la hauteur (« lift ») va de 0 a 15 et decale le sprite en diagonale.
 *
 * On garde la meme structure logique, avec des tuiles de 32 px : assez pour
 * accueillir de vrais dessins (voir src/render/atlas.ts) sans que le detail
 * parte a la reduction. Les sprites procéduraux sont, eux, dessines sur une
 * base de 16 px puis agrandis au plus proche voisin — l'aspect est identique
 * et cela evite de replacer a la main chaque pixel de la cinquantaine de
 * sprites existants.
 */

/** Taille d'une tuile en pixels logiques. */
export const TILE_SIZE = 32;

/** Decalage ecran, en pixels, applique par niveau de hauteur (lift). */
export const LIFT_OFFSET = TILE_SIZE / 2;

/** Cote d'un chunk, en tuiles. */
export const CHUNK_SIZE = 16;

/** Nombre de niveaux de hauteur adressables. */
export const MAX_LIFT = 16;

/** Pas de simulation fixe, en secondes. */
export const FIXED_DT = 1 / 60;

/** Nombre de minutes de jeu ecoulees par seconde reelle. */
export const GAME_MINUTES_PER_SECOND = 1;

/** Vitesse de marche par defaut, en tuiles par seconde. */
export const WALK_SPEED = 3.2;

/** Poids maximum porte par un acteur, en 1/10 de stone (comme U7). */
export const DEFAULT_MAX_WEIGHT = 800;

/** Directions cardinales et diagonales, dans l'ordre utilise par les sprites. */
export const DIRECTIONS = [
  { dx: 0, dy: -1, name: 'north' },
  { dx: 1, dy: 0, name: 'east' },
  { dx: 0, dy: 1, name: 'south' },
  { dx: -1, dy: 0, name: 'west' },
] as const;

export type DirectionIndex = 0 | 1 | 2 | 3;

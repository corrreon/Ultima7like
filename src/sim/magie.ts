import type { Actor } from '../objects/actor';
import type { GameObject } from '../objects/gameobject';

/**
 * La magie.
 *
 * Le dernier grand systeme d'Ultima VII qui manquait. Ce qui le distingue d'une
 * simple liste de pouvoirs, et ce qu'il faut reprendre, tient en trois points :
 *
 * **Les reactifs sont des objets ordinaires.** Ils se ramassent, s'achetent, se
 * volent, se perdent, pesent dans le sac. Un sort n'est donc pas un bouton mais
 * une depense, et c'est ce qui donne un sens a fouiller une reserve. Le moteur
 * n'a rien de special a faire pour cela : les reactifs sont des shapes comme le
 * pain.
 *
 * **Le grimoire est un objet.** Sans lui, pas de sorts — on peut le poser, le
 * perdre, se le faire prendre.
 *
 * **Le cout est double** : des reactifs consommes, et de la magie qui se
 * regenere avec le temps. L'un limite l'usage repete d'un meme sort, l'autre
 * l'enchainement de plusieurs. Un seul des deux suffirait a rendre la magie
 * gratuite ou inutilisable.
 *
 * Module pur : il ne connait ni le monde, ni le rendu, ni l'horloge. Il repond
 * a « ce sort est-il lancable » et « que consomme-t-il », l'effet lui-meme
 * revenant a l'appelant.
 */

/** Ce qu'un sort produit. L'appelant traduit en evenement de jeu. */
export type EffetSort = 'soin' | 'lumiere' | 'foudre' | 'ouverture';

export interface Sort {
  id: string;
  nom: string;
  /**
   * Cercle, de 1 a 3. Il ne sert qu'a ordonner le grimoire et a lire la
   * puissance d'un coup d'oeil — la difficulte reelle est dans le cout.
   */
  cercle: number;
  /** Magie consommee. */
  cout: number;
  /** Shapes de reactifs consommes, une unite chacun. */
  reactifs: string[];
  effet: EffetSort;
  /** Intensite : points rendus, degats infliges, rayon eclaire. */
  puissance: number;
  description: string;
}

/**
 * Les sorts.
 *
 * Quatre, un par usage : se soigner, s'eclairer, frapper, ouvrir. C'est le
 * minimum pour que la magie soit un outil et non une decoration — chacun
 * repond a une situation ou le joueur etait jusqu'ici sans recours.
 */
export const SORTS: Sort[] = [
  {
    id: 'soin',
    nom: 'Guerison',
    cercle: 1,
    cout: 6,
    reactifs: ['ginseng'],
    effet: 'soin',
    puissance: 18,
    description: 'Referme les plaies. Moins qu\'une nuit de sommeil, mais sur-le-champ.',
  },
  {
    id: 'lumiere',
    nom: 'Lumiere',
    cercle: 1,
    cout: 4,
    reactifs: ['soufre'],
    effet: 'lumiere',
    puissance: 6,
    description: 'Un halo froid qui suit le lanceur, une minute et demie.',
  },
  {
    id: 'foudre',
    nom: 'Trait de foudre',
    cercle: 2,
    cout: 10,
    reactifs: ['soufre', 'perle'],
    effet: 'foudre',
    puissance: 14,
    description: 'Frappe l\'ennemi le plus proche, sans s\'approcher de lui.',
  },
  {
    id: 'ouverture',
    nom: 'Ouverture',
    cercle: 2,
    cout: 8,
    reactifs: ['racine'],
    effet: 'ouverture',
    puissance: 1,
    description: 'Fait sauter une serrure. La clef reste plus discrete.',
  },
];

export function sortParId(id: string): Sort | undefined {
  return SORTS.find((s) => s.id === id);
}

/** Shape du grimoire. Sans lui dans l'inventaire, aucun sort n'est lancable. */
export const GRIMOIRE = 'spellbook';

/** Le lanceur porte-t-il un grimoire ? */
export function aUnGrimoire(lanceur: Actor): boolean {
  return lanceur.findItem(GRIMOIRE) !== null;
}

/** Compte les reactifs de cette shape portes par le lanceur, conteneurs compris. */
export function compterReactif(lanceur: Actor, shape: string): number {
  let total = 0;
  const parcourir = (obj: GameObject): void => {
    for (const enfant of obj.contents) {
      if (enfant.shapeId === shape) total += enfant.quantity;
      parcourir(enfant);
    }
  };
  parcourir(lanceur);
  return total;
}

/** Pourquoi un sort ne peut pas etre lance, ou null s'il le peut. */
export type Obstacle = 'grimoire' | 'magie' | 'reactifs';

export function obstacle(sort: Sort, lanceur: Actor): Obstacle | null {
  if (!aUnGrimoire(lanceur)) return 'grimoire';
  if (lanceur.mana < sort.cout) return 'magie';
  for (const reactif of sort.reactifs) {
    if (compterReactif(lanceur, reactif) < 1) return 'reactifs';
  }
  return null;
}

export function peutLancer(sort: Sort, lanceur: Actor): boolean {
  return obstacle(sort, lanceur) === null;
}

/**
 * Consomme le cout d'un sort. Retourne false sans rien prelever si le lanceur
 * ne peut pas le payer.
 *
 * On preleve **avant** d'appliquer l'effet : un sort dont l'effet echoue a
 * quand meme coute, ce qui est la regle partout ailleurs dans le jeu — une
 * fleche tiree est perdue meme si elle rate.
 */
export function payer(sort: Sort, lanceur: Actor): boolean {
  if (!peutLancer(sort, lanceur)) return false;
  lanceur.mana -= sort.cout;
  for (const reactif of sort.reactifs) retirerUn(lanceur, reactif);
  return true;
}

/** Retire une unite de cette shape, en vidant les tas avant les objets isoles. */
function retirerUn(lanceur: Actor, shape: string): boolean {
  const trouver = (obj: GameObject): GameObject | null => {
    for (const enfant of obj.contents) {
      if (enfant.shapeId === shape) return enfant;
      const dedans = trouver(enfant);
      if (dedans) return dedans;
    }
    return null;
  };
  const cible = trouver(lanceur);
  if (!cible) return false;
  if (cible.quantity > 1) cible.quantity--;
  else cible.detach();
  return true;
}

/**
 * Magie regagnee par seconde reelle.
 *
 * Lente a dessein : soixante magie prennent deux minutes a revenir, soit le
 * temps d'aller quelque part. Une regeneration rapide ferait de chaque sort un
 * geste gratuit qu'on repete en attendant, et les reactifs ne pesent pas assez
 * pour l'en empecher.
 */
export const REGENERATION = 0.5;

export function regenerer(actor: Actor, dt: number): void {
  if (actor.mana >= actor.maxMana) return;
  actor.mana = Math.min(actor.maxMana, actor.mana + REGENERATION * dt);
}

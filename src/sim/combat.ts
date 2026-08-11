import type { Rng } from '../core/rng';
import type { Actor } from '../objects/actor';
import type { GameObject } from '../objects/gameobject';
import { getShape } from '../world/shapes';

/**
 * Combat en temps reel avec pause, comme dans l'original.
 *
 * Ultima VII ne met pas le jeu en mode combat : les coups tombent pendant que
 * le monde continue, et la pause sert a reprendre la main quand ca tourne mal.
 * C'est ce qu'on reproduit — le combat n'est pas une scene separee, c'est la
 * meme boucle avec des acteurs qui se frappent.
 *
 * Ce module est pur : il ne connait ni le rendu, ni l'horloge, ni le monde. Il
 * repond a une seule question — que se passe-t-il quand X frappe Y — et se
 * verifie donc entierement en test, a graine fixee.
 */

/** Degats a mains nues. Frapper reste possible sans arme, mais mal. */
export const POINGS = 2;

/** Delai entre deux coups, en secondes. */
export const CADENCE = 1.2;

/** Portee d'une attaque au corps a corps, en tuiles (distance de Tchebychev). */
export const PORTEE = 1;

/**
 * Distance a laquelle un combattant hostile remarque une cible.
 *
 * Volontairement courte. Elle ne regle pas la difficulte d'un duel mais le
 * nombre d'adversaires qu'on affronte a la fois — la seule variable qui decide
 * vraiment de l'issue d'un combat en temps reel. Trop large, un campement
 * charge en bloc et il n'existe aucune facon de l'aborder.
 */
export const VIGILANCE = 5;

export interface Coup {
  touche: boolean;
  degats: number;
  /** Arme employee, absente si le coup est porte a mains nues. */
  arme: GameObject | null;
  /** La cible tombe sous ce coup. */
  fatal: boolean;
}

/**
 * Meilleure arme portee par un acteur.
 *
 * On fouille l'arborescence complete : une epee rangee dans un sac reste une
 * epee. Ultima VII demande de l'equiper explicitement ; ici l'acteur se sert
 * du mieux qu'il a, ce qui evite une couche d'emplacements d'equipement dont
 * le reste du jeu n'a pas encore besoin.
 */
export function meilleureArme(actor: Actor): GameObject | null {
  let best: GameObject | null = null;
  let bestDamage = 0;
  const examiner = (obj: GameObject): void => {
    for (const child of obj.contents) {
      const damage = child.shape.damage ?? 0;
      if (damage > bestDamage) {
        best = child;
        bestDamage = damage;
      }
      examiner(child);
    }
  };
  examiner(actor);
  return best;
}

export function degatsArme(arme: GameObject | null): number {
  return arme?.shape.damage ?? POINGS;
}

function stat(actor: Actor, nom: 'attack' | 'defense', defaut: number): number {
  return getShape(actor.shapeId)[nom] ?? defaut;
}

/**
 * Probabilite de toucher.
 *
 * Bornee des deux cotes : un combattant tres superieur ne doit pas toucher a
 * tous les coups, sinon la pause ne sert a rien — et un tres inferieur doit
 * garder une chance, sinon fuir est la seule option et le jeu n'en propose pas
 * encore.
 */
export function chanceDeToucher(attaquant: Actor, cible: Actor): number {
  const ecart = stat(attaquant, 'attack', 10) - stat(cible, 'defense', 10);
  return Math.min(0.9, Math.max(0.2, 0.55 + ecart * 0.04));
}

/** Deux acteurs de camps differents sont hostiles. */
export function estHostile(a: Actor, b: Actor): boolean {
  if (a === b || !a.isAlive || !b.isAlive) return false;
  return faction(a) !== faction(b);
}

export function faction(actor: Actor): string {
  return getShape(actor.shapeId).faction ?? 'ville';
}

/** L'acteur se bat-il, ou subit-il ? */
export function combattant(actor: Actor): boolean {
  return getShape(actor.shapeId).combatant === true;
}

/** Distance de Tchebychev, celle de la grille : la diagonale vaut un pas. */
export function distance(a: Actor, b: Actor): number {
  return Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty));
}

/**
 * Resout un coup et l'applique.
 *
 * L'application fait partie de la resolution : separer les deux inviterait a
 * calculer un coup sans le porter, et donc a le porter deux fois.
 */
export function frapper(attaquant: Actor, cible: Actor, rng: Rng): Coup {
  const arme = meilleureArme(attaquant);
  const touche = rng.next() < chanceDeToucher(attaquant, cible);
  if (!touche) return { touche: false, degats: 0, arme, fatal: false };

  const max = degatsArme(arme);
  const degats = rng.int(Math.ceil(max / 2), max);
  cible.hp = Math.max(0, cible.hp - degats);
  return { touche: true, degats, arme, fatal: !cible.isAlive };
}

/**
 * Cible la plus proche, parmi les acteurs hostiles a portee de vue.
 *
 * On ne demande pas de ligne de vue : un mur separe deja les acteurs par le
 * pathfinding, et exiger la vue ferait perdre sa cible a un brigand des qu'un
 * tonneau passe entre eux.
 */
export function cibleLaPlusProche(
  actor: Actor,
  acteurs: readonly Actor[],
  portee = VIGILANCE,
): Actor | null {
  let best: Actor | null = null;
  let bestDistance = portee + 1;
  for (const autre of acteurs) {
    if (!estHostile(actor, autre)) continue;
    const d = distance(actor, autre);
    if (d < bestDistance) {
      best = autre;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Ce qu'un acteur laisse en mourant.
 *
 * Le contenu tombe sur sa tuile plutot que de disparaitre avec lui : le
 * brigand qui vous a assomme portait une epee, elle doit rester quelque part.
 */
export function depouiller(actor: Actor): GameObject[] {
  const tombes = [...actor.contents];
  for (const objet of tombes) {
    objet.detach();
    objet.tx = actor.tx;
    objet.ty = actor.ty;
    objet.tz = 0;
  }
  return tombes;
}

import type { Actor } from '../objects/actor';
import { faction } from './combat';

/**
 * Recuperer de la vie.
 *
 * Il manquait au jeu la seconde moitie du combat : on pouvait perdre des points
 * de vie, jamais en regagner. Une fois les brigands rencontres, la partie ne
 * pouvait donc qu'aller en se degradant — ce qui n'est pas une difficulte, mais
 * une impasse.
 *
 * Deux voies, comme dans l'original, et elles ne se valent pas :
 *
 * - **manger** rend peu, tout de suite, n'importe ou. C'est le depannage entre
 *   deux coups, et c'est ce qui donne enfin une raison de ramasser le pain ;
 * - **dormir** rend tout, mais consomme la nuit et exige un lit et le calme.
 *   C'est la vraie remise en etat.
 *
 * Module pur : ni monde, ni rendu, ni horloge. Il repond a « combien » et « le
 * peut-on », le reste est du ressort de l'appelant.
 */

/** Heure a laquelle on se reveille. */
export const HEURE_REVEIL = 7;

/**
 * Distance a laquelle un hostile empeche de dormir.
 *
 * Genereuse a dessein : se reveiller a cote d'un brigand qui vous frappait
 * pendant votre sommeil serait la pire facon d'apprendre la regle.
 */
export const DISTANCE_MENACE = 14;

/**
 * Points rendus par un aliment.
 *
 * Le quart de sa valeur nutritive, au minimum un point. Une miche rend 5, un
 * jambon 8, une pomme 2 : de quoi finir un combat, jamais de quoi s'en
 * dispenser. Si le rapport etait meilleur, dormir n'aurait plus d'interet et le
 * pain deviendrait une potion.
 */
export function soinsDuRepas(food: number): number {
  return Math.max(1, Math.round(food / 4));
}

/** Applique des soins sans depasser le maximum. Retourne les points rendus. */
export function soigner(actor: Actor, points: number): number {
  const avant = actor.hp;
  actor.hp = Math.min(actor.maxHp, actor.hp + points);
  return actor.hp - avant;
}

/** Le premier hostile assez proche pour interdire le sommeil, s'il y en a un. */
export function menaceProche(dormeur: Actor, acteurs: readonly Actor[]): Actor | null {
  for (const autre of acteurs) {
    if (autre === dormeur || !autre.isAlive) continue;
    if (faction(autre) === faction(dormeur)) continue;
    const ecart = Math.max(Math.abs(autre.tx - dormeur.tx), Math.abs(autre.ty - dormeur.ty));
    if (ecart <= DISTANCE_MENACE) return autre;
  }
  return null;
}

/** Ce qu'a donne une tentative de repos. */
export type Repos =
  | { kind: 'menace'; par: Actor }
  | { kind: 'inutile' }
  | { kind: 'dormi'; soignes: number };

/**
 * Tente de faire dormir un groupe.
 *
 * Le groupe entier se soigne, pas seulement le dormeur : les compagnons
 * dorment aussi, et un compagnon qu'il faudrait soigner separement serait une
 * corvee sans interet.
 *
 * L'horloge n'est pas touchee ici — c'est a l'appelant de sauter a l'heure du
 * reveil s'il le veut, ce qui garde ce module verifiable sans horloge.
 */
export function reposer(dormeur: Actor, groupe: readonly Actor[], acteurs: readonly Actor[]): Repos {
  const menace = menaceProche(dormeur, acteurs);
  if (menace) return { kind: 'menace', par: menace };

  const dormeurs = [dormeur, ...groupe.filter((a) => a !== dormeur && a.isAlive)];
  if (dormeurs.every((a) => a.hp >= a.maxHp)) return { kind: 'inutile' };

  let soignes = 0;
  for (const acteur of dormeurs) soignes += soigner(acteur, acteur.maxHp);
  return { kind: 'dormi', soignes };
}

import type { Actor } from '../objects/actor';
import { combattant } from './combat';

/**
 * Le groupe.
 *
 * Ultima VII se joue rarement seul : on recrute, et le groupe suit sans qu'on
 * ait a le piloter. C'est aussi ce qui rend le combat jouable — un homme seul
 * contre trois n'a aucune chance, quelle que soit la façon dont on regle les
 * degats.
 *
 * Module pur : il ne connait ni le monde, ni le rendu, ni le pathfinding. Il
 * repond a deux questions — qui peut rejoindre, et ou chaque compagnon doit se
 * tenir — et se verifie donc entierement en test.
 */

/**
 * Compagnons au maximum, l'Avatar non compris.
 *
 * Deux, et pas huit comme l'original. Ce n'est pas une limite technique mais
 * une limite de contenu : au-dela, il n'y a plus assez d'habitants nommes dans
 * le bourg pour que recruter veuille dire quelque chose.
 */
export const MAX_COMPAGNONS = 2;

/** Distance au-dela de laquelle un compagnon se remet en marche. */
export const LAISSE = 2;

/** Distance au-dela de laquelle il a decroche pour de bon et recalcule. */
export const DISTANCE_PERDUE = 12;

/** Compagnons actuels, dans l'ordre ou ils ont rejoint. */
export function compagnons(acteurs: readonly Actor[]): Actor[] {
  return acteurs.filter((a) => a.inParty && a.isAlive);
}

/** Le groupe est-il complet ? */
export function groupePlein(acteurs: readonly Actor[]): boolean {
  return compagnons(acteurs).length >= MAX_COMPAGNONS;
}

/**
 * Decalage « derriere le meneur », selon la direction ou il regarde.
 *
 * Les compagnons se placent dans le dos, pas autour : marcher devant celui
 * qu'on suit est la meilleure facon de lui bloquer le passage, et le moteur
 * traite les acteurs comme des obstacles.
 */
function derriere(dir: number): { dx: number; dy: number } {
  switch (dir) {
    case 0: return { dx: 0, dy: 1 }; // il regarde au nord
    case 1: return { dx: -1, dy: 0 }; // a l'est
    case 3: return { dx: 1, dy: 0 }; // a l'ouest
    default: return { dx: 0, dy: -1 }; // au sud
  }
}

/**
 * Place assignee au compagnon d'indice `index`, derriere le meneur.
 *
 * Les places s'echelonnent d'abord en profondeur puis en largeur : le premier
 * juste derriere, le second derriere et decale. La formation tourne avec le
 * meneur, sans quoi elle se defait des qu'il change de cap.
 */
export function place(leader: Actor, index: number): { tx: number; ty: number } {
  const { dx, dy } = derriere(leader.dir);
  // Perpendiculaire au sens de marche, pour ecarter le second compagnon.
  const cx = dy;
  const cy = -dx;
  const profondeur = 1 + Math.floor(index / 2);
  const cote = index % 2 === 0 ? 0 : 1;
  return {
    tx: leader.tx + dx * profondeur + cx * cote,
    ty: leader.ty + dy * profondeur + cy * cote,
  };
}

/**
 * Cet acteur peut-il etre recrute maintenant ?
 *
 * On ne verifie pas ici les conditions d'histoire — c'est le role des drapeaux
 * de dialogue. Seulement ce qui rendrait le recrutement absurde.
 */
export function peutRejoindre(actor: Actor, acteurs: readonly Actor[]): boolean {
  if (actor.inParty || !actor.isAlive) return false;
  return !groupePlein(acteurs);
}

/** Fait entrer un acteur dans le groupe. */
export function recruter(actor: Actor, leader: Actor): void {
  actor.inParty = true;
  actor.path.length = 0;
  actor.activity = 'stand';
  actor.atPost = false;
  // Il entre en garde si le meneur y est deja : degainer a deux, c'est
  // degainer ensemble.
  actor.inCombat = leader.inCombat && combattant(actor);
}

/** Renvoie un compagnon. Il reprend son emploi du temps la ou il en etait. */
export function congedier(actor: Actor): void {
  actor.inParty = false;
  actor.inCombat = false;
  actor.target = null;
  actor.path.length = 0;
  actor.atPost = false;
}

/**
 * Met le groupe au diapason du meneur pour le mode combat.
 *
 * Un compagnon qui garderait l'arme au fourreau pendant que l'Avatar se bat
 * serait au mieux inutile, au pire mortel : c'est justement pour ne pas avoir
 * a le piloter qu'on l'a recrute.
 */
export function accorderCombat(leader: Actor, acteurs: readonly Actor[]): void {
  for (const compagnon of compagnons(acteurs)) {
    compagnon.inCombat = leader.inCombat && combattant(compagnon);
    if (!compagnon.inCombat) compagnon.target = null;
  }
}

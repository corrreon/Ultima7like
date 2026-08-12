import type { Actor } from '../objects/actor';
import { GameObject } from '../objects/gameobject';

/**
 * Achat et vente.
 *
 * Ultima VII n'a pas de magasin : on parle a quelqu'un, et ce quelqu'un a une
 * bourse et des marchandises, comme n'importe quel autre acteur. On garde ce
 * principe — le stock d'un marchand est un conteneur ordinaire dans son
 * inventaire, et l'or est un objet empilable, pas un compteur.
 *
 * Consequence utile : voler un marchand, lui rendre son bien ou le tuer et le
 * depouiller fonctionnent sans une ligne de code de plus.
 *
 * Module pur : ni rendu, ni monde, ni horloge.
 */

/** Nom du conteneur qui tient les marchandises d'un PNJ. */
export const ETAL = 'Marchandises';

/**
 * Marge du marchand, et decote a la revente.
 *
 * L'ecart entre les deux est son gagne-pain. Sans lui, acheter et revendre en
 * boucle serait une machine a fabriquer de l'or — le defaut classique du
 * commerce dans un jeu.
 */
export const MARGE = 1.5;
export const DECOTE = 0.5;

export function prixAchat(obj: GameObject): number {
  return Math.max(1, Math.round((obj.shape.value ?? 0) * MARGE));
}

export function prixVente(obj: GameObject): number {
  return Math.max(1, Math.round((obj.shape.value ?? 0) * DECOTE));
}

/** L'objet a-t-il une valeur marchande ? L'or ne se vend pas a lui-meme. */
export function negociable(obj: GameObject): boolean {
  return (obj.shape.value ?? 0) > 0 && obj.shapeId !== 'gold';
}

/** Etal d'un acteur, s'il en tient un. */
export function etal(actor: Actor): GameObject | null {
  return actor.contents.find((o) => o.customName === ETAL) ?? null;
}

export function estMarchand(actor: Actor): boolean {
  return etal(actor) !== null;
}

/** Total des pieces portees, a n'importe quelle profondeur. */
export function bourse(porteur: GameObject): number {
  let total = 0;
  const parcourir = (obj: GameObject): void => {
    for (const enfant of obj.contents) {
      if (enfant.shapeId === 'gold') total += enfant.quantity;
      parcourir(enfant);
    }
  };
  parcourir(porteur);
  return total;
}

/**
 * Retire des pieces, en vidant les tas un a un.
 *
 * Retourne false sans rien toucher si la somme n'y est pas : une transaction
 * a moitie faite est pire qu'une transaction refusee.
 */
export function payer(porteur: GameObject, montant: number): boolean {
  if (montant <= 0) return true;
  if (bourse(porteur) < montant) return false;

  let reste = montant;
  const tas: GameObject[] = [];
  const collecter = (obj: GameObject): void => {
    for (const enfant of obj.contents) {
      if (enfant.shapeId === 'gold') tas.push(enfant);
      collecter(enfant);
    }
  };
  collecter(porteur);

  for (const pile of tas) {
    if (reste <= 0) break;
    const pris = Math.min(pile.quantity, reste);
    pile.quantity -= pris;
    reste -= pris;
    if (pile.quantity <= 0) pile.detach();
  }
  return true;
}

/**
 * Ajoute des pieces, en grossissant un tas existant si possible.
 *
 * Retourne false si rien ne peut les accueillir — a l'appelant de les faire
 * tomber au sol plutot que de les evaporer.
 */
export function crediter(porteur: GameObject, montant: number): boolean {
  if (montant <= 0) return true;
  const existant = porteur.findDeep((o) => o.shapeId === 'gold');
  if (existant) {
    existant.quantity += montant;
    return true;
  }
  return porteur.add(new GameObject({ shape: 'gold', quantity: montant }));
}

export type Echec =
  | 'pas_assez_d_or'
  | 'trop_lourd'
  | 'marchand_sans_or'
  | 'sans_valeur'
  | 'pas_marchand';

export type Resultat = { ok: true; prix: number } | { ok: false; raison: Echec };

/**
 * Achete un objet de l'etal.
 *
 * L'ordre compte : on verifie tout avant de deplacer quoi que ce soit. Deplacer
 * l'objet puis echouer a le payer laisserait le client avec un bien vole et le
 * marchand sans rien dire.
 */
export function acheter(client: Actor, marchand: Actor, objet: GameObject): Resultat {
  const stock = etal(marchand);
  if (!stock || !stock.contains(objet)) return { ok: false, raison: 'pas_marchand' };

  const prix = prixAchat(objet);
  if (bourse(client) < prix) return { ok: false, raison: 'pas_assez_d_or' };
  // Un acteur accepte n'importe quel objet dans son inventaire : sa contrainte
  // est le poids, pas le volume. Interroger `canAccept` ici ne refuserait donc
  // jamais rien — c'est la surcharge qu'il faut regarder.
  if (client.carriedWeight + objet.totalWeight > client.maxWeight) {
    return { ok: false, raison: 'trop_lourd' };
  }

  payer(client, prix);
  client.add(objet);
  crediter(marchand, prix);
  return { ok: true, prix };
}

/** Vend un objet au marchand. */
export function vendre(client: Actor, marchand: Actor, objet: GameObject): Resultat {
  const stock = etal(marchand);
  if (!stock) return { ok: false, raison: 'pas_marchand' };
  if (!negociable(objet)) return { ok: false, raison: 'sans_valeur' };

  const prix = prixVente(objet);
  if (bourse(marchand) < prix) return { ok: false, raison: 'marchand_sans_or' };
  if (!stock.canAccept(objet)) return { ok: false, raison: 'trop_lourd' };

  payer(marchand, prix);
  stock.add(objet);
  crediter(client, prix);
  return { ok: true, prix };
}

/** Ce que le client peut vendre : tout ce qui a une valeur, hors or et etal. */
export function vendables(client: Actor): GameObject[] {
  const sortie: GameObject[] = [];
  const parcourir = (obj: GameObject): void => {
    for (const enfant of obj.contents) {
      if (negociable(enfant)) sortie.push(enfant);
      parcourir(enfant);
    }
  };
  parcourir(client);
  return sortie;
}

export const MOTIFS: Record<Echec, string> = {
  pas_assez_d_or: 'Vous n\'avez pas de quoi payer.',
  trop_lourd: 'Vous ne pouvez pas en porter davantage.',
  marchand_sans_or: 'Sa bourse est vide.',
  sans_valeur: 'Cela ne vaut rien.',
  pas_marchand: 'Cette personne ne fait pas commerce.',
};

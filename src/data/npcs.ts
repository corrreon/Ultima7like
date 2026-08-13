import { Actor } from '../objects/actor';
import { GameObject } from '../objects/gameobject';
import type { World } from '../world/world';
import { craftsmanSchedule } from '../sim/schedule';
import { LANDMARKS, LOGIS_PREFIX, PORTES } from './town';
import { ETAL } from '../script/commerce';
import { Rng } from '../core/rng';
import { habitantsQuelconques } from './habitants';
import './dialogue';

/**
 * Habitants quelconques, en plus des quatre personnages nommes.
 *
 * Quarante, parce que la ville compte vingt maisons a deux lits :
 * le nombre n'est pas choisi, il est **impose par la carte**. Loger davantage
 * de monde demande de batir, ce qui est la bonne contrainte — une ville se
 * peuple en construisant, pas en changeant une constante.
 */
const HABITANTS_QUELCONQUES = 40;

/**
 * Habitants de Valmoret.
 *
 * Chacun a un lit, un poste de travail et des habitudes. C'est cette densite
 * d'emplois du temps — et non la sophistication de l'IA — qui donne
 * l'impression d'un bourg vivant : a 3 h du matin les rues sont vides, a midi
 * la taverne est pleine.
 */

export interface Population {
  avatar: Actor;
  npcs: Actor[];
}

/**
 * Donne a un PNJ une bourse et un etal.
 *
 * Le stock est un conteneur ordinaire dans son inventaire, et l'or un objet
 * empilable : rien d'autre que du mobilier de jeu. C'est ce qui fait que
 * voler un marchand, lui rendre son bien ou le depouiller apres l'avoir tue
 * fonctionnent sans une ligne de code supplementaire.
 */
function approvisionner(marchand: Actor, or: number, marchandises: string[]): void {
  marchand.add(new GameObject({ shape: 'gold', quantity: or }));
  // Une besace, et non une caisse : une caisse pese dix-huit stones, que le
  // marchand trainerait toute la journee sur son emploi du temps.
  const stock = new GameObject({ shape: 'bag', name: ETAL });
  marchand.add(stock);
  for (const shape of marchandises) stock.add(new GameObject({ shape }));
}

export function populate(world: World): Population {
  const L = LANDMARKS;

  const avatar = new Actor({
    shape: 'avatar',
    displayName: 'l\'Avatar',
    tx: L.avatarStart.tx,
    ty: L.avatarStart.ty,
    maxHp: 60,
    maxMana: 60,
    speed: 3.6,
  });
  // Equipement de depart : de quoi manger, s'eclairer et payer.
  const pack = new GameObject({ shape: 'bag' });
  pack.add(new GameObject({ shape: 'bread' }));
  pack.add(new GameObject({ shape: 'apple' }));
  avatar.add(pack);
  avatar.add(new GameObject({ shape: 'torch' }));
  avatar.add(new GameObject({ shape: 'dagger' }));
  avatar.add(new GameObject({ shape: 'gold', quantity: 25 }));
  // Le grimoire et de quoi lancer deux ou trois sorts. Partir sans grimoire
  // rendrait la magie invisible : rien dans le jeu ne dirait qu'elle existe.
  avatar.add(new GameObject({ shape: 'spellbook' }));
  const reactifs = new GameObject({ shape: 'bag', name: 'Sachet de reactifs' });
  for (const [shape, quantity] of [['ginseng', 3], ['soufre', 3], ['perle', 2], ['racine', 2]] as const) {
    reactifs.add(new GameObject({ shape, quantity }));
  }
  avatar.add(reactifs);
  world.addActor(avatar);

  const npcs: Actor[] = [];

  // Mireille : la taverne est a la fois son domicile et son travail.
  const mireille = new Actor({
    shape: 'townswoman',
    displayName: 'Mireille',
    tx: L.tavernHearth.tx,
    ty: L.tavernHearth.ty + 1,
    conversationId: 'mireille',
    speed: 2.6,
    schedule: [
      { hour: 0, activity: 'sleep', ...L.tavernBedA },
      { hour: 6, activity: 'work', ...L.tavernHearth },
      { hour: 12, activity: 'eat', ...L.tavernTableB },
      { hour: 13, activity: 'work', ...L.tavernHearth },
      { hour: 19, activity: 'work', ...L.tavernCorner },
      { hour: 23, activity: 'sleep', ...L.tavernBedA },
    ],
  });
  mireille.add(new GameObject({ shape: 'key', quality: 1 }));
  approvisionner(mireille, 90, ['bread', 'bread', 'ale', 'ale', 'ale', 'apple', 'apple', 'ham',
    'ginseng', 'soufre', 'perle', 'racine']);
  npcs.push(mireille);

  // Aldric : la journee type d'un artisan.
  const aldric = new Actor({
    shape: 'smith',
    displayName: 'Aldric',
    tx: L.smithyAnvil.tx + 1,
    ty: L.smithyAnvil.ty,
    conversationId: 'aldric',
    speed: 2.8,
    maxHp: 45,
    schedule: craftsmanSchedule({
      bed: L.smithyBed,
      work: L.smithyAnvil,
      tavern: L.tavernTableA,
      square: L.square,
    }),
  });
  aldric.add(new GameObject({ shape: 'hammer' }));
  approvisionner(aldric, 140, ['dagger', 'sword', 'hammer', 'torch', 'key']);
  npcs.push(aldric);

  // Basile : leve tard, flane, joue le soir.
  const basile = new Actor({
    shape: 'townsman',
    displayName: 'Basile',
    tx: L.bardBed.tx,
    ty: L.bardBed.ty + 1,
    conversationId: 'basile',
    speed: 3.0,
    schedule: [
      { hour: 0, activity: 'sleep', ...L.bardBed },
      { hour: 9, activity: 'eat', ...L.bardTable },
      { hour: 10, activity: 'wander', ...L.square, radius: 5 },
      { hour: 14, activity: 'eat', ...L.tavernTableB },
      { hour: 15, activity: 'wander', ...L.crossroads, radius: 6 },
      { hour: 19, activity: 'work', ...L.tavernCorner },
      { hour: 1, activity: 'sleep', ...L.bardBed },
    ],
  });
  npcs.push(basile);

  // Jehan : patrouille de jour sur la place, de nuit sur les routes.
  const jehan = new Actor({
    shape: 'guard',
    displayName: 'Jehan',
    tx: L.square.tx,
    ty: L.square.ty,
    conversationId: 'jehan',
    speed: 3.0,
    maxHp: 70,
    schedule: [
      { hour: 0, activity: 'patrol', ...L.crossroads },
      { hour: 2, activity: 'sleep', ...L.guardBed },
      { hour: 8, activity: 'eat', ...L.guardTable },
      { hour: 9, activity: 'wander', ...L.square, radius: 4 },
      { hour: 13, activity: 'eat', ...L.tavernTableA },
      { hour: 14, activity: 'wander', ...L.square, radius: 4 },
      { hour: 20, activity: 'eat', ...L.guardTable },
      { hour: 21, activity: 'wander', ...L.crossroads, radius: 8 },
    ],
  });
  jehan.add(new GameObject({ shape: 'sword' }));
  npcs.push(jehan);

  // Ysoire, herboriste. Elle vend les reactifs et en demande : sans elle, la
  // magie serait une reserve qui s'epuise sans jamais se refaire.
  const ysoire = new Actor({
    shape: 'townswoman',
    displayName: 'Ysoire',
    tx: L.square.tx + 4,
    ty: L.square.ty + 2,
    conversationId: 'ysoire',
    speed: 2.5,
    maxHp: 35,
    schedule: [
      { hour: 0, activity: 'sleep', tx: L.square.tx + 6, ty: L.square.ty + 4 },
      { hour: 7, activity: 'work', tx: L.square.tx + 4, ty: L.square.ty + 2, radius: 2 },
      { hour: 13, activity: 'eat', ...L.tavernTableB },
      { hour: 14, activity: 'work', tx: L.square.tx + 4, ty: L.square.ty + 2, radius: 2 },
      { hour: 21, activity: 'sleep', tx: L.square.tx + 6, ty: L.square.ty + 4 },
    ],
  });
  approvisionner(ysoire, 120, ['ginseng', 'ginseng', 'soufre', 'soufre', 'perle', 'racine', 'spellbook']);
  npcs.push(ysoire);

  // Garin, capitaine des portes. Sa ronde va d'une porte a l'autre : c'est ce
  // qui donne au rempart quelqu'un qui le parcourt.
  const garin = new Actor({
    shape: 'guard',
    displayName: 'Garin',
    tx: L.crossroads.tx,
    ty: L.crossroads.ty + 2,
    conversationId: 'garin',
    speed: 3.0,
    maxHp: 75,
    schedule: [
      { hour: 0, activity: 'patrol', tx: PORTES[0].tx, ty: PORTES[0].ty - 3 },
      { hour: 3, activity: 'sleep', ...L.guardBed },
      { hour: 8, activity: 'wander', tx: PORTES[2].tx - 3, ty: PORTES[2].ty, radius: 3 },
      { hour: 13, activity: 'eat', ...L.guardTable },
      { hour: 15, activity: 'wander', tx: PORTES[0].tx, ty: PORTES[0].ty - 4, radius: 3 },
      { hour: 20, activity: 'patrol', ...L.crossroads },
    ],
  });
  garin.add(new GameObject({ shape: 'sword' }));
  npcs.push(garin);

  // Brigands. Ils n'ont pas d'emploi du temps : leur seule occupation est de
  // flaner autour de leur feu, et de tomber sur quiconque s'en approche.
  //
  // Ils sont espaces d'au moins sept tuiles, soit plus que leur vigilance : on
  // peut donc en aborder un sans que les autres accourent. Serres, ils
  // chargeaient en bloc et le campement n'avait aucune facon d'etre pris.
  const campements: Array<[number, number, string]> = [
    [0, 0, 'Brigand'],
    [7, 3, 'Brigand'],
    [-3, 7, 'Chef de bande'],
  ];
  for (const [dx, dy, nom] of campements) {
    const brigand = new Actor({
      shape: 'brigand',
      displayName: nom,
      tx: L.camp.tx + dx,
      ty: L.camp.ty + dy,
      maxHp: nom === 'Chef de bande' ? 42 : 26,
      speed: 2.9,
      // Rayon serre : une flanerie large les rassemblerait a nouveau.
      schedule: [{ hour: 0, activity: 'wander', tx: L.camp.tx + dx, ty: L.camp.ty + dy, radius: 2 }],
    });
    brigand.add(new GameObject({ shape: nom === 'Chef de bande' ? 'sword' : 'hammer' }));
    // La clef de la reserve, sur le chef : c'est ce qui relie le campement a
    // la taverne, et fait d'un combat la solution d'une porte fermee.
    if (nom === 'Chef de bande') brigand.add(new GameObject({ shape: 'key', quality: 5 }));
    brigand.add(new GameObject({ shape: 'gold', quantity: nom === 'Chef de bande' ? 40 : 12 }));
    npcs.push(brigand);
  }

  // Les habitants quelconques. Ils n'ont ni quete ni portrait propre, et c'est
  // le principe : une ville est faite de gens qui ne sont pas des personnages.
  // Voir `habitants.ts` pour le raisonnement.
  //
  // Graine fixe : l'empreinte de carte tient compte des habitants et de ce
  // qu'ils portent, donc un tirage different a chaque lancement refuserait
  // toutes les sauvegardes.
  const rng = new Rng(20250812);
  for (const habitant of habitantsQuelconques(HABITANTS_QUELCONQUES, {
    place: L.square,
    taverne: L.tavernTableB,
    lits: litsDuQuartier(world),
  }, rng)) {
    npcs.push(habitant);
  }

  for (const npc of npcs) {
    // Un emploi du temps genere peut tomber sur un mur ou dans l'etang. On
    // ecarte la personne plutot que de la laisser naitre dans la pierre : elle
    // en sortirait au premier pas, mais on l'aurait vue dedans.
    const libre = caseLibreAutour(world, npc.tx, npc.ty);
    npc.tx = libre.tx;
    npc.ty = libre.ty;
    npc.px = npc.tx;
    npc.py = npc.ty;
    world.addActor(npc);
  }

  return { avatar, npcs };
}

/**
 * Les lits du quartier d'habitation, dans un ordre stable.
 *
 * Lus depuis la carte plutot que recopies : ajouter une maison suffit a loger
 * deux habitants de plus, sans toucher a ce fichier. Le tri rend l'attribution
 * reproductible, ce dont l'empreinte de carte a besoin — `allObjects` parcourt
 * des chunks dont l'ordre n'est pas garanti.
 */
function litsDuQuartier(world: World): Array<{ tx: number; ty: number }> {
  return [...world.allObjects()]
    .filter((o) => o.shapeId === 'bed'
      && (world.regionAt(o.tx, o.ty)?.name.startsWith(LOGIS_PREFIX) ?? false))
    .map((o) => ({ tx: o.tx, ty: o.ty }))
    .sort((a, b) => a.ty - b.ty || a.tx - b.tx);
}

/** Premiere case franchissable en spirale autour de celle-ci. */
function caseLibreAutour(world: World, tx: number, ty: number): { tx: number; ty: number } {
  if (!world.isBlocked(tx, ty)) return { tx, ty };
  for (let rayon = 1; rayon <= 6; rayon++) {
    for (let dy = -rayon; dy <= rayon; dy++) {
      for (let dx = -rayon; dx <= rayon; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rayon) continue;
        if (!world.isBlocked(tx + dx, ty + dy)) return { tx: tx + dx, ty: ty + dy };
      }
    }
  }
  return { tx, ty };
}

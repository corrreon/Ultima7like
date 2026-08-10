import { Actor } from '../objects/actor';
import { GameObject } from '../objects/gameobject';
import type { World } from '../world/world';
import { craftsmanSchedule } from '../sim/schedule';
import { LANDMARKS } from './town';
import './dialogue';

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

export function populate(world: World): Population {
  const L = LANDMARKS;

  const avatar = new Actor({
    shape: 'avatar',
    displayName: 'l\'Avatar',
    tx: L.avatarStart.tx,
    ty: L.avatarStart.ty,
    maxHp: 60,
    speed: 3.6,
  });
  // Equipement de depart : de quoi manger, s'eclairer et payer.
  const pack = new GameObject({ shape: 'bag' });
  pack.add(new GameObject({ shape: 'bread' }));
  pack.add(new GameObject({ shape: 'apple' }));
  avatar.add(pack);
  avatar.add(new GameObject({ shape: 'torch' }));
  avatar.add(new GameObject({ shape: 'gold', quantity: 25 }));
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

  for (const npc of npcs) {
    npc.px = npc.tx;
    npc.py = npc.ty;
    world.addActor(npc);
  }

  return { avatar, npcs };
}

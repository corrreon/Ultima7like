import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Actor } from '../src/objects/actor';
import { GameObject } from '../src/objects/gameobject';
import { buildTown } from '../src/data/town';
import { populate } from '../src/data/npcs';
import {
  POINGS,
  chanceDeToucher,
  cibleLaPlusProche,
  combattant,
  degatsArme,
  depouiller,
  estHostile,
  faction,
  frapper,
  meilleureArme,
} from '../src/sim/combat';

function acteur(shape: string, tx = 0, ty = 0, hp = 30): Actor {
  const a = new Actor({ shape, displayName: shape, tx, ty, maxHp: hp });
  a.px = tx;
  a.py = ty;
  return a;
}

describe('combat', () => {
  it('tire les camps et l\'humeur de la shape, pas de l\'acteur', () => {
    // C'est ce qui dispense la sauvegarde de retenir quoi que ce soit de plus.
    expect(faction(acteur('avatar'))).toBe('ville');
    expect(faction(acteur('brigand'))).toBe('brigand');
    expect(estHostile(acteur('avatar'), acteur('brigand'))).toBe(true);
    expect(estHostile(acteur('avatar'), acteur('guard'))).toBe(false);

    expect(combattant(acteur('guard'))).toBe(true);
    // Une aubergiste n'a pas a charger un brigand.
    expect(combattant(acteur('townswoman'))).toBe(false);
  });

  it('ne compte jamais un mort comme hostile', () => {
    const a = acteur('avatar');
    const b = acteur('brigand');
    b.hp = 0;
    expect(estHostile(a, b)).toBe(false);
  });

  it('choisit la meilleure arme, meme rangee au fond d\'un sac', () => {
    const a = acteur('avatar');
    expect(meilleureArme(a)).toBeNull();
    expect(degatsArme(null)).toBe(POINGS);

    a.add(new GameObject({ shape: 'hammer' })); // 5 degats
    const sac = new GameObject({ shape: 'bag' });
    a.add(sac);
    const epee = new GameObject({ shape: 'sword' }); // 8 degats
    sac.add(epee);

    expect(meilleureArme(a)).toBe(epee);
    expect(degatsArme(meilleureArme(a))).toBe(8);
  });

  it('borne les chances de toucher des deux cotes', () => {
    // Un combattant tres superieur ne doit pas toucher a tous les coups,
    // sinon la pause ne sert a rien ; un tres inferieur doit garder une
    // chance, sinon fuir serait la seule option — et le jeu n'en propose pas.
    const p = chanceDeToucher(acteur('guard'), acteur('brigand'));
    expect(p).toBeGreaterThan(0.5);
    expect(p).toBeLessThanOrEqual(0.9);
    expect(chanceDeToucher(acteur('brigand'), acteur('guard'))).toBeGreaterThanOrEqual(0.2);
  });

  it('retire des points de vie et signale le coup fatal', () => {
    const rng = new Rng(7);
    const attaquant = acteur('avatar');
    attaquant.add(new GameObject({ shape: 'sword' }));
    const cible = acteur('brigand', 1, 0, 100);

    let coups = 0;
    let touches = 0;
    while (cible.isAlive && coups < 200) {
      const coup = frapper(attaquant, cible, rng);
      coups++;
      if (coup.touche) {
        touches++;
        expect(coup.degats).toBeGreaterThanOrEqual(4); // moitie des degats d'arme
        expect(coup.degats).toBeLessThanOrEqual(8);
      }
      expect(coup.fatal).toBe(!cible.isAlive);
    }
    expect(cible.hp).toBe(0);
    expect(touches).toBeGreaterThan(0);
    // Les points de vie ne descendent jamais sous zero.
    expect(cible.hp).toBeGreaterThanOrEqual(0);
  });

  it('est deterministe a graine fixee', () => {
    const rejouer = () => {
      const rng = new Rng(1234);
      const a = acteur('avatar');
      a.add(new GameObject({ shape: 'sword' }));
      const b = acteur('brigand', 1, 0, 60);
      const suite: number[] = [];
      for (let i = 0; i < 20; i++) suite.push(frapper(a, b, rng).degats);
      return suite.join(',');
    };
    expect(rejouer()).toBe(rejouer());
  });

  it('prend la cible hostile la plus proche, et ignore le reste', () => {
    const avatar = acteur('avatar', 10, 10);
    const loin = acteur('brigand', 10, 16);
    const pres = acteur('brigand', 12, 10);
    const ami = acteur('guard', 10, 11);
    const acteurs = [avatar, loin, pres, ami];

    expect(cibleLaPlusProche(avatar, acteurs)).toBe(pres);
    // Hors de portee de vue : personne.
    expect(cibleLaPlusProche(avatar, acteurs, 1)).toBeNull();
    // Un garde ne voit pas d'ennemi dans l'Avatar.
    expect(cibleLaPlusProche(ami, [avatar, ami])).toBeNull();
  });

  it('fait tomber au sol ce que portait le mort', () => {
    const brigand = acteur('brigand', 5, 6);
    brigand.add(new GameObject({ shape: 'sword' }));
    brigand.add(new GameObject({ shape: 'gold', quantity: 12 }));

    const tombes = depouiller(brigand);
    expect(tombes).toHaveLength(2);
    expect(brigand.contents).toHaveLength(0);
    for (const objet of tombes) {
      expect(objet.parent).toBeNull();
      expect([objet.tx, objet.ty]).toEqual([5, 6]);
    }
  });
});

describe('le campement de brigands', () => {
  const world = buildTown();
  const { avatar, npcs } = populate(world);
  const brigands = npcs.filter((n) => n.shapeId === 'brigand');

  it('existe, arme et hostile', () => {
    expect(brigands.length).toBeGreaterThanOrEqual(3);
    for (const b of brigands) {
      expect(estHostile(avatar, b)).toBe(true);
      expect(meilleureArme(b)).not.toBeNull();
    }
  });

  it('tient sur des cases libres', () => {
    for (const b of brigands) {
      expect(world.isBlocked(b.tx, b.ty), `brigand bloque en ${b.tx},${b.ty}`).toBe(false);
      expect(world.regionAt(b.tx, b.ty), 'un brigand campe dans un batiment').toBeNull();
    }
  });

  it('reste loin du bourg', () => {
    // Le combat n'a d'interet que si on le cherche : on ne doit pas tomber
    // dessus en sortant de la taverne.
    for (const b of brigands) {
      const d = Math.max(Math.abs(b.tx - avatar.tx), Math.abs(b.ty - avatar.ty));
      expect(d, 'un brigand campe trop pres du depart').toBeGreaterThan(20);
    }
  });
});

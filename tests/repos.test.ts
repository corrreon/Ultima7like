import { describe, expect, it } from 'vitest';
import { Actor } from '../src/objects/actor';
import { GameClock } from '../src/core/clock';
import {
  DISTANCE_MENACE,
  HEURE_REVEIL,
  reposer,
  soigner,
  soinsDuRepas,
} from '../src/sim/repos';

const avatar = (hp: number): Actor => {
  const a = new Actor({ shape: 'avatar', displayName: 'Avatar', maxHp: 40 });
  a.hp = hp;
  return a;
};

describe('recuperer de la vie', () => {
  it('rend un quart de la valeur nutritive, au moins un point', () => {
    expect(soinsDuRepas(20)).toBe(5); // miche
    expect(soinsDuRepas(30)).toBe(8); // jambon
    expect(soinsDuRepas(8)).toBe(2); // pomme
    expect(soinsDuRepas(1)).toBe(1); // rien ne rend zero
  });

  it('ne depasse jamais le maximum', () => {
    const a = avatar(38);
    expect(soigner(a, 10)).toBe(2);
    expect(a.hp).toBe(40);
    expect(soigner(a, 10)).toBe(0);
  });

  it('refuse le sommeil quand un hostile rode', () => {
    const a = avatar(10);
    const brigand = new Actor({ shape: 'brigand', displayName: 'Brigand' });
    brigand.tx = a.tx + DISTANCE_MENACE;
    brigand.ty = a.ty;

    const issue = reposer(a, [], [a, brigand]);
    expect(issue.kind).toBe('menace');
    expect(a.hp).toBe(10);

    // Un pas de plus, et le sommeil redevient possible.
    brigand.tx += 1;
    expect(reposer(a, [], [a, brigand]).kind).toBe('dormi');
    expect(a.hp).toBe(40);
  });

  it('ne compte pas un villageois comme une menace', () => {
    const a = avatar(10);
    const voisin = new Actor({ shape: 'townsman', displayName: 'Basile' });
    voisin.tx = a.tx + 1;
    expect(reposer(a, [], [a, voisin]).kind).toBe('dormi');
  });

  it('soigne tout le groupe, pas seulement le dormeur', () => {
    const a = avatar(10);
    const compagnon = new Actor({ shape: 'guard', displayName: 'Jehan', maxHp: 50 });
    compagnon.hp = 20;
    compagnon.inParty = true;

    const issue = reposer(a, [compagnon], [a, compagnon]);
    expect(issue).toEqual({ kind: 'dormi', soignes: 60 });
    expect(compagnon.hp).toBe(50);
  });

  it('ne fait pas passer la nuit pour rien', () => {
    const a = avatar(40);
    expect(reposer(a, [], [a]).kind).toBe('inutile');
  });
});

describe('saut d\'horloge', () => {
  it('avance jusqu\'au matin suivant', () => {
    const nuit = new GameClock(22, 0);
    expect(nuit.skipToHour(HEURE_REVEIL)).toBe(9 * 60);
    expect(nuit.hour).toBe(HEURE_REVEIL);
    expect(nuit.day).toBe(2);
  });

  it('avance toujours, jamais en arriere', () => {
    // Dormir a 7 h pile doit mener au lendemain 7 h, pas rester sur place.
    const matin = new GameClock(HEURE_REVEIL, 0);
    expect(matin.skipToHour(HEURE_REVEIL)).toBe(24 * 60);
    expect(matin.day).toBe(2);

    const tot = new GameClock(3, 30);
    expect(tot.skipToHour(HEURE_REVEIL)).toBe(3 * 60 + 30);
    expect(tot.day).toBe(1);
  });
});

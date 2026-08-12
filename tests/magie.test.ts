import { describe, expect, it } from 'vitest';
import { Actor } from '../src/objects/actor';
import { GameObject } from '../src/objects/gameobject';
import {
  GRIMOIRE,
  SORTS,
  compterReactif,
  obstacle,
  payer,
  peutLancer,
  regenerer,
  sortParId,
} from '../src/sim/magie';

/** Un mage equipe : grimoire, magie pleine, et les reactifs demandes. */
function mage(reactifs: Record<string, number> = {}): Actor {
  const a = new Actor({ shape: 'avatar', displayName: 'Avatar', maxHp: 60, maxMana: 60 });
  a.add(new GameObject({ shape: GRIMOIRE }));
  const sac = new GameObject({ shape: 'bag' });
  a.add(sac);
  for (const [shape, quantity] of Object.entries(reactifs)) {
    sac.add(new GameObject({ shape, quantity }));
  }
  return a;
}

const soin = sortParId('soin')!;
const foudre = sortParId('foudre')!;

describe('magie', () => {
  it('exige un grimoire, de la magie et des reactifs', () => {
    const nu = new Actor({ shape: 'avatar', displayName: 'Avatar', maxMana: 60 });
    expect(obstacle(soin, nu)).toBe('grimoire');

    const sansReactif = mage();
    expect(obstacle(soin, sansReactif)).toBe('reactifs');

    const epuise = mage({ ginseng: 3 });
    epuise.mana = 1;
    expect(obstacle(soin, epuise)).toBe('magie');

    expect(obstacle(soin, mage({ ginseng: 1 }))).toBeNull();
  });

  it('trouve les reactifs au fond des conteneurs imbriques', () => {
    const a = mage();
    const sac = a.contents.find((o) => o.isContainer)!;
    const poche = new GameObject({ shape: 'bag' });
    poche.add(new GameObject({ shape: 'ginseng', quantity: 2 }));
    sac.add(poche);
    expect(compterReactif(a, 'ginseng')).toBe(2);
    expect(peutLancer(soin, a)).toBe(true);
  });

  it('preleve la magie et une unite de chaque reactif', () => {
    const a = mage({ soufre: 2, perle: 2 });
    expect(payer(foudre, a)).toBe(true);
    expect(a.mana).toBe(60 - foudre.cout);
    expect(compterReactif(a, 'soufre')).toBe(1);
    expect(compterReactif(a, 'perle')).toBe(1);
  });

  it('ne preleve rien quand le sort n\'est pas lancable', () => {
    // La regle qui compte : un echec ne doit jamais coûter a moitie.
    const a = mage({ soufre: 1 });
    expect(payer(foudre, a)).toBe(false);
    expect(a.mana).toBe(60);
    expect(compterReactif(a, 'soufre')).toBe(1);
  });

  it('retire le dernier reactif au lieu de laisser un tas vide', () => {
    const a = mage({ ginseng: 1 });
    expect(payer(soin, a)).toBe(true);
    expect(compterReactif(a, 'ginseng')).toBe(0);
    expect(a.findItem('ginseng')).toBeNull();
  });

  it('regenere la magie sans depasser le maximum', () => {
    const a = mage();
    a.mana = 0;
    regenerer(a, 10);
    expect(a.mana).toBeCloseTo(5);
    a.mana = a.maxMana - 0.1;
    regenerer(a, 10);
    expect(a.mana).toBe(a.maxMana);
  });

  it('ne propose que des sorts payables et distincts', () => {
    const ids = SORTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const sort of SORTS) {
      expect(sort.cout, `${sort.id} gratuit`).toBeGreaterThan(0);
      expect(sort.reactifs.length, `${sort.id} sans reactif`).toBeGreaterThan(0);
      // Un sort qui coute plus que la reserve de depart serait inatteignable.
      expect(sort.cout).toBeLessThanOrEqual(60);
    }
  });
});

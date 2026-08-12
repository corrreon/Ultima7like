import { describe, expect, it } from 'vitest';
import {
  LEGENDE,
  tousLesPlans,
  validerPlans,
  type Plan,
} from '../src/data/plans';
import { WORLD_SIZE } from '../src/data/town';
import { getShape } from '../src/world/shapes';

const plan = (rows: string[], ox = 0, oy = 0, name = 'Essai'): Plan => ({ name, ox, oy, rows });

describe('plans de carte', () => {
  it('accepte la carte livree', () => {
    // Le seul test qui compte vraiment : si la carte du jeu ne se valide pas,
    // tout le reste est du bruit.
    expect(validerPlans(tousLesPlans(), WORLD_SIZE)).toEqual([]);
  });

  it('repere deux batiments qui se chevauchent', () => {
    // Le defaut qui ne se voit pas : le second ecrase le premier en silence, et
    // on obtient une piece sans porte ou un lit dans un mur.
    const problemes = validerPlans([
      plan(['###', '#D#', '###'], 10, 10, 'Un'),
      plan(['###', '#D#', '###'], 11, 10, 'Deux'),
    ], WORLD_SIZE);
    expect(problemes.some((p) => p.includes('Deux') && p.includes('chevauche Un'))).toBe(true);
  });

  it('repere une ligne de longueur differente', () => {
    const problemes = validerPlans([plan(['#####', '#=D#', '#####'])], WORLD_SIZE);
    expect(problemes.some((p) => p.includes('ligne 1'))).toBe(true);
  });

  it('repere un symbole inconnu', () => {
    const problemes = validerPlans([plan(['###', '#Z#', '#D#'])], WORLD_SIZE);
    expect(problemes.some((p) => p.includes('symbole inconnu') && p.includes('Z'))).toBe(true);
  });

  it('repere un batiment sans porte', () => {
    const problemes = validerPlans([plan(['###', '#=#', '###'])], WORLD_SIZE);
    expect(problemes).toEqual(['Essai : aucune porte, le batiment est inaccessible']);
  });

  it('repere un batiment qui deborde de la carte', () => {
    const problemes = validerPlans([plan(['###', '#D#', '###'], WORLD_SIZE - 1, 4)], WORLD_SIZE);
    expect(problemes.some((p) => p.includes('deborde de la carte'))).toBe(true);
  });

  it('signale tout d\'un coup plutot que de s\'arreter au premier', () => {
    // Quand on vient de deplacer un quartier, on veut la liste complete.
    const problemes = validerPlans([
      plan(['###', '#Z#'], 0, 0, 'Un'),
      plan(['####'], 40, 40, 'Deux'),
    ], WORLD_SIZE);
    expect(problemes.length).toBeGreaterThanOrEqual(3);
    expect(problemes.some((p) => p.startsWith('Un'))).toBe(true);
    expect(problemes.some((p) => p.startsWith('Deux'))).toBe(true);
  });

  it('ne nomme que des shapes qui existent', () => {
    // Une legende qui pointe vers une shape inconnue ferait planter la pose du
    // batiment, loin d'ici et sans rapport apparent.
    for (const [char, symbole] of Object.entries(LEGENDE)) {
      expect(() => getShape(symbole.shape), `symbole ${char}`).not.toThrow();
    }
  });

  it('donne des frames deterministes', () => {
    // L'empreinte de sauvegarde en depend : deux generations de la meme carte
    // doivent produire exactement le meme monde.
    for (const symbole of Object.values(LEGENDE)) {
      if (!symbole.frame) continue;
      expect(symbole.frame(17, 23)).toBe(symbole.frame(17, 23));
      const frames = getShape(symbole.shape).frames;
      for (const [tx, ty] of [[0, 0], [17, 23], [95, 95], [42, 7]] as const) {
        const f = symbole.frame(tx, ty);
        expect(f, `${symbole.shape} en ${tx},${ty}`).toBeGreaterThanOrEqual(0);
        expect(f, `${symbole.shape} en ${tx},${ty}`).toBeLessThan(frames);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { World } from '../src/world/world';
import { terrainPriority, transitionsAt } from '../src/world/terrain';

function field(size: number, fill: string): World {
  const world = new World(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) world.setTerrain(x, y, fill);
  }
  return world;
}

describe('raccords entre terrains', () => {
  it('classe les terrains naturels par recouvrement', () => {
    expect(terrainPriority('grass')).toBeGreaterThan(terrainPriority('dirt'));
    expect(terrainPriority('dirt')).toBeGreaterThan(terrainPriority('sand'));
    expect(terrainPriority('sand')).toBeGreaterThan(terrainPriority('water'));
    // Les sols construits ont un bord net : ils ne debordent sur rien.
    expect(terrainPriority('stone')).toBe(0);
    expect(terrainPriority('woodfloor')).toBe(0);
  });

  it('ne produit aucun raccord en terrain uniforme', () => {
    const world = field(8, 'grass');
    expect(transitionsAt(world, 4, 4)).toHaveLength(0);
  });

  it('fait deborder l\'herbe sur la terre, jamais l\'inverse', () => {
    const world = field(8, 'grass');
    world.setTerrain(4, 4, 'dirt');

    // La tuile de terre recoit l'herbe par ses quatre cotes.
    const onDirt = transitionsAt(world, 4, 4);
    expect(onDirt).toHaveLength(4);
    expect(onDirt.every((t) => t.terrain === 'grass')).toBe(true);
    expect(onDirt.map((t) => t.dir).sort()).toEqual(['e', 'n', 's', 'w']);

    // La tuile d'herbe voisine ne recoit rien.
    expect(transitionsAt(world, 4, 3)).toHaveLength(0);
  });

  it('n\'ajoute un coin que si les cotes adjacents ne debordent pas deja', () => {
    const world = field(8, 'dirt');
    // Une seule tuile d'herbe en diagonale : le coin doit apparaitre.
    world.setTerrain(5, 3, 'grass');
    const withCorner = transitionsAt(world, 4, 4);
    expect(withCorner).toHaveLength(1);
    expect(withCorner[0]!.dir).toBe('ne');

    // On ajoute l'herbe au nord : le cote couvre desormais l'angle, le coin
    // doit disparaitre pour ne pas empiler deux liserés au meme endroit.
    world.setTerrain(4, 3, 'grass');
    const dirs = transitionsAt(world, 4, 4).map((t) => t.dir);
    expect(dirs).toContain('n');
    expect(dirs).not.toContain('ne');
  });

  it('empile les raccords du plus faible au plus fort', () => {
    const world = field(8, 'water');
    world.setTerrain(4, 3, 'sand'); // priorite 1
    world.setTerrain(3, 4, 'grass'); // priorite 3
    const order = transitionsAt(world, 4, 4).map((t) => t.terrain);
    expect(order).toEqual(['sand', 'grass']);
  });

  it('gere le bord de carte sans planter', () => {
    const world = field(8, 'grass');
    expect(() => transitionsAt(world, 0, 0)).not.toThrow();
    expect(() => transitionsAt(world, 7, 7)).not.toThrow();
  });
});

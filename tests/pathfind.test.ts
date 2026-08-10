import { describe, expect, it } from 'vitest';
import { World } from '../src/world/world';
import { GameObject } from '../src/objects/gameobject';
import { findPath } from '../src/sim/pathfind';

function emptyWorld(size = 24): World {
  const world = new World(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) world.setTerrain(x, y, 'grass');
  }
  return world;
}

describe('pathfinding', () => {
  it('trace une ligne droite en terrain libre', () => {
    const world = emptyWorld();
    const path = findPath(world, { tx: 2, ty: 2 }, { tx: 8, ty: 2 });
    expect(path).toHaveLength(6);
    expect(path.at(-1)).toEqual({ tx: 8, ty: 2 });
  });

  it('contourne un mur', () => {
    const world = emptyWorld();
    // Mur vertical perce nulle part entre x=5, y=0..10
    for (let y = 0; y <= 10; y++) {
      world.addObject(new GameObject({ shape: 'wall', tx: 5, ty: y }));
    }
    const path = findPath(world, { tx: 2, ty: 5 }, { tx: 8, ty: 5 });
    expect(path.length).toBeGreaterThan(6);
    // Aucun point du chemin ne traverse le mur.
    expect(path.some((step) => step.tx === 5 && step.ty <= 10)).toBe(false);
  });

  it('passe par une porte ouverte, pas par une porte fermee', () => {
    const world = emptyWorld();
    for (let y = 0; y < 24; y++) {
      if (y === 5) continue;
      world.addObject(new GameObject({ shape: 'wall', tx: 5, ty: y }));
    }
    const door = new GameObject({ shape: 'door', tx: 5, ty: 5 });
    world.addObject(door);

    expect(findPath(world, { tx: 2, ty: 5 }, { tx: 8, ty: 5 })).toHaveLength(0);

    door.frame = 1; // ouverte
    const path = findPath(world, { tx: 2, ty: 5 }, { tx: 8, ty: 5 });
    expect(path.length).toBeGreaterThan(0);
    expect(path).toContainEqual({ tx: 5, ty: 5 });
  });

  it('traverse une porte fermee si l\'acteur sait l\'ouvrir', () => {
    const world = emptyWorld();
    for (let y = 0; y < 24; y++) {
      if (y === 5) continue;
      world.addObject(new GameObject({ shape: 'wall', tx: 5, ty: y }));
    }
    world.addObject(new GameObject({ shape: 'door', tx: 5, ty: 5 })); // fermee

    // L'Avatar se cogne dedans...
    expect(findPath(world, { tx: 2, ty: 5 }, { tx: 8, ty: 5 })).toHaveLength(0);
    // ... mais un PNJ sait l'ouvrir en arrivant devant.
    const path = findPath(world, { tx: 2, ty: 5 }, { tx: 8, ty: 5 }, { openDoors: true });
    expect(path).toContainEqual({ tx: 5, ty: 5 });
  });

  it('retourne un chemin vide si la cible est enfermee', () => {
    const world = emptyWorld();
    for (const [x, y] of [[9, 10], [11, 10], [10, 9], [10, 11], [9, 9], [11, 11], [9, 11], [11, 9]]) {
      world.addObject(new GameObject({ shape: 'wall', tx: x!, ty: y! }));
    }
    expect(findPath(world, { tx: 2, ty: 2 }, { tx: 10, ty: 10 })).toHaveLength(0);
  });

  it('s\'arrete a distance quand une tolerance est donnee', () => {
    const world = emptyWorld();
    // La cible est un lit : occupee, donc inatteignable sans tolerance.
    world.addObject(new GameObject({ shape: 'chest', tx: 10, ty: 10 }));

    expect(findPath(world, { tx: 2, ty: 10 }, { tx: 10, ty: 10 })).toHaveLength(0);

    const path = findPath(world, { tx: 2, ty: 10 }, { tx: 10, ty: 10 }, { tolerance: 1 });
    expect(path.length).toBeGreaterThan(0);
    const last = path.at(-1)!;
    expect(Math.max(Math.abs(last.tx - 10), Math.abs(last.ty - 10))).toBe(1);
  });

  it('ne coupe pas les angles entre deux obstacles diagonaux', () => {
    const world = emptyWorld();
    world.addObject(new GameObject({ shape: 'wall', tx: 5, ty: 4 }));
    world.addObject(new GameObject({ shape: 'wall', tx: 4, ty: 5 }));

    const path = findPath(world, { tx: 4, ty: 4 }, { tx: 5, ty: 5 });
    // Le passage en diagonale directe est interdit : il faut contourner.
    expect(path.length).toBeGreaterThan(1);
  });
});

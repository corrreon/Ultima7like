import { describe, expect, it } from 'vitest';
import { World } from '../src/world/world';
import { GameObject } from '../src/objects/gameobject';
import { CHUNK_SIZE } from '../src/core/constants';
import { buildTown, LANDMARKS, WORLD_SIZE } from '../src/data/town';

describe('monde et chunks', () => {
  it('range les objets dans le chunk correspondant', () => {
    const world = new World(64, 64);
    const obj = new GameObject({ shape: 'tree', tx: 20, ty: 35 });
    world.addObject(obj);

    const chunk = world.chunkByIndex(Math.floor(20 / CHUNK_SIZE), Math.floor(35 / CHUNK_SIZE));
    expect(chunk?.objects).toContain(obj);
  });

  it('reindexe un objet qui change de chunk', () => {
    const world = new World(64, 64);
    const obj = new GameObject({ shape: 'bag', tx: 5, ty: 5 });
    world.addObject(obj);
    world.moveObject(obj, 40, 40);

    expect(world.chunkByIndex(0, 0)?.objects ?? []).not.toContain(obj);
    expect(world.chunkByIndex(2, 2)?.objects).toContain(obj);
    expect(world.objectsAt(40, 40)).toContain(obj);
  });

  it('tient compte de l\'emprise au sol', () => {
    const world = new World(64, 64);
    // Un lit fait 1x2 : sa tuile est le coin bas-droit, il s'etend vers le nord.
    const bed = new GameObject({ shape: 'bed', tx: 10, ty: 10 });
    world.addObject(bed);

    expect(world.objectsAt(10, 10)).toContain(bed);
    expect(world.objectsAt(10, 9)).toContain(bed);
    expect(world.objectsAt(10, 8)).not.toContain(bed);
    expect(world.objectsAt(11, 10)).not.toContain(bed);
  });

  it('trouve les objets par-dela les frontieres de chunk', () => {
    const world = new World(64, 64);
    // Objet a cheval sur la limite x = 16.
    const bed = new GameObject({ shape: 'bed', tx: 15, ty: 16 });
    world.addObject(bed);
    expect(world.objectsAt(15, 15)).toContain(bed);
    expect(world.objectsInRect(10, 10, 20, 20)).toContain(bed);
  });

  it('considere l\'eau et les murs comme infranchissables', () => {
    const world = new World(32, 32);
    world.setTerrain(3, 3, 'water');
    world.addObject(new GameObject({ shape: 'wall', tx: 5, ty: 5 }));

    expect(world.isBlocked(3, 3)).toBe(true);
    expect(world.isBlocked(5, 5)).toBe(true);
    expect(world.isBlocked(6, 6)).toBe(false);
    expect(world.isBlocked(-1, 0)).toBe(true);
  });

  it('libere le passage quand la porte s\'ouvre', () => {
    const world = new World(32, 32);
    const door = new GameObject({ shape: 'door', tx: 4, ty: 4 });
    world.addObject(door);
    expect(world.isBlocked(4, 4)).toBe(true);
    door.frame = 1;
    expect(world.isBlocked(4, 4)).toBe(false);
  });
});

describe('carte de Valmoret', () => {
  const world = buildTown();

  it('genere les quatre batiments', () => {
    expect(world.regions).toHaveLength(4);
    expect(world.regions.map((r) => r.name)).toContain('Taverne du Chat Endormi');
  });

  it('place les lieux de vie sur des tuiles coherentes', () => {
    const bedTiles = [LANDMARKS.tavernBedA, LANDMARKS.smithyBed, LANDMARKS.bardBed, LANDMARKS.guardBed];
    for (const tile of bedTiles) {
      const objects = world.objectsAt(tile.tx, tile.ty);
      expect(objects.some((o) => o.shapeId === 'bed')).toBe(true);
    }
    expect(world.objectsAt(LANDMARKS.smithyAnvil.tx, LANDMARKS.smithyAnvil.ty)
      .some((o) => o.shapeId === 'anvil')).toBe(true);
  });

  it('laisse l\'Avatar sur une case franchissable', () => {
    expect(world.isBlocked(LANDMARKS.avatarStart.tx, LANDMARKS.avatarStart.ty)).toBe(false);
  });

  it('reste dans ses limites', () => {
    expect(world.inBounds(WORLD_SIZE - 1, WORLD_SIZE - 1)).toBe(true);
    expect(world.inBounds(WORLD_SIZE, 0)).toBe(false);
  });

  it('remplit les contenants', () => {
    const chest = world.objectsAt(28, 29).find((o) => o.shapeId === 'chest');
    expect(chest).toBeDefined();
    expect(chest!.contents.length).toBeGreaterThan(0);
    expect(chest!.totalWeight).toBeGreaterThan(chest!.ownWeight);
  });
});

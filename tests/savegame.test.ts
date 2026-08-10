import { describe, expect, it } from 'vitest';
import { GameClock } from '../src/core/clock';
import { deserialize, serialize, SaveError, SAVE_VERSION, type GameState } from '../src/core/savegame';
import { GameObject } from '../src/objects/gameobject';
import { Actor } from '../src/objects/actor';
import { buildTown, LANDMARKS } from '../src/data/town';
import { populate } from '../src/data/npcs';

/** Une partie en cours, avec quelques modifications par rapport au depart. */
function playedGame(): GameState {
  const world = buildTown();
  const avatar = populate(world).avatar;
  const clock = new GameClock(14, 25);
  const flags = new Set<string>(['connait_luth', 'sait_epee']);

  // Le joueur a ouvert une porte, pris une epee et l'a rangee dans son sac.
  const door = world.objectsAt(31, 32).find((o) => o.shape.door)!;
  door.frame = 1;

  const chest = world.objectsAt(60, 28).find((o) => o.shapeId === 'chest')!;
  const sword = chest.contents.find((o) => o.shapeId === 'sword')!;
  const bag = avatar.contents.find((o) => o.shapeId === 'bag')!;
  sword.detach();
  bag.add(sword);

  // ... et pose une miche de pain au milieu de la place.
  const bread = new GameObject({ shape: 'bread', tx: 44, ty: 41 });
  world.addObject(bread);

  return { world, avatar, clock, flags };
}

function roundTrip(state: GameState): GameState {
  // On passe par JSON : c'est ce que fait reellement le stockage, et cela
  // garantit qu'aucune reference vivante ne survit au transit.
  return deserialize(JSON.parse(JSON.stringify(serialize(state))));
}

describe('sauvegarde', () => {
  it('restitue l\'horloge et les drapeaux de conversation', () => {
    const before = playedGame();
    const after = roundTrip(before);

    expect(after.clock.totalMinutes).toBe(before.clock.totalMinutes);
    expect(after.clock.format()).toBe(before.clock.format());
    expect([...after.flags].sort()).toEqual(['connait_luth', 'sait_epee']);
  });

  it('restitue le terrain a l\'identique', () => {
    const before = playedGame();
    const after = roundTrip(before);

    expect(after.world.widthTiles).toBe(before.world.widthTiles);
    for (const [tx, ty] of [[0, 0], [44, 41], [31, 32], [74, 60], [95, 95]] as Array<[number, number]>) {
      expect(after.world.terrainAt(tx, ty)).toBe(before.world.terrainAt(tx, ty));
      expect(after.world.terrainFrameAt(tx, ty)).toBe(before.world.terrainFrameAt(tx, ty));
    }
  });

  it('restitue le meme nombre d\'objets et d\'acteurs', () => {
    const before = playedGame();
    const after = roundTrip(before);

    expect([...after.world.allObjects()]).toHaveLength([...before.world.allObjects()].length);
    expect(after.world.actors).toHaveLength(before.world.actors.length);
    expect(after.world.regions).toHaveLength(before.world.regions.length);
  });

  it('conserve l\'etat des objets modifies', () => {
    const after = roundTrip(playedGame());

    // La porte est restee ouverte.
    const door = after.world.objectsAt(31, 32).find((o) => o.shape.door);
    expect(door?.frame).toBe(1);

    // Le pain pose sur la place est toujours la.
    expect(after.world.objectsAt(44, 41).some((o) => o.shapeId === 'bread')).toBe(true);

    // Le coffre du forgeron n'a plus son epee.
    const chest = after.world.objectsAt(60, 28).find((o) => o.shapeId === 'chest');
    expect(chest?.contents.some((o) => o.shapeId === 'sword')).toBe(false);
  });

  it('reconstruit l\'arborescence des contenants et le lien parent', () => {
    const after = roundTrip(playedGame());
    const avatar = after.avatar;

    const bag = avatar.contents.find((o) => o.shapeId === 'bag')!;
    expect(bag.parent).toBe(avatar);

    const sword = bag.contents.find((o) => o.shapeId === 'sword');
    expect(sword).toBeDefined();
    expect(sword!.parent).toBe(bag);
    // Le poids recalcule prouve que la chaine est complete.
    expect(avatar.carriedWeight).toBeGreaterThan(60);
    expect(sword!.worldPosition()).toEqual({
      tx: avatar.tx,
      ty: avatar.ty,
      tz: avatar.tz,
    });
  });

  it('restitue les PNJ avec leur emploi du temps et leur position', () => {
    const before = playedGame();
    const after = roundTrip(before);

    const source = before.world.actors.find((a) => a.displayName === 'Aldric')!;
    const loaded = after.world.actors.find((a) => a.displayName === 'Aldric')!;

    expect(loaded.px).toBeCloseTo(source.px);
    expect(loaded.py).toBeCloseTo(source.py);
    expect(loaded.hp).toBe(source.hp);
    expect(loaded.speed).toBe(source.speed);
    expect(loaded.conversationId).toBe('aldric');
    expect(loaded.schedule).toEqual(source.schedule);
    expect(loaded.findItem('hammer')).not.toBeNull();
  });

  it('designe bien l\'Avatar apres chargement', () => {
    const after = roundTrip(playedGame());
    expect(after.avatar).toBeInstanceOf(Actor);
    expect(after.avatar.displayName).toBe('l\'Avatar');
    expect(after.world.actors).toContain(after.avatar);
  });

  it('n\'attribue jamais deux fois le meme identifiant', () => {
    const after = roundTrip(playedGame());
    const ids = new Set<number>();
    const walk = (obj: GameObject): void => {
      expect(ids.has(obj.id)).toBe(false);
      ids.add(obj.id);
      obj.contents.forEach(walk);
    };
    for (const obj of after.world.allObjects()) walk(obj);
    for (const actor of after.world.actors) walk(actor);

    // Un objet cree apres le chargement ne doit pas reutiliser un identifiant.
    const fresh = new GameObject({ shape: 'apple' });
    expect(ids.has(fresh.id)).toBe(false);
  });

  it('laisse le monde jouable : l\'Avatar est sur une case franchissable', () => {
    const after = roundTrip(playedGame());
    expect(after.world.isBlocked(LANDMARKS.avatarStart.tx, LANDMARKS.avatarStart.ty)).toBe(false);
    expect(after.world.regionAt(32, 29)?.name).toBe('Taverne du Chat Endormi');
  });

  it('refuse une sauvegarde d\'une autre version', () => {
    const data = serialize(playedGame());
    data.v = SAVE_VERSION + 1;
    expect(() => deserialize(data)).toThrow(SaveError);
  });

  it('compresse le terrain par plages', () => {
    const data = serialize(playedGame());
    const tiles = data.w * data.h;
    const covered = data.terrain.reduce((sum, [, count]) => sum + count, 0);

    // Aucune case perdue, une variante par case, et bien moins de plages que
    // de cases — ce qui ne serait pas le cas si les variantes etaient encodees
    // avec les identifiants, puisqu'elles sont tirees au hasard.
    expect(covered).toBe(tiles);
    expect(data.tframes).toHaveLength(tiles);
    expect(data.terrain.length).toBeLessThan(tiles / 10);
  });
});

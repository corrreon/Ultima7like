import { describe, expect, it, beforeEach } from 'vitest';
import { GameObject, resetObjectIds } from '../src/objects/gameobject';
import { Actor } from '../src/objects/actor';

describe('conteneurs imbriques', () => {
  beforeEach(() => resetObjectIds());

  it('additionne le poids de maniere recursive', () => {
    const chest = new GameObject({ shape: 'chest' });
    const bag = new GameObject({ shape: 'bag' });
    bag.add(new GameObject({ shape: 'gold', quantity: 10 }));
    chest.add(bag);

    // coffre 200 + sac 5 + 10 pieces a 1 = 215
    expect(chest.totalWeight).toBe(215);
    expect(bag.totalWeight).toBe(15);
  });

  it('refuse un objet trop volumineux', () => {
    const bag = new GameObject({ shape: 'bag' }); // capacite 20
    for (let i = 0; i < 3; i++) {
      expect(bag.add(new GameObject({ shape: 'sword' }))).toBe(true); // 6 chacune
    }
    expect(bag.usedCapacity).toBe(18);
    expect(bag.add(new GameObject({ shape: 'sword' }))).toBe(false);
    expect(bag.contents).toHaveLength(3);
  });

  it('interdit qu\'un sac se contienne lui-meme', () => {
    const outer = new GameObject({ shape: 'chest' });
    const inner = new GameObject({ shape: 'bag' });
    outer.add(inner);
    expect(inner.add(outer)).toBe(false);
    expect(outer.add(outer)).toBe(false);
  });

  it('detache un objet de son ancien parent lors du transfert', () => {
    const a = new GameObject({ shape: 'chest' });
    const b = new GameObject({ shape: 'chest' });
    const bread = new GameObject({ shape: 'bread' });

    a.add(bread);
    expect(a.contents).toContain(bread);

    b.add(bread);
    expect(a.contents).not.toContain(bread);
    expect(b.contents).toContain(bread);
    expect(bread.parent).toBe(b);
  });

  it('remonte a la racine pour connaitre la position dans le monde', () => {
    const chest = new GameObject({ shape: 'chest', tx: 12, ty: 30 });
    const bag = new GameObject({ shape: 'bag' });
    const coin = new GameObject({ shape: 'gold' });
    bag.add(coin);
    chest.add(bag);

    expect(coin.worldPosition()).toEqual({ tx: 12, ty: 30, tz: 0 });
  });

  it('applique la surcharge a un acteur', () => {
    const actor = new Actor({ shape: 'townsman', displayName: 'Test' });
    expect(actor.isOverloaded).toBe(false);
    // 15 epees a 60 = 900 > 800
    for (let i = 0; i < 15; i++) actor.add(new GameObject({ shape: 'sword' }));
    expect(actor.carriedWeight).toBe(900);
    expect(actor.isOverloaded).toBe(true);
  });

  it('retrouve un objet enfoui dans l\'inventaire', () => {
    const actor = new Actor({ shape: 'avatar', displayName: 'Avatar' });
    const bag = new GameObject({ shape: 'bag' });
    const key = new GameObject({ shape: 'key', quality: 7 });
    bag.add(key);
    actor.add(bag);

    expect(actor.findItem('key')).toBe(key);
    expect(actor.findItem('sword')).toBeNull();
  });

  it('empile deux tas identiques mais pas deux qualites differentes', () => {
    const a = new GameObject({ shape: 'gold', quantity: 5 });
    const b = new GameObject({ shape: 'gold', quantity: 3 });
    const key = new GameObject({ shape: 'key' });

    expect(a.canStackWith(b)).toBe(true);
    expect(a.canStackWith(key)).toBe(false);
    // Les clefs ne sont pas empilables.
    expect(key.canStackWith(new GameObject({ shape: 'key' }))).toBe(false);
  });
});

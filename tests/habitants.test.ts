import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { habitantsQuelconques } from '../src/data/habitants';
import { getConversation } from '../src/script/conversation';
import { currentEntry } from '../src/sim/schedule';
import { buildTown, LANDMARKS, LOGIS_PREFIX } from '../src/data/town';
import { populate } from '../src/data/npcs';

// Seize lits factices : le quartier reel est verifie par les tests de carte.
const lits = Array.from({ length: 16 }, (_, i) => ({ tx: 12 + (i % 4) * 8, ty: 8 + Math.floor(i / 4) * 5 }));
const lieux = { place: LANDMARKS.square, taverne: LANDMARKS.tavernTableB, lits };
const foule = (n: number, graine = 1) => habitantsQuelconques(n, lieux, new Rng(graine));

describe('habitants quelconques', () => {
  it('donne a chacun un nom, un metier et de quoi vivre', () => {
    for (const h of foule(16)) {
      expect(h.displayName.length).toBeGreaterThan(2);
      expect(h.conversationId).toBeTruthy();
      expect(h.schedule.length).toBeGreaterThan(3);
      expect(h.findItem('gold')).not.toBeNull();
    }
  });

  it('ne fabrique pas seize fois la meme personne', () => {
    const gens = foule(16);
    // Les noms ne sont pas tous distincts — dans un bourg non plus — mais la
    // foule ne doit pas se reduire a une poignee de doublons.
    expect(new Set(gens.map((h) => h.displayName)).size).toBeGreaterThanOrEqual(10);
    expect(new Set(gens.map((h) => h.shapeId)).size).toBe(2);
  });

  it('est deterministe : l\'empreinte de carte en depend', () => {
    const a = foule(16).map((h) => h.displayName).join('|');
    const b = foule(16).map((h) => h.displayName).join('|');
    expect(a).toBe(b);
  });

  it('remplit la journee de bout en bout', () => {
    const h = foule(4)[0]!;
    // Une heure sans entree laisserait le PNJ sans activite prescrite.
    for (let heure = 0; heure < 24; heure++) {
      expect(currentEntry(h.schedule, heure), `rien a ${heure} h`).toBeDefined();
    }
    const activites = new Set(h.schedule.map((e) => e.activity));
    expect(activites.has('work')).toBe(true);
    expect(activites.has('sleep')).toBe(true);
  });

  it('sait quelque chose du bourg, pas seulement de soi', () => {
    // C'est le point : un passant qui ne parle que de lui est un figurant.
    const gens = foule(16);
    const rumeurs = gens.map((h) => {
      const conv = getConversation(h.conversationId!)!;
      return conv.topics.find((t) => t.id === 'rumeur')!.text;
    });
    expect(new Set(rumeurs).size).toBeGreaterThanOrEqual(4);
  });

  it('couche chacun dans un lit du quartier, et jamais a deux dans le meme', () => {
    // Le detail qui separe des figurants qui s'eteignent le soir de gens qui
    // rentrent chez eux : a vingt-deux heures la rue se vide et les maisons se
    // remplissent.
    const world = buildTown();
    populate(world);
    const quelconques = world.actors.filter((a) => a.conversationId?.startsWith('habitant_'));
    expect(quelconques.length).toBe(16);

    const occupes = new Set<string>();
    for (const habitant of quelconques) {
      const nuit = currentEntry(habitant.schedule, 23)!;
      expect(nuit.activity, `${habitant.displayName} ne dort pas a 23 h`).toBe('sleep');

      const lit = world.objectsAt(nuit.tx, nuit.ty).find((o) => o.shapeId === 'bed');
      expect(lit, `${habitant.displayName} dort en ${nuit.tx},${nuit.ty} sans lit`).toBeDefined();
      expect(world.regionAt(nuit.tx, nuit.ty)?.name.startsWith(LOGIS_PREFIX)).toBe(true);

      const clef = `${nuit.tx},${nuit.ty}`;
      expect(occupes.has(clef), `deux habitants dans le lit ${clef}`).toBe(false);
      occupes.add(clef);
    }
  });

  it('arrive dans le monde sur des cases franchissables', () => {
    const world = buildTown();
    populate(world);
    for (const actor of world.actors) {
      expect(
        world.isBlocked(actor.tx, actor.ty),
        `${actor.displayName} nait dans un obstacle en ${actor.tx},${actor.ty}`,
      ).toBe(false);
    }
    // Et le bourg est reellement peuple.
    expect(world.actors.length).toBeGreaterThanOrEqual(20);
  });
});

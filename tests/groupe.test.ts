import { describe, expect, it } from 'vitest';
import { Actor } from '../src/objects/actor';
import { buildTown } from '../src/data/town';
import { populate } from '../src/data/npcs';
import { ConversationState, getConversation } from '../src/script/conversation';
import { VUE_DU_CAMP, applyEffect, journal, refreshWorldFlags } from '../src/script/quests';
import { LANDMARKS } from '../src/data/town';
import { GameClock } from '../src/core/clock';
import { Rng } from '../src/core/rng';
import { ScheduleAI } from '../src/sim/ai';
import {
  MAX_COMPAGNONS,
  accorderCombat,
  compagnons,
  congedier,
  groupePlein,
  peutRejoindre,
  place,
  recruter,
} from '../src/sim/party';

function acteur(shape: string, tx = 10, ty = 10): Actor {
  const a = new Actor({ shape, displayName: shape, tx, ty });
  a.px = tx;
  a.py = ty;
  return a;
}

describe('formation', () => {
  it('range les compagnons derriere le meneur, quel que soit son cap', () => {
    const leader = acteur('avatar', 10, 10);

    // Marcher devant celui qu'on suit revient a lui bloquer le passage : le
    // moteur traite les acteurs comme des obstacles.
    leader.dir = 0; // regarde au nord
    expect(place(leader, 0)).toEqual({ tx: 10, ty: 11 });
    leader.dir = 2; // au sud
    expect(place(leader, 0)).toEqual({ tx: 10, ty: 9 });
    leader.dir = 1; // a l'est
    expect(place(leader, 0)).toEqual({ tx: 9, ty: 10 });
    leader.dir = 3; // a l'ouest
    expect(place(leader, 0)).toEqual({ tx: 11, ty: 10 });
  });

  it('donne a chaque compagnon une place distincte', () => {
    const leader = acteur('avatar', 10, 10);
    for (const dir of [0, 1, 2, 3]) {
      leader.dir = dir as Actor['dir'];
      const places = [0, 1, 2].map((i) => place(leader, i));
      const uniques = new Set(places.map((p) => `${p.tx},${p.ty}`));
      expect(uniques.size, `places confondues au cap ${dir}`).toBe(places.length);
      // Et aucune ne tombe sur le meneur lui-meme.
      for (const p of places) expect(`${p.tx},${p.ty}`).not.toBe('10,10');
    }
  });
});

describe('composition du groupe', () => {
  it('refuse au-dela de la limite', () => {
    const leader = acteur('avatar');
    const candidats = [acteur('townsman'), acteur('guard'), acteur('smith')];
    const acteurs = [leader, ...candidats];

    for (let i = 0; i < MAX_COMPAGNONS; i++) {
      expect(peutRejoindre(candidats[i]!, acteurs)).toBe(true);
      recruter(candidats[i]!, leader);
    }
    expect(groupePlein(acteurs)).toBe(true);
    expect(peutRejoindre(candidats[MAX_COMPAGNONS]!, acteurs)).toBe(false);
  });

  it('ne compte pas un mort, et libere sa place', () => {
    const leader = acteur('avatar');
    const tombe = acteur('guard');
    const acteurs = [leader, tombe, acteur('smith')];
    recruter(tombe, leader);
    expect(compagnons(acteurs)).toHaveLength(1);

    tombe.hp = 0;
    expect(compagnons(acteurs)).toHaveLength(0);
    expect(peutRejoindre(acteurs[2]!, acteurs)).toBe(true);
  });

  it('rend au conge son emploi du temps et oublie la cible', () => {
    const leader = acteur('avatar');
    const compagnon = acteur('guard');
    recruter(compagnon, leader);
    compagnon.inCombat = true;
    compagnon.target = acteur('brigand');

    congedier(compagnon);
    expect(compagnon.inParty).toBe(false);
    expect(compagnon.inCombat).toBe(false);
    expect(compagnon.target).toBeNull();
  });

  it('fait degainer et rengainer le groupe avec le meneur', () => {
    const leader = acteur('avatar');
    const garde = acteur('guard');
    const barde = acteur('townsman'); // non combattant
    const acteurs = [leader, garde, barde];
    recruter(garde, leader);
    recruter(barde, leader);

    leader.inCombat = true;
    accorderCombat(leader, acteurs);
    expect(garde.inCombat).toBe(true);
    // Un barde ne se bat pas, meme en bonne compagnie.
    expect(barde.inCombat).toBe(false);

    leader.inCombat = false;
    accorderCombat(leader, acteurs);
    expect(garde.inCombat).toBe(false);
    expect(garde.target).toBeNull();
  });
});

describe('recrutement par le dialogue', () => {
  function monde() {
    const world = buildTown();
    const { avatar, npcs } = populate(world);
    const par = (nom: string) => npcs.find((n) => n.displayName === nom)!;
    return { world, avatar, jehan: par('Jehan'), basile: par('Basile') };
  }

  function sujets(npc: Actor, flags: Set<string>, avatar: Actor): string[] {
    const def = getConversation(npc.conversationId!)!;
    return new ConversationState(def, flags, (shape) =>
      avatar.findDeep((o) => o.shapeId === shape) !== null,
    )
      .visibleTopics()
      .map((t) => t.id);
  }

  it('n\'offre de suivre qu\'une fois la raison acquise', () => {
    const { avatar, jehan, basile } = monde();
    expect(sujets(jehan, new Set(), avatar)).not.toContain('suivre');
    expect(sujets(jehan, new Set(['sait_brigands']), avatar)).toContain('suivre');

    // Basile ne suit qu'une fois son luth rendu : c'est sa dette, pas un service.
    expect(sujets(basile, new Set(), avatar)).not.toContain('suivre');
    expect(sujets(basile, new Set(['luth_rendu']), avatar)).toContain('suivre');
  });

  it('fait rejoindre, puis n\'offre plus que de partir', () => {
    const { world, avatar, jehan } = monde();
    const flags = new Set(['sait_brigands']);
    const logs: string[] = [];
    const ctx = { avatar, npc: jehan, flags, log: (t: string) => logs.push(t), acteurs: world.actors };

    expect(applyEffect('recruter', ctx)).toBe(true);
    expect(jehan.inParty).toBe(true);
    expect(flags.has('compagnon_jehan')).toBe(true);
    expect(sujets(jehan, flags, avatar)).toContain('rester');

    expect(applyEffect('congedier', ctx)).toBe(true);
    expect(jehan.inParty).toBe(false);
    expect(flags.has('compagnon_jehan')).toBe(false);
    expect(sujets(jehan, flags, avatar)).not.toContain('rester');
  });

  it('suit la quete des brigands du recit au journal', () => {
    const { world, avatar, jehan } = monde();
    const flags = new Set<string>();
    const logs: string[] = [];
    const ctx = { avatar, npc: jehan, flags, log: (t: string) => logs.push(t), acteurs: world.actors };

    // Rien tant que Jehan n'en a pas parle : le journal raconte les drapeaux.
    expect(journal(flags)).toHaveLength(0);

    // 1. Jehan raconte. La quete entre au journal.
    const chezJehan = sujets(jehan, flags, avatar);
    expect(chezJehan).toContain('brigands');
    flags.add('sait_brigands');
    const debut = journal(flags).find((q) => q.def.id === 'brigands');
    expect(debut, 'la quete des brigands n\'apparait pas').toBeDefined();
    expect(debut!.done).toBe(false);

    // 2. Il accepte de suivre.
    expect(applyEffect('recruter', ctx)).toBe(true);
    expect(journal(flags).find((q) => q.def.id === 'brigands')!.steps).toHaveLength(2);

    // 3. Arriver en vue du feu pose le drapeau, sans une parole.
    refreshWorldFlags(avatar, world.actors, LANDMARKS.camp, flags);
    expect(flags.has('camp_trouve'), 'trouve le camp depuis le bourg').toBe(false);
    avatar.tx = LANDMARKS.camp.tx + VUE_DU_CAMP;
    avatar.ty = LANDMARKS.camp.ty;
    refreshWorldFlags(avatar, world.actors, LANDMARKS.camp, flags);
    expect(flags.has('camp_trouve')).toBe(true);

    // 4. Tant qu'un brigand vit, la quete n'est pas achevee.
    refreshWorldFlags(avatar, world.actors, LANDMARKS.camp, flags);
    expect(flags.has('camp_nettoye')).toBe(false);
    for (const b of world.actors.filter((a) => a.shapeId === 'brigand')) b.hp = 0;
    refreshWorldFlags(avatar, world.actors, LANDMARKS.camp, flags);
    expect(flags.has('camp_nettoye')).toBe(true);

    const fin = journal(flags).find((q) => q.def.id === 'brigands')!;
    expect(fin.done).toBe(true);
    expect(fin.next, 'une quete achevee n\'a plus d\'etape suivante').toBeNull();

    // 5. Et Jehan a de quoi remercier — une seule fois.
    expect(sujets(jehan, flags, avatar)).toContain('prime');
    expect(applyEffect('prime_brigands', ctx)).toBe(true);
    expect(applyEffect('prime_brigands', ctx)).toBe(false);
  });

  it('n\'annonce pas le camp nettoye avant de l\'avoir trouve', () => {
    // Sans cette garde, le drapeau tomberait des le premier tour d'une partie
    // ou les brigands n'existeraient pas.
    const { world, avatar } = monde();
    const flags = new Set<string>();
    for (const b of world.actors.filter((a) => a.shapeId === 'brigand')) b.hp = 0;
    refreshWorldFlags(avatar, world.actors, LANDMARKS.camp, flags);
    expect(flags.has('camp_nettoye')).toBe(false);
  });

  it('refuse en le disant quand le groupe est complet', () => {
    const { world, avatar, jehan, basile } = monde();
    const autres = world.actors.filter((a) => a !== avatar && a.shapeId !== 'brigand');
    for (let i = 0; i < MAX_COMPAGNONS; i++) recruter(autres[i]!, avatar);

    const logs: string[] = [];
    const libre = [jehan, basile].find((a) => !a.inParty)!;
    const done = applyEffect('recruter', {
      avatar,
      npc: libre,
      flags: new Set(),
      log: (t) => logs.push(t),
      acteurs: world.actors,
    });
    expect(done).toBe(false);
    expect(logs.join(' ')).toContain('complet');
  });
});

describe('un compagnon en foret', () => {
  /** Fait tourner l'IA comme la boucle de jeu, et rend l'ecart au meneur. */
  function simuler(secondes: number, monde: ReturnType<typeof preparer>): number {
    const { world, avatar, jehan, ai } = monde;
    const dt = 1 / 30;
    let pire = 0;
    for (let n = 0; n < secondes * 30; n++) {
      for (const actor of world.actors) {
        if (actor !== avatar) ai.update(actor, dt);
      }
      pire = Math.max(pire, Math.max(Math.abs(jehan.tx - avatar.tx), Math.abs(jehan.ty - avatar.ty)));
    }
    return Math.max(Math.abs(jehan.tx - avatar.tx), Math.abs(jehan.ty - avatar.ty));
  }

  function preparer() {
    const world = buildTown();
    const { avatar, npcs } = populate(world);
    const jehan = npcs.find((n) => n.displayName === 'Jehan')!;
    recruter(jehan, avatar);
    const ai = new ScheduleAI(world, new GameClock(10, 0), new Rng(4242));
    ai.leader = avatar;
    return { world, avatar, jehan, ai };
  }

  function poser(actor: { tx: number; ty: number; px: number; py: number; path: unknown[] }, tx: number, ty: number): void {
    actor.tx = tx;
    actor.ty = ty;
    actor.px = tx;
    actor.py = ty;
    actor.path.length = 0;
  }

  it('rejoint son meneur au milieu des arbres', () => {
    // Le bois du sud-ouest, sur le chemin du campement. La place en formation y
    // tombe reguliercement sur un arbre : demandee sans tolerance, elle rendait
    // un chemin vide, redemande a l'identique a chaque pensee, et le compagnon
    // restait plante.
    const monde = preparer();
    poser(monde.avatar, 30, 72);
    poser(monde.jehan, 38, 66);

    const ecart = simuler(20, monde);
    expect(ecart, 'le compagnon n\'a pas rejoint le meneur').toBeLessThanOrEqual(3);
  });

  it('revient meme de l\'autre bout de la carte', () => {
    // Mesure : la traversee complete demande une trentaine de secondes de jeu,
    // ce qui est le temps de marche et non un blocage. Ce qui compte est qu'il
    // reprenne la route a chaque pensee au lieu de s'arreter en chemin.
    const monde = preparer();
    poser(monde.avatar, 30, 72);
    poser(monde.jehan, 90, 6);

    const ecart = simuler(45, monde);
    expect(ecart, 'le compagnon est reste perdu').toBeLessThanOrEqual(3);
  });

  it('reste a portee sans coller au meneur', () => {
    const monde = preparer();
    poser(monde.avatar, 44, 44);
    poser(monde.jehan, 44, 46);
    const ecart = simuler(5, monde);
    expect(ecart).toBeGreaterThanOrEqual(1);
    expect(ecart).toBeLessThanOrEqual(3);
  });
});

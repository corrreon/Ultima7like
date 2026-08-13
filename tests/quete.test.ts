import { describe, expect, it } from 'vitest';
import { LANDMARKS, PORTES, buildTown } from '../src/data/town';
import { populate } from '../src/data/npcs';
import { ConversationState, allConversations, getConversation } from '../src/script/conversation';
import { QUESTS, applyEffect, journal, refreshWorldFlags } from '../src/script/quests';
import type { Actor } from '../src/objects/actor';
import { GameObject } from '../src/objects/gameobject';

/**
 * Traversee complete de la quete du luth.
 *
 * C'est le seul test qui parle au jeu comme un joueur : il ouvre des
 * conversations, choisit des sujets, deplace un objet d'un coffre a un sac.
 * Une quete peut se briser sans qu'aucune unite ne bronche — un sujet dont le
 * drapeau n'est jamais pose, un objet range dans un contenant que la condition
 * ne sait pas fouiller — et seul un parcours de bout en bout le montre.
 */

/** Ouvre une conversation avec les memes regles que le jeu. */
function parler(npc: Actor, flags: Set<string>, avatar: Actor): ConversationState {
  const def = getConversation(npc.conversationId!)!;
  return new ConversationState(def, flags, (shape) =>
    avatar.findDeep((o) => o.shapeId === shape) !== null,
  );
}

/** Choisit un sujet, en verifiant qu'il etait bien propose. */
function aborder(state: ConversationState, topicId: string): void {
  const visible = state.visibleTopics().map((t) => t.id);
  expect(visible, `sujet « ${topicId} » absent, propose : ${visible.join(', ')}`).toContain(topicId);
  state.select(topicId);
}

function monde() {
  const world = buildTown();
  const { avatar, npcs } = populate(world);
  const par = (nom: string) => npcs.find((n) => n.displayName === nom)!;
  return { world, avatar, mireille: par('Mireille'), aldric: par('Aldric'), basile: par('Basile') };
}

describe('la quete du luth', () => {
  it('se traverse de bout en bout', () => {
    const { world, avatar, mireille, aldric, basile } = monde();
    const flags = new Set<string>();
    const logs: string[] = [];
    const effet = (nom: string, npc: Actor) =>
      applyEffect(nom, { avatar, npc, flags, log: (t) => logs.push(t), acteurs: world.actors });

    // 1. Mireille parle du bourg, puis de Basile : on apprend le luth perdu.
    const chezMireille = parler(mireille, flags, avatar);
    aborder(chezMireille, 'bourg');
    aborder(chezMireille, 'basile');
    expect(flags.has('connait_luth')).toBe(true);

    // 2. Aldric sait ou il est — mais seulement si on lui en parle, et le
    //    sujet n'existe pour lui qu'une fois qu'on connait l'affaire.
    expect(parler(aldric, new Set(), avatar).visibleTopics().map((t) => t.id)).not.toContain('luth');
    const chezAldric = parler(aldric, flags, avatar);
    aborder(chezAldric, 'luth');
    expect(flags.has('sait_ou_est_luth')).toBe(true);

    // 3. Basile accepte enfin d'y croire : la quete demarre.
    const chezBasile = parler(basile, flags, avatar);
    aborder(chezBasile, 'luth');
    effet('quete_luth', basile);
    expect(flags.has('quete_luth_active')).toBe(true);

    // 4. Le luth est dans le coffre de Basile. On le prend.
    const coffre = [...world.allObjects()].find(
      (o) => o.shapeId === 'chest' && o.findDeep((c) => c.shapeId === 'lute'),
    );
    expect(coffre, 'aucun coffre ne contient le luth').toBeDefined();
    const luth = coffre!.findDeep((o) => o.shapeId === 'lute')!;
    // Range dans le sac, et non tenu en main : la condition doit savoir
    // descendre dans les contenants imbriques.
    const sac = avatar.contents.find((o) => o.isContainer)!;
    expect(sac.add(luth)).toBe(true);
    expect(avatar.findDeep((o) => o.shapeId === 'lute')).toBe(luth);

    // 5. Le sujet du retour n'apparait qu'a partir de maintenant.
    const retour = parler(basile, flags, avatar);
    aborder(retour, 'rendre');
    const orAvant = compterOr(avatar);
    expect(effet('rendre_luth', basile)).toBe(true);

    // 6. Le luth a change de mains, la recompense est versee.
    expect(avatar.findDeep((o) => o.shapeId === 'lute')).toBeNull();
    expect(basile.findDeep((o) => o.shapeId === 'lute')).toBe(luth);
    expect(compterOr(avatar) - orAvant).toBe(30);
    expect(flags.has('luth_rendu')).toBe(true);

    // 7. Et le sujet disparait : on ne rend pas deux fois le meme luth.
    expect(parler(basile, flags, avatar).visibleTopics().map((t) => t.id)).not.toContain('rendre');
  });

  it('ne propose pas de rendre un luth qu\'on n\'a pas', () => {
    const { avatar, basile } = monde();
    const flags = new Set(['connait_luth', 'sait_ou_est_luth', 'quete_luth_active']);
    expect(parler(basile, flags, avatar).visibleTopics().map((t) => t.id)).not.toContain('rendre');
  });

  it('refuse l\'effet plutot que d\'achever la quete dans le vide', () => {
    const { avatar, basile } = monde();
    const flags = new Set<string>();
    const done = applyEffect('rendre_luth', {
      avatar,
      npc: basile,
      flags,
      log: () => {},
      acteurs: [],
    });
    expect(done).toBe(false);
    expect(flags.has('luth_rendu')).toBe(false);
  });

  it('ouvre a Mireille un sujet que seul le retour du luth debloque', () => {
    const { avatar, mireille } = monde();
    expect(parler(mireille, new Set(), avatar).visibleTopics().map((t) => t.id)).not.toContain('musique');
    expect(
      parler(mireille, new Set(['luth_rendu']), avatar).visibleTopics().map((t) => t.id),
    ).toContain('musique');
  });

  it('raconte l\'avancement dans le journal', () => {
    expect(journal(new Set())).toHaveLength(0);

    const debut = journal(new Set(['connait_luth']));
    expect(debut).toHaveLength(1);
    expect(debut[0]!.done).toBe(false);
    expect(debut[0]!.steps).toHaveLength(1);
    expect(debut[0]!.next?.flag).toBe('sait_ou_est_luth');

    const fin = journal(
      new Set(['connait_luth', 'sait_ou_est_luth', 'quete_luth_active', 'luth_en_main', 'luth_rendu']),
    );
    expect(fin[0]!.done).toBe(true);
    expect(fin[0]!.next).toBeNull();
    expect(fin[0]!.steps).toHaveLength(5);
  });
});

function compterOr(actor: Actor): number {
  let total = 0;
  const parcourir = (obj: GameObject): void => {
    for (const child of obj.contents) {
      if (child.shapeId === 'gold') total += child.quantity;
      parcourir(child);
    }
  };
  parcourir(actor);
  return total;
}

describe('les dix quetes', () => {
  it('sont toutes atteignables par le dialogue', () => {
    // Le mode de panne le plus couteux du jeu : une quete entre au journal,
    // et rien nulle part ne peut poser le drapeau qui la termine. Rien ne le
    // signale — le joueur cherche.
    const poses = new Set<string>();
    for (const conv of allConversations()) {
      for (const topic of conv.topics) {
        for (const flag of topic.sets ?? []) poses.add(flag);
        // Les effets parametres posent leur drapeau en dernier champ.
        const effet = topic.effect?.split(':');
        if (effet && (effet[0] === 'livrer' || effet[0] === 'payer')) {
          poses.add(effet[effet.length - 1]!);
        }
      }
    }
    // Les drapeaux poses par le monde et non par une replique.
    for (const flag of [
      'luth_en_main', 'camp_trouve', 'camp_nettoye', 'luth_rendu',
      'porte_sud_vue', 'porte_est_vue', 'reserve_ouverte', 'quete_luth_active',
      'compagnon_jehan',
    ]) poses.add(flag);

    expect(QUESTS).toHaveLength(10);
    for (const quete of QUESTS) {
      expect(poses.has(quete.startFlag), `${quete.id} : rien ne la commence`).toBe(true);
      expect(poses.has(quete.doneFlag), `${quete.id} : rien ne la termine`).toBe(true);
      for (const etape of quete.steps) {
        expect(poses.has(etape.flag), `${quete.id} : etape « ${etape.flag} » inatteignable`).toBe(true);
      }
    }
  });

  it('livre contre recompense, et ne prend rien si le compte n\'y est pas', () => {
    const world = buildTown();
    const { avatar, npcs } = populate(world);
    const flags = new Set<string>();
    const ysoire = npcs.find((n) => n.conversationId === 'ysoire')!;
    const ctx = { avatar, npc: ysoire, flags, acteurs: world.actors, log: () => {} };

    // L'Avatar part avec un sachet de reactifs : on le vide d'abord, sinon le
    // compte est deja fait et le test ne verifie rien.
    for (;;) {
      const deja = avatar.findDeep((o) => o.shapeId === 'ginseng');
      if (!deja) break;
      deja.detach();
    }

    // Deux racines sur trois : rien ne doit bouger.
    avatar.add(new GameObject({ shape: 'ginseng', quantity: 2 }));
    expect(applyEffect('livrer:ginseng:3:40:herbes_livrees', ctx)).toBe(false);
    expect(flags.has('herbes_livrees')).toBe(false);
    expect(avatar.findDeep((o) => o.shapeId === 'ginseng')).not.toBeNull();

    // La troisieme, et la livraison passe.
    avatar.add(new GameObject({ shape: 'ginseng', quantity: 1 }));
    const totalOr = (): number => {
      let t = 0;
      const parcours = (o: GameObject): void => {
        for (const c of o.contents) {
          if (c.shapeId === 'gold') t += c.quantity;
          parcours(c);
        }
      };
      parcours(avatar);
      return t;
    };
    const orAvant = totalOr();
    expect(applyEffect('livrer:ginseng:3:40:herbes_livrees', ctx)).toBe(true);
    expect(flags.has('herbes_livrees')).toBe(true);
    expect(ysoire.findDeep((o) => o.shapeId === 'ginseng')).not.toBeNull();
    expect(totalOr()).toBe(orAvant + 40);
    // Un seul tas : la recompense rejoint la bourse au lieu d'en ouvrir une
    // deuxieme.
    let tas = 0;
    const compter = (o: GameObject): void => {
      for (const c of o.contents) {
        if (c.shapeId === 'gold') tas++;
        compter(c);
      }
    };
    compter(avatar);
    expect(tas).toBe(1);

    // Et jamais deux fois.
    expect(applyEffect('livrer:ginseng:3:40:herbes_livrees', ctx)).toBe(false);
  });

  it('ne valide la ronde qu\'en marchant jusqu\'aux portes', () => {
    const world = buildTown();
    const { avatar } = populate(world);
    const flags = new Set<string>(['sait_rondes']);
    const repere = { portes: PORTES, reserveOuverte: false };

    refreshWorldFlags(avatar, world.actors, LANDMARKS.camp, flags, repere);
    expect(flags.has('porte_sud_vue')).toBe(false);

    avatar.tx = PORTES[0].tx;
    avatar.ty = PORTES[0].ty - 2;
    refreshWorldFlags(avatar, world.actors, LANDMARKS.camp, flags, repere);
    expect(flags.has('porte_sud_vue')).toBe(true);
    expect(flags.has('porte_est_vue')).toBe(false);
  });

  it('ouvre la reserve par la clef du chef de bande', () => {
    // Qualite 5 : aucune clef du bourg ne convient, celle du chef si. C'est ce
    // qui relie le campement a la taverne.
    const world = buildTown();
    const { npcs } = populate(world);
    const porte = world.objectsAt(21, 29).find((o) => o.shape.door)!;
    expect(porte.quality).toBe(5);

    const chef = npcs.find((n) => n.displayName === 'Chef de bande')!;
    const clef = chef.findItem('key');
    expect(clef?.quality).toBe(5);
  });
});

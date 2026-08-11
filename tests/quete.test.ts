import { describe, expect, it } from 'vitest';
import { buildTown } from '../src/data/town';
import { populate } from '../src/data/npcs';
import { ConversationState, getConversation } from '../src/script/conversation';
import { applyEffect, journal } from '../src/script/quests';
import type { Actor } from '../src/objects/actor';
import type { GameObject } from '../src/objects/gameobject';

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

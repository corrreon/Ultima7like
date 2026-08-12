import type { Actor } from '../objects/actor';
import { GameObject } from '../objects/gameobject';
import { congedier, groupePlein, peutRejoindre, recruter } from '../sim/party';
import { estMarchand } from './commerce';

/**
 * Quetes et effets de dialogue.
 *
 * Une quete n'est pas une machine a etats separee : c'est une lecture des
 * drapeaux de conversation, les memes que ceux qui ouvrent et ferment les
 * sujets. Rien ne peut donc desynchroniser le journal de ce que les PNJ
 * savent — le journal ne fait que raconter les drapeaux.
 *
 * Ce module est volontairement pur : aucune dependance au DOM ni au rendu,
 * pour qu'une quete se traverse de bout en bout dans un test.
 */

export interface QuestStep {
  /** Drapeau qui marque cette etape comme franchie. */
  flag: string;
  /** Ligne affichee dans le journal. */
  text: string;
}

export interface QuestDef {
  id: string;
  title: string;
  /** Drapeau qui fait entrer la quete au journal. */
  startFlag: string;
  /** Drapeau qui la marque achevee. */
  doneFlag: string;
  steps: QuestStep[];
}

export const QUESTS: QuestDef[] = [
  {
    id: 'luth',
    title: 'Le luth de Basile',
    startFlag: 'connait_luth',
    doneFlag: 'luth_rendu',
    steps: [
      { flag: 'connait_luth', text: 'Basile a encore egare son luth.' },
      { flag: 'sait_ou_est_luth', text: 'Aldric dit qu\'il l\'a laisse dans son coffre, chez lui.' },
      { flag: 'quete_luth_active', text: 'Basile promet une chanson a qui le lui rapportera.' },
      { flag: 'luth_en_main', text: 'Le luth est dans mon sac.' },
      { flag: 'luth_rendu', text: 'Rendu a son proprietaire. Il joue ce soir a la taverne.' },
    ],
  },
];

export interface QuestEntry {
  def: QuestDef;
  done: boolean;
  /** Etapes deja franchies, dans l'ordre. */
  steps: QuestStep[];
  /** Prochaine etape a franchir, ou null si la quete est achevee. */
  next: QuestStep | null;
}

/**
 * Etat du journal, deduit des drapeaux.
 *
 * Une quete n'apparait qu'une fois commencee : un journal qui listerait tout
 * ce qu'on pourrait faire serait une table des matieres, pas un journal.
 */
export function journal(flags: ReadonlySet<string>): QuestEntry[] {
  const entries: QuestEntry[] = [];
  for (const def of QUESTS) {
    if (!flags.has(def.startFlag)) continue;
    const steps = def.steps.filter((step) => flags.has(step.flag));
    const next = def.steps.find((step) => !flags.has(step.flag)) ?? null;
    entries.push({ def, done: flags.has(def.doneFlag), steps, next });
  }
  return entries;
}

/** Ce dont un effet a besoin pour agir sur le monde. */
export interface EffectContext {
  avatar: Actor;
  npc: Actor;
  flags: Set<string>;
  /** Ligne a afficher dans le journal de bord. */
  log: (text: string) => void;
  /** Tous les acteurs du monde, pour ce qui touche au groupe. */
  acteurs: readonly Actor[];
  /** Ouvre le panneau de commerce avec ce PNJ. */
  commercer?: (marchand: Actor) => void;
}

/**
 * Applique l'effet attache a un sujet de conversation.
 *
 * Retourne false si l'effet n'a pas pu aboutir — le luth introuvable, par
 * exemple. L'appelant peut alors laisser la conversation se poursuivre sans
 * poser le drapeau, plutot que de declarer une quete achevee dans le vide.
 */
export function applyEffect(effect: string, ctx: EffectContext): boolean {
  switch (effect) {
    case 'quete_luth':
      ctx.flags.add('quete_luth_active');
      ctx.log(`${ctx.npc.displayName} vous promet une chanson si vous lui rapportez son luth.`);
      return true;

    case 'rendre_luth': {
      const lute = ctx.avatar.findDeep((o) => o.shapeId === 'lute');
      if (!lute) return false;

      lute.detach();
      // Un PNJ est un conteneur comme un autre : le luth passe simplement dans
      // son inventaire, et c'est cela qui le fera jouer le soir venu.
      ctx.npc.add(lute);
      ctx.flags.add('luth_rendu');

      const reward = new GameObject({ shape: 'gold', quantity: 30 });
      if (!ctx.avatar.add(reward)) {
        // Trop charge : la recompense tombe aux pieds du joueur plutot que de
        // disparaitre sans un mot.
        reward.tx = ctx.avatar.tx;
        reward.ty = ctx.avatar.ty;
        ctx.log('Vous etes trop charge : les pieces tombent a vos pieds.');
      }
      ctx.log(`${ctx.npc.displayName} retrouve son luth et vous glisse 30 pieces.`);
      return true;
    }

    case 'commercer': {
      if (!estMarchand(ctx.npc) || !ctx.commercer) return false;
      ctx.commercer(ctx.npc);
      return true;
    }

    case 'recruter': {
      if (!peutRejoindre(ctx.npc, ctx.acteurs)) {
        // On le dit, au lieu de laisser la conversation faire comme si.
        ctx.log(
          groupePlein(ctx.acteurs)
            ? 'Votre groupe est au complet.'
            : `${ctx.npc.displayName} ne peut pas vous suivre.`,
        );
        return false;
      }
      recruter(ctx.npc, ctx.avatar);
      ctx.flags.add(`compagnon_${ctx.npc.conversationId ?? ctx.npc.shapeId}`);
      ctx.log(`${ctx.npc.displayName} se joint a vous.`);
      return true;
    }

    case 'congedier': {
      if (!ctx.npc.inParty) return false;
      congedier(ctx.npc);
      ctx.flags.delete(`compagnon_${ctx.npc.conversationId ?? ctx.npc.shapeId}`);
      ctx.log(`${ctx.npc.displayName} vous quitte.`);
      return true;
    }

    default:
      return false;
  }
}

/**
 * Met a jour les drapeaux qui decrivent l'inventaire plutot qu'une parole.
 *
 * `luth_en_main` n'est pose par aucun dialogue : ramasser le luth est un geste,
 * pas une conversation. On le deduit donc de l'etat du monde, a chaque tour.
 */
export function refreshInventoryFlags(avatar: Actor, flags: Set<string>): void {
  // Appelee a chaque tour de boucle : un drapeau deja pose coupe court avant
  // de parcourir l'arborescence de l'inventaire.
  if (flags.has('luth_en_main') || flags.has('luth_rendu')) return;
  if (avatar.findDeep((o) => o.shapeId === 'lute')) flags.add('luth_en_main');
}

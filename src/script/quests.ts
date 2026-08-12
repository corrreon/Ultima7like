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
  {
    id: 'brigands',
    title: 'Les brigands du sud-ouest',
    startFlag: 'sait_brigands',
    doneFlag: 'camp_nettoye',
    steps: [
      { flag: 'sait_brigands', text: 'Trois brigands campent au sud-ouest, sous les arbres.' },
      { flag: 'compagnon_jehan', text: 'Jehan accepte de m\'accompagner.' },
      { flag: 'camp_trouve', text: 'J\'ai trouve leur feu, au bout du sentier.' },
      { flag: 'camp_nettoye', text: 'La route est libre. Jehan a de quoi me remercier.' },
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
    const done = flags.has(def.doneFlag);
    const steps = def.steps.filter((step) => flags.has(step.flag));
    // Une quete achevee n'a plus d'etape suivante, meme si le joueur a saute
    // une etape facultative en chemin — recruter quelqu'un, par exemple.
    const next = done ? null : (def.steps.find((step) => !flags.has(step.flag)) ?? null);
    entries.push({ def, done, steps, next });
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

    case 'prime_brigands': {
      if (!ctx.flags.has('camp_nettoye') || ctx.flags.has('prime_versee')) return false;
      ctx.flags.add('prime_versee');
      const prime = new GameObject({ shape: 'gold', quantity: 60 });
      if (!ctx.avatar.add(prime)) {
        prime.tx = ctx.avatar.tx;
        prime.ty = ctx.avatar.ty;
        ctx.log('Vous etes trop charge : les pieces tombent a vos pieds.');
      }
      ctx.log(`${ctx.npc.displayName} vous verse 60 pieces sur la caisse du poste.`);
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

/** Distance a laquelle on considere avoir trouve le campement. */
export const VUE_DU_CAMP = 8;

/**
 * Met a jour les drapeaux que pose le monde, et non une parole.
 *
 * Ramasser un luth, arriver en vue d'un feu, abattre le dernier brigand : rien
 * de tout cela ne passe par une conversation, et pourtant une quete doit
 * l'enregistrer. On les deduit donc de l'etat du monde a chaque tour, ce qui a
 * l'avantage de rester juste meme si le joueur s'y prend autrement que prevu —
 * en trouvant le camp avant d'en avoir entendu parler, par exemple.
 */
export function refreshWorldFlags(
  avatar: Actor,
  acteurs: readonly Actor[],
  camp: { tx: number; ty: number },
  flags: Set<string>,
): void {
  if (!flags.has('luth_en_main') && !flags.has('luth_rendu')) {
    if (avatar.findDeep((o) => o.shapeId === 'lute')) flags.add('luth_en_main');
  }

  if (!flags.has('camp_trouve')) {
    const d = Math.max(Math.abs(avatar.tx - camp.tx), Math.abs(avatar.ty - camp.ty));
    if (d <= VUE_DU_CAMP) flags.add('camp_trouve');
  }

  // Le camp n'est « nettoye » que si on l'a d'abord trouve : sans cette
  // condition, le drapeau serait pose des le premier tour d'une partie ou les
  // brigands n'existeraient pas encore.
  if (flags.has('camp_trouve') && !flags.has('camp_nettoye')) {
    const reste = acteurs.some((a) => a.shapeId === 'brigand' && a.isAlive);
    if (!reste) flags.add('camp_nettoye');
  }
}

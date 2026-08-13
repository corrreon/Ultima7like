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
  {
    id: 'marteau',
    title: 'Le marteau d\'Aldric',
    startFlag: 'sait_marteau',
    doneFlag: 'marteau_rendu',
    steps: [
      { flag: 'sait_marteau', text: 'Aldric s\'est fait prendre son marteau de forge sur la route.' },
      { flag: 'marteau_rendu', text: 'Rendu. Il pretend qu\'il ne l\'avait pas perdu.' },
    ],
  },
  {
    id: 'reserve',
    title: 'La reserve de Mireille',
    startFlag: 'sait_reserve',
    doneFlag: 'reserve_ouverte',
    steps: [
      { flag: 'sait_reserve', text: 'La reserve de la taverne est fermee et la clef a disparu.' },
      { flag: 'reserve_ouverte', text: 'La porte est ouverte. Clef, crochet ou sortilege : elle n\'a rien demande.' },
    ],
  },
  {
    id: 'herbes',
    title: 'Les herbes d\'Ysoire',
    startFlag: 'sait_herbes',
    doneFlag: 'herbes_livrees',
    steps: [
      { flag: 'sait_herbes', text: 'Ysoire manque de ginseng et en achete trois racines.' },
      { flag: 'herbes_livrees', text: 'Livrees. Elle dit que je saurai ou la trouver.' },
    ],
  },
  {
    id: 'vivres',
    title: 'Les vivres de la halle',
    startFlag: 'sait_vivres',
    doneFlag: 'vivres_livres',
    steps: [
      { flag: 'sait_vivres', text: 'La halle au grain manque de pain pour la semaine.' },
      { flag: 'vivres_livres', text: 'Trois miches portees a la halle.' },
    ],
  },
  {
    id: 'rondes',
    title: 'La ronde des portes',
    startFlag: 'sait_rondes',
    doneFlag: 'rondes_faites',
    steps: [
      { flag: 'sait_rondes', text: 'Garin veut savoir si les deux portes tiennent encore.' },
      { flag: 'porte_sud_vue', text: 'Porte sud : debout.' },
      { flag: 'porte_est_vue', text: 'Porte est : debout aussi.' },
      { flag: 'rondes_faites', text: 'Rapporte a Garin. Il paie sans discuter.' },
    ],
  },
  {
    id: 'biere',
    title: 'La chanson du soir',
    startFlag: 'luth_rendu',
    doneFlag: 'chanson_payee',
    steps: [
      { flag: 'luth_rendu', text: 'Basile joue ce soir, mais il a la gorge seche.' },
      { flag: 'chanson_payee', text: 'Une chope portee au barde. La salle etait pleine.' },
    ],
  },
  {
    id: 'perle',
    title: 'La perle du chef',
    startFlag: 'sait_perle',
    doneFlag: 'perle_rendue',
    steps: [
      { flag: 'sait_perle', text: 'Ysoire dit que le chef de bande portait une perle noire volee.' },
      { flag: 'perle_rendue', text: 'Reprise sur son corps et rendue.' },
    ],
  },
  {
    id: 'lanterne',
    title: 'Les lanternes de la place',
    startFlag: 'sait_lanternes',
    doneFlag: 'lanternes_faites',
    steps: [
      { flag: 'sait_lanternes', text: 'Garin voudrait deux torches pour les guetteurs.' },
      { flag: 'lanternes_faites', text: 'Deux torches livrees au corps de garde.' },
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
 * Remet des objets a un PNJ contre de l'or, et pose un drapeau.
 *
 * Rien n'est preleve si le compte n'y est pas : une livraison a moitie faite
 * laisserait le joueur sans ses objets et sans sa quete.
 */
function livrer(effect: string, ctx: EffectContext): boolean {
  const [, shape, nombreTexte, orTexte, drapeau] = effect.split(':');
  const nombre = Number(nombreTexte);
  const or = Number(orTexte);
  if (!shape || !drapeau || !Number.isFinite(nombre)) return false;
  if (ctx.flags.has(drapeau)) return false;

  // On collecte d'abord, on detache ensuite : compter puis prelever en deux
  // temps evite de vider a moitie un inventaire qui n'avait pas le compte.
  const pris: GameObject[] = [];
  let reste = nombre;
  while (reste > 0) {
    const trouve = ctx.avatar.findDeep((o) => o.shapeId === shape && !pris.includes(o));
    if (!trouve) return false;
    pris.push(trouve);
    reste -= Math.max(1, trouve.quantity);
  }

  for (const objet of pris) {
    objet.detach();
    ctx.npc.add(objet);
  }
  ctx.flags.add(drapeau);

  if (or > 0) {
    payerOr(or, ctx);
    ctx.log(`${ctx.npc.displayName} vous remet ${or} pieces.`);
  }
  return true;
}

/**
 * Verse une somme dans la bourse du joueur.
 *
 * `stow` et non `add` : l'or verse doit **rejoindre le tas deja porte**, comme
 * celui qu'on ramasse au sol. Un `add` nu creait une seconde pile a chaque
 * recompense, et la bourse finissait en une dizaine de tas dont le total ne se
 * lisait plus nulle part.
 */
function payerOr(or: number, ctx: EffectContext): void {
  const paie = new GameObject({ shape: 'gold', quantity: or });
  if (!ctx.avatar.stow(paie)) {
    paie.tx = ctx.avatar.tx;
    paie.ty = ctx.avatar.ty;
    ctx.log('Vous etes trop charge : les pieces tombent a vos pieds.');
  }
}

/**
 * Applique l'effet attache a un sujet de conversation.
 *
 * Retourne false si l'effet n'a pas pu aboutir — le luth introuvable, par
 * exemple. L'appelant peut alors laisser la conversation se poursuivre sans
 * poser le drapeau, plutot que de declarer une quete achevee dans le vide.
 */
export function applyEffect(effect: string, ctx: EffectContext): boolean {
  // Effet parametre : `livrer:shape:nombre:or:drapeau`.
  //
  // Huit des dix quetes se ramenent au meme geste — apporter quelque chose a
  // quelqu'un contre une recompense. Un `case` par quete aurait duplique huit
  // fois le meme code, et surtout aurait fait de chaque nouvelle quete une
  // modification du moteur plutot qu'une ligne de dialogue.
  if (effect.startsWith('livrer:')) return livrer(effect, ctx);
  // `payer:or:drapeau` — recompenser sans rien prendre, pour les quetes ou le
  // service rendu n'est pas un objet.
  if (effect.startsWith('payer:')) {
    const [, orTexte, drapeau] = effect.split(':');
    if (!drapeau || ctx.flags.has(drapeau)) return false;
    ctx.flags.add(drapeau);
    const or = Number(orTexte);
    if (or > 0) {
      payerOr(or, ctx);
      ctx.log(`${ctx.npc.displayName} vous remet ${or} pieces.`);
    }
    return true;
  }

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
  repere: {
    /** Les portes de la ville, dans l'ordre : sud, sud, est, est. */
    portes?: ReadonlyArray<{ tx: number; ty: number }>;
    /** La porte de la reserve est-elle ouverte ? */
    reserveOuverte?: boolean;
  } = {},
): void {
  const portes = repere.portes ?? [];
  // La ronde des portes : elle se valide en marchant, pas en parlant. Une
  // quete de patrouille qu'on pourrait boucler depuis la place ne ferait
  // longer le rempart a personne.
  const pres = (p: { tx: number; ty: number }): boolean =>
    Math.max(Math.abs(avatar.tx - p.tx), Math.abs(avatar.ty - p.ty)) <= 3;
  if (flags.has('sait_rondes')) {
    if (!flags.has('porte_sud_vue') && portes.slice(0, 2).some(pres)) {
      flags.add('porte_sud_vue');
    }
    if (!flags.has('porte_est_vue') && portes.slice(2).some(pres)) {
      flags.add('porte_est_vue');
    }
  }

  if (repere.reserveOuverte) flags.add('reserve_ouverte');
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

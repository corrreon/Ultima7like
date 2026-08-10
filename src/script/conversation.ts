/**
 * Dialogues a base de sujets.
 *
 * Ultima VII abandonne les mots-cles tapes au clavier d'Ultima VI au profit de
 * sujets cliquables, et surtout d'un etat conversationnel : un sujet peut en
 * reveler d'autres, disparaitre une fois epuise, ou donner un objet. On
 * reproduit ce fonctionnement : chaque sujet peut modifier la liste des sujets
 * disponibles via des drapeaux globaux.
 */

export interface Topic {
  id: string;
  /** Libelle affiche dans la liste. */
  label: string;
  /** Reponse du PNJ. */
  text: string;
  /** Sujets a rendre disponibles apres cette reponse. */
  reveals?: string[];
  /** Le sujet disparait apres avoir ete aborde une fois. */
  once?: boolean;
  /** Le sujet n'apparait que si tous ces drapeaux sont poses. */
  requires?: string[];
  /** Drapeaux poses par ce sujet. */
  sets?: string[];
  /** Termine la conversation. */
  ends?: boolean;
  /** Effet de jeu declenche (donner un objet, demarrer une quete...). */
  effect?: string;
}

export interface ConversationDef {
  id: string;
  /** Phrase d'accueil. */
  greeting: string;
  /** Phrase de conges. */
  farewell: string;
  topics: Topic[];
  /** Sujets visibles d'emblee. */
  initial: string[];
}

const conversations = new Map<string, ConversationDef>();

export function defineConversation(def: ConversationDef): void {
  conversations.set(def.id, def);
}

export function getConversation(id: string): ConversationDef | undefined {
  return conversations.get(id);
}

/**
 * Etat d'une conversation en cours.
 * Les drapeaux sont partages par tout le jeu : c'est ainsi qu'un PNJ peut
 * reagir a ce qu'un autre vous a dit.
 */
export class ConversationState {
  private readonly available = new Set<string>();
  private readonly used = new Set<string>();

  constructor(
    readonly def: ConversationDef,
    private readonly flags: Set<string>,
  ) {
    for (const id of def.initial) this.available.add(id);
  }

  /** Sujets actuellement proposables au joueur. */
  visibleTopics(): Topic[] {
    return this.def.topics.filter((topic) => {
      if (!this.available.has(topic.id)) return false;
      if (topic.once && this.used.has(topic.id)) return false;
      if (topic.requires && !topic.requires.every((flag) => this.flags.has(flag))) return false;
      return true;
    });
  }

  /** Selectionne un sujet et retourne la reponse du PNJ. */
  select(topicId: string): Topic | null {
    const topic = this.def.topics.find((t) => t.id === topicId);
    if (!topic) return null;

    this.used.add(topicId);
    for (const flag of topic.sets ?? []) this.flags.add(flag);
    for (const revealed of topic.reveals ?? []) this.available.add(revealed);
    return topic;
  }
}

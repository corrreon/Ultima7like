import { DEFAULT_MAX_WEIGHT, WALK_SPEED, type DirectionIndex } from '../core/constants';
import { GameObject, type ObjectInit } from './gameobject';
import type { ScheduleEntry } from '../sim/schedule';

export type Activity = 'stand' | 'wander' | 'sleep' | 'eat' | 'work' | 'patrol' | 'talk';

export interface ActorInit extends ObjectInit {
  displayName: string;
  maxHp?: number;
  maxMana?: number;
  speed?: number;
  schedule?: ScheduleEntry[];
  conversationId?: string;
  home?: { tx: number; ty: number };
}

/**
 * Acteur : Avatar, PNJ, monstre.
 *
 * Un acteur est un GameObject (donc il a un poids, il peut etre contenu dans
 * un autre objet — c'est ainsi que fonctionnent les cadavres et les creatures
 * en cage) auquel on ajoute une position sous-tuile, un inventaire et un
 * comportement.
 */
export class Actor extends GameObject {
  displayName: string;
  /** Position continue en tuiles : permet un deplacement fluide. */
  px: number;
  py: number;
  dir: DirectionIndex = 2;
  speed: number;
  hp: number;
  maxHp: number;
  /**
   * Magie disponible et maximum.
   *
   * Sur l'acteur et non sur une classe de personnage : un brigand en a zero,
   * l'Avatar en a soixante, et rien n'interdit d'en donner a un PNJ le jour ou
   * il devra lancer un sort.
   */
  mana = 0;
  maxMana = 0;
  /** Chemin restant a parcourir, en tuiles. */
  path: Array<{ tx: number; ty: number }> = [];
  activity: Activity = 'stand';
  /**
   * L'acteur est arrive au lieu que son emploi du temps lui prescrit.
   *
   * Purement transitoire, et volontairement hors sauvegarde : c'est la seule
   * facon de distinguer « il vient d'arriver » de « il est la depuis une
   * heure », et donc de ne prononcer sa replique qu'une fois.
   */
  atPost = false;
  /** Temps restant avant de pouvoir frapper a nouveau, en secondes. */
  attackCooldown = 0;
  /** Cible en cours. Transitoire : elle se retrouve seule au coup suivant. */
  target: Actor | null = null;
  /**
   * L'acteur cherche le combat.
   *
   * Pour l'Avatar c'est un choix du joueur ; pour un brigand, c'est son etat
   * permanent. Le drapeau evite d'avoir a distinguer les deux dans l'IA.
   */
  inCombat = false;
  /**
   * L'acteur suit l'Avatar au lieu de son emploi du temps.
   *
   * Sauvegarde, contrairement aux autres etats de combat : un groupe qui se
   * disperserait au rechargement obligerait a refaire toutes les
   * conversations de recrutement.
   */
  inParty = false;
  /**
   * Pensees consecutives ou un compagnon n'a trouve aucun chemin vers son
   * meneur. Au-dela d'un seuil, on le remet en formation d'autorite.
   */
  lostTicks = 0;
  schedule: ScheduleEntry[];
  conversationId?: string;
  home?: { tx: number; ty: number };
  /** Phase d'animation de marche. */
  animPhase = 0;
  /** Temporisation generique de l'IA, en secondes. */
  thinkTimer = 0;
  /** Bulle de dialogue affichee au-dessus de la tete. */
  barkText = '';
  barkTimer = 0;

  constructor(init: ActorInit) {
    super(init);
    this.displayName = init.displayName;
    this.px = this.tx;
    this.py = this.ty;
    this.speed = init.speed ?? WALK_SPEED;
    this.maxHp = init.maxHp ?? 30;
    this.hp = this.maxHp;
    this.maxMana = init.maxMana ?? 0;
    this.mana = this.maxMana;
    this.schedule = init.schedule ?? [];
    if (init.conversationId !== undefined) this.conversationId = init.conversationId;
    if (init.home !== undefined) this.home = init.home;
  }

  override get name(): string {
    return this.displayName;
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }

  /** Capacite de portage : au-dela, l'acteur est ralenti. */
  get maxWeight(): number {
    return DEFAULT_MAX_WEIGHT;
  }

  get carriedWeight(): number {
    let total = 0;
    for (const item of this.contents) total += item.totalWeight;
    return total;
  }

  get isOverloaded(): boolean {
    return this.carriedWeight > this.maxWeight;
  }

  /**
   * L'inventaire est le contenu direct de l'acteur : on autorise donc
   * n'importe quel objet, sans limite de volume, la contrainte etant le poids.
   */
  override canAccept(obj: GameObject): boolean {
    if (obj === this) return false;
    if (obj.contains(this)) return false;
    return true;
  }

  /**
   * Range un objet dans l'inventaire, au meilleur endroit.
   *
   * Dans l'ordre : un tas de meme nature auquel se joindre, puis un contenant
   * qui a la place, puis l'inventaire lui-meme. C'est ce qui fait que ramasser
   * des pieces grossit la bourse au lieu d'accumuler des tas separes, et que le
   * reste finit dans le sac plutot qu'en vrac.
   *
   * Retourne false si la charge ne le permet pas, sans rien deplacer.
   */
  stow(obj: GameObject): boolean {
    if (this.carriedWeight + obj.totalWeight > this.maxWeight) return false;

    const pile = this.findDeep((o) => o !== obj && o.canStackWith(obj));
    if (pile) {
      pile.quantity += obj.quantity;
      obj.detach();
      return true;
    }

    for (const contenant of this.contents) {
      if (contenant.isContainer && contenant.canAccept(obj)) return contenant.add(obj);
    }
    return this.add(obj);
  }

  /** Cherche un objet de cette shape dans l'inventaire, a n'importe quel niveau. */
  findItem(shapeId: string): GameObject | null {
    const stack: GameObject[] = [...this.contents];
    while (stack.length > 0) {
      const item = stack.pop()!;
      if (item.shapeId === shapeId) return item;
      stack.push(...item.contents);
    }
    return null;
  }

  say(text: string, seconds = 3): void {
    this.barkText = text;
    this.barkTimer = seconds;
  }

  /** Oriente l'acteur vers une tuile. */
  faceTowards(tx: number, ty: number): void {
    const dx = tx - this.px;
    const dy = ty - this.py;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 1 : 3;
    else this.dir = dy > 0 ? 2 : 0;
  }

  /** Frame de sprite courante : direction + pose de marche. */
  get spriteFrame(): number {
    const walking = this.path.length > 0;
    const pose = walking ? Math.floor(this.animPhase) % 2 : 0;
    return this.dir * 2 + pose;
  }
}

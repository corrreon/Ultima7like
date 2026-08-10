import { DEFAULT_MAX_WEIGHT, WALK_SPEED, type DirectionIndex } from '../core/constants';
import { GameObject, type ObjectInit } from './gameobject';
import type { ScheduleEntry } from '../sim/schedule';

export type Activity = 'stand' | 'wander' | 'sleep' | 'eat' | 'work' | 'patrol' | 'talk';

export interface ActorInit extends ObjectInit {
  displayName: string;
  maxHp?: number;
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
  /** Chemin restant a parcourir, en tuiles. */
  path: Array<{ tx: number; ty: number }> = [];
  activity: Activity = 'stand';
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

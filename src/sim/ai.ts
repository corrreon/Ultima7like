import type { Rng } from '../core/rng';
import type { GameClock } from '../core/clock';
import { Actor } from '../objects/actor';
import type { World } from '../world/world';
import { findPath } from './pathfind';
import { currentEntry } from './schedule';
import { DISTANCE_PERDUE, LAISSE, place } from './party';
import {
  CADENCE,
  PORTEE,
  cibleLaPlusProche,
  cibleValide,
  combattant,
  distance,
  faction,
  frapper,
  type Coup,
} from './combat';

/**
 * IA des PNJ, pilotee par l'emploi du temps.
 *
 * Le principe : chaque PNJ compare en permanence ou il est a l'activite que
 * l'heure lui prescrit. S'il n'est pas au bon endroit, il calcule un chemin ;
 * s'il y est, il joue son activite. Rien de plus — la richesse apparente vient
 * de la densite des emplois du temps, pas de la complexite de l'IA.
 */

/** Ce que chante un PNJ qui travaille avec un luth entre les mains. */
const CHANSONS = [
  '« ... et la dame du lac ne revint jamais... »',
  '« Buvons, amis, la nuit est longue ! »',
  '« Trois corbeaux sur un chene mort... »',
  '« ... jusqu\'a l\'aube, jusqu\'a l\'aube... »',
];

export class ScheduleAI {
  /**
   * Appele a chaque coup porte. L'IA resout le combat elle-meme ; le jeu se
   * contente d'en tirer les consequences visibles — journal, mort, butin.
   */
  onCoup?: (attaquant: Actor, cible: Actor, coup: Coup) => void;

  /** Meneur du groupe. Les compagnons le suivent au lieu de leur emploi du temps. */
  leader: Actor | null = null;

  constructor(
    private readonly world: World,
    private readonly clock: GameClock,
    private readonly rng: Rng,
  ) {}

  update(actor: Actor, dt: number): void {
    if (!actor.isAlive) return;

    if (actor.barkTimer > 0) {
      actor.barkTimer -= dt;
      if (actor.barkTimer <= 0) actor.barkText = '';
    }

    // Un PNJ en conversation reste sur place et fait face a son interlocuteur.
    if (actor.activity === 'talk') {
      actor.path.length = 0;
      return;
    }

    if (actor.attackCooldown > 0) actor.attackCooldown -= dt;

    // Le combat passe avant l'emploi du temps : on ne va pas se coucher pendant
    // qu'on se fait attaquer. Un acteur non combattant, lui, continue sa
    // journee — c'est ce qui evite que l'aubergiste charge les brigands.
    if (combattant(actor) && this.fight(actor)) {
      ScheduleAI.moveAlongPath(actor, dt, this.world);
      return;
    }

    actor.thinkTimer -= dt;
    if (actor.thinkTimer <= 0) {
      actor.thinkTimer = 0.5 + this.rng.next();
      // Un compagnon n'a plus d'emploi du temps : il suit. C'est tout
      // l'interet de recruter quelqu'un — ne pas avoir a le piloter.
      if (actor.inParty && this.leader) this.follow(actor, this.leader);
      else this.think(actor);
    }

    ScheduleAI.moveAlongPath(actor, dt, this.world);
  }

  /**
   * Suit le meneur, en gardant sa place dans la formation.
   *
   * On ne recalcule pas un chemin a chaque pensee : le meneur bouge en
   * permanence, et repartir de zero toutes les demi-secondes donne une marche
   * hachee et coute cher. Tant que le compagnon est a bonne distance, il ne
   * fait rien.
   */
  private follow(actor: Actor, leader: Actor): void {
    actor.activity = 'stand';
    actor.atPost = false;

    const cible = place(leader, this.rank(actor));
    const ecart = Math.max(Math.abs(actor.tx - cible.tx), Math.abs(actor.ty - cible.ty));
    if (ecart <= LAISSE) {
      actor.path.length = 0;
      actor.faceTowards(leader.px, leader.py);
      return;
    }

    // Perdu de vue : on repart de la position du meneur plutot que de sa
    // place, sinon un compagnon coince derriere un mur vise indefiniment une
    // case qu'il ne peut pas atteindre.
    const loin = ecart > DISTANCE_PERDUE;
    const but = loin ? { tx: leader.tx, ty: leader.ty } : cible;
    if (actor.path.length === 0 || loin) {
      actor.path = findPath(this.world, { tx: actor.tx, ty: actor.ty }, but, {
        actor,
        tolerance: loin ? 1 : 0,
        openDoors: true,
      });
    }
  }

  /** Rang du compagnon dans le groupe, qui fixe sa place en formation. */
  private rank(actor: Actor): number {
    let index = 0;
    for (const autre of this.world.actors) {
      if (autre === actor) return index;
      if (autre.inParty && autre.isAlive) index++;
    }
    return index;
  }

  /**
   * Poursuite et coups. Retourne true si le combat occupe l'acteur ce tour.
   *
   * Un brigand cherche toujours la bagarre ; les autres ne se battent que si
   * on les a mis en combat — l'Avatar par le joueur, un garde en repliquant.
   */
  private fight(actor: Actor): boolean {
    const cherche = actor.inCombat || faction(actor) !== 'ville';
    if (!cherche) return false;

    if (!cibleValide(actor, actor.target)) {
      actor.target = cibleLaPlusProche(actor, this.world.actors);
    }
    const cible = actor.target;
    if (!cible) return false;

    actor.activity = 'stand';
    actor.atPost = false;

    if (distance(actor, cible) <= PORTEE) {
      actor.path.length = 0;
      actor.faceTowards(cible.px, cible.py);
      if (actor.attackCooldown <= 0) {
        actor.attackCooldown = CADENCE;
        this.onCoup?.(actor, cible, frapper(actor, cible, this.rng));
      }
      return true;
    }

    // Poursuite. On recalcule souvent : la cible bouge, un chemin calcule une
    // fois pour toutes viserait le sol qu'elle vient de quitter.
    if (actor.path.length === 0) {
      actor.path = findPath(this.world, { tx: actor.tx, ty: actor.ty }, { tx: cible.tx, ty: cible.ty }, {
        actor,
        tolerance: PORTEE,
        openDoors: true,
      });
    }
    return true;
  }

  private think(actor: Actor): void {
    const entry = currentEntry(actor.schedule, this.clock.hourFloat);
    if (!entry) return;

    const changed = actor.activity !== entry.activity;
    actor.activity = entry.activity;

    const tx = Math.round(actor.px);
    const ty = Math.round(actor.py);
    const distance = Math.max(Math.abs(tx - entry.tx), Math.abs(ty - entry.ty));

    if (entry.activity === 'wander') {
      const radius = entry.radius ?? 3;
      if (actor.path.length === 0 && this.rng.chance(0.35)) {
        const target = {
          tx: entry.tx + this.rng.int(-radius, radius),
          ty: entry.ty + this.rng.int(-radius, radius),
        };
        if (!this.world.isOccupied(target.tx, target.ty, actor)) {
          actor.path = findPath(this.world, { tx, ty }, target, {
          actor,
          tolerance: 0,
          openDoors: true,
        });
        }
      }
      return;
    }

    // Pour les activites sur poste, on s'arrete a une tuile de la cible :
    // le lit, l'enclume ou la table sont eux-memes des obstacles.
    const tolerance = 1;
    if (distance > tolerance) {
      actor.atPost = false;
      if (actor.path.length === 0 || changed) {
        actor.path = findPath(this.world, { tx, ty }, { tx: entry.tx, ty: entry.ty }, {
          actor,
          tolerance,
          openDoors: true,
        });
      }
    } else {
      actor.path.length = 0;
      actor.faceTowards(entry.tx, entry.ty);
      // A l'arrivee, et non au depart : `changed` seul ne se verifie que si
      // l'acteur se trouve deja sur place a l'heure dite, ce qui est rare. La
      // plupart des repliques n'etaient donc jamais prononcees.
      if (changed || !actor.atPost) this.announce(actor);
      // Une annonce au seul changement d'activite ferait chanter le barde une
      // fois a dix-neuf heures, puis plus rien de la soiree. Les autres
      // metiers, eux, n'ont pas a repeter qu'ils travaillent.
      else if (this.performs(actor) && actor.barkTimer <= 0 && this.rng.chance(0.05)) {
        this.announce(actor);
      }
      actor.atPost = true;
    }
  }

  /**
   * Le travail d'un musicien qui a son instrument, c'est de jouer.
   *
   * La regle ne nomme personne : elle lit l'inventaire, donc n'importe qui a
   * qui l'on confierait un luth chanterait a son poste.
   */
  private performs(actor: Actor): boolean {
    return actor.activity === 'work' && actor.findDeep((o) => o.shapeId === 'lute') !== null;
  }

  private announce(actor: Actor): void {
    if (this.performs(actor)) {
      const line = this.rng.pick(CHANSONS);
      if (line) actor.say(line, 4);
      return;
    }

    const lines: Record<string, string[]> = {
      sleep: ['Quelle journee...', 'Au lit.'],
      eat: ['J\'ai une faim de loup.', 'Une chope, tavernier !'],
      work: ['A l\'ouvrage.', 'Le travail n\'attend pas.'],
      wander: ['Belle soiree.', 'Salutations.'],
      patrol: ['Rien a signaler.', 'Circulez.'],
    };
    const line = this.rng.pick(lines[actor.activity] ?? []);
    if (line) actor.say(line, 2.5);
  }

  /**
   * Fait avancer l'acteur le long de son chemin, en tuiles par seconde.
   * Statique et publique : l'Avatar l'utilise aussi pour le deplacement au clic.
   */
  static moveAlongPath(actor: Actor, dt: number, world?: World): void {
    const next = actor.path[0];
    if (!next) return;

    // Un PNJ qui arrive devant une porte fermee l'ouvre au lieu de rester
    // plante devant : sans cela, personne ne rentre jamais chez soi.
    if (world) {
      const door = world.closedDoorAt(next.tx, next.ty);
      if (door) door.frame = 1;
    }

    const dx = next.tx - actor.px;
    const dy = next.ty - actor.py;
    const distance = Math.hypot(dx, dy);
    const step = actor.speed * dt * (actor.isOverloaded ? 0.5 : 1);

    if (distance <= step) {
      const prevTx = actor.tx;
      const prevTy = actor.ty;
      actor.px = next.tx;
      actor.py = next.ty;
      actor.path.shift();
      // La position en tuiles ne suit qu'aux cases entieres : les requetes
      // spatiales restent ainsi coherentes avec la grille.
      actor.tx = next.tx;
      actor.ty = next.ty;

      // ... et il la referme derriere lui, si personne d'autre n'est dessus.
      if (world && (prevTx !== next.tx || prevTy !== next.ty)) {
        const behind = world
          .objectsAt(prevTx, prevTy)
          .find((o) => o.shape.door && o.frame === 1);
        if (behind && !world.actorAt(prevTx, prevTy)) behind.frame = 0;
      }
    } else {
      actor.px += (dx / distance) * step;
      actor.py += (dy / distance) * step;
      actor.tx = Math.round(actor.px);
      actor.ty = Math.round(actor.py);
    }

    actor.faceTowards(next.tx, next.ty);
    actor.animPhase = (actor.animPhase + dt * 6) % 2;
  }
}

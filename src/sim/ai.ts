import type { Rng } from '../core/rng';
import type { GameClock } from '../core/clock';
import { Actor } from '../objects/actor';
import type { World } from '../world/world';
import { findPath } from './pathfind';
import { currentEntry } from './schedule';

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

    actor.thinkTimer -= dt;
    if (actor.thinkTimer <= 0) {
      actor.thinkTimer = 0.5 + this.rng.next();
      this.think(actor);
    }

    ScheduleAI.moveAlongPath(actor, dt, this.world);
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

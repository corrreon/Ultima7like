import type { Rng } from '../core/rng';
import type { GameClock } from '../core/clock';
import { Actor } from '../objects/actor';
import type { World } from '../world/world';
import { findPath, type Step } from './pathfind';
import { currentEntry } from './schedule';
import { LAISSE, TENTATIVES_AVANT_RATTRAPAGE, place } from './party';
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

/**
 * Chemins calcules au maximum par image.
 *
 * Deux, choisi par la mesure et non au jugé. Cout du pire tick — celui ou tous
 * les habitants se remettent en route en meme temps — selon le budget :
 *
 * ```
 *              8 hab.   40 hab.   120 hab.
 *   sans        125 ms   752 ms    2125 ms
 *   1            13 ms    13 ms      13 ms
 *   2            20 ms    21 ms      21 ms
 *   3            23 ms    32 ms      36 ms
 * ```
 *
 * Ce qui compte est que la depense devienne **independante du nombre
 * d'habitants** : c'est ce qui permet de peupler une ville sans que chaque
 * changement d'heure la fige. Deux plutot qu'un parce qu'a soixante images par
 * seconde cela dispatche cent vingt habitants en une seconde au lieu de deux,
 * pour un depassement au pire d'une image.
 */
const BUDGET_CHEMINS = 2;

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

  /** Calculs de chemin encore autorises pendant cette image. */
  private budgetChemins = BUDGET_CHEMINS;

  constructor(
    private readonly world: World,
    private readonly clock: GameClock,
    private readonly rng: Rng,
  ) {}

  /**
   * A appeler une fois par image, avant de mettre les acteurs a jour.
   *
   * Un chemin coute une poignee de millisecondes ; le probleme n'est pas son
   * cout mais sa **simultaneite**. A chaque bascule d'emploi du temps, tout le
   * bourg se remet en route dans le meme tick : quarante habitants faisaient
   * ainsi une pointe de plus de cent millisecondes, soit sept images perdues
   * d'un coup, pile au moment ou la ville doit avoir l'air vivante.
   *
   * Le budget etale la pointe sur quelques images. Personne ne s'en apercoit —
   * un PNJ qui part un dixieme de seconde plus tard est indiscernable — et la
   * depense par image devient bornee quel que soit le nombre d'habitants.
   */
  beginFrame(): void {
    this.budgetChemins = BUDGET_CHEMINS;
  }

  /**
   * Cherche un chemin si le budget de l'image le permet.
   *
   * Renvoie `null` quand le budget est epuise : l'appelant laisse alors
   * l'acteur en l'etat et le fait repenser tres vite, plutot que de lui donner
   * un chemin vide qui se lirait comme « je n'ai pas trouve ».
   */
  private chemin(
    from: { tx: number; ty: number },
    to: { tx: number; ty: number },
    options: Parameters<typeof findPath>[3],
  ): Step[] | null {
    if (this.budgetChemins <= 0) return null;
    this.budgetChemins--;
    return findPath(this.world, from, to, options);
  }

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
      actor.lostTicks = 0;
      actor.faceTowards(leader.px, leader.py);
      return;
    }
    // On recalcule des que l'ecart se creuse, sans attendre que le chemin soit
    // epuise : le meneur bouge en permanence, et un chemin calcule une fois
    // vise la place qu'il occupait il y a plusieurs secondes. C'est ce qui
    // faisait decrocher un compagnon de dix tuiles en terrain degage.
    if (actor.path.length > 0 && ecart <= LAISSE + 2) return;

    const ici = { tx: actor.tx, ty: actor.ty };
    const options = { actor, tolerance: 1, openDoors: true } as const;

    // La place en formation n'est **qu'une suggestion**. Sous les arbres elle
    // tombe une fois sur deux sur une case impraticable, et la demander sans
    // tolerance faisait rendre un chemin vide, redemande a l'identique a chaque
    // pensee : le compagnon restait plante en foret jusqu'a ce que le meneur
    // change de cap par hasard.
    const versPlace = this.chemin(ici, cible, options);
    if (versPlace === null) return; // budget epuise : on reessaiera a l'image suivante
    actor.path = versPlace;
    if (actor.path.length === 0) {
      actor.path = this.chemin(ici, { tx: leader.tx, ty: leader.ty }, options) ?? [];
    }

    if (actor.path.length > 0) {
      actor.lostTicks = 0;
      return;
    }

    // Toujours rien : le meneur est hors d'atteinte, ou le budget de recherche
    // n'a pas suffi. On compte, et au bout on le remet en formation d'autorite
    // — l'original ne fait pas autrement, et un compagnon perdu pour de bon est
    // pire qu'un compagnon replace hors du champ.
    actor.lostTicks++;
    if (actor.lostTicks >= TENTATIVES_AVANT_RATTRAPAGE && ecart > 6) {
      const libre = this.freeTileNear(leader, actor);
      if (libre) {
        actor.tx = libre.tx;
        actor.ty = libre.ty;
        actor.px = libre.tx;
        actor.py = libre.ty;
        actor.path.length = 0;
        actor.lostTicks = 0;
      }
    }
  }

  /**
   * Case libre la plus proche du meneur, en spirale.
   *
   * On commence a une tuile pour que le rattrapage ressemble a « il vous a
   * rejoint » et non a « il est apparu au milieu de vous ».
   */
  private freeTileNear(leader: Actor, actor: Actor): { tx: number; ty: number } | null {
    for (let rayon = 1; rayon <= 3; rayon++) {
      for (let dy = -rayon; dy <= rayon; dy++) {
        for (let dx = -rayon; dx <= rayon; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rayon) continue;
          const tx = leader.tx + dx;
          const ty = leader.ty + dy;
          if (this.world.isBlocked(tx, ty, true)) continue;
          if (this.world.isOccupied(tx, ty, actor)) continue;
          return { tx, ty };
        }
      }
    }
    return null;
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
      actor.path = this.chemin(
        { tx: actor.tx, ty: actor.ty },
        { tx: cible.tx, ty: cible.ty },
        { actor, tolerance: PORTEE, openDoors: true },
      ) ?? [];
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
          actor.path = this.chemin({ tx, ty }, target, {
            actor,
            tolerance: 0,
            openDoors: true,
          }) ?? [];
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
        const vers = this.chemin({ tx, ty }, { tx: entry.tx, ty: entry.ty }, {
          actor,
          tolerance,
          openDoors: true,
        });
        // Budget epuise : on repense tres vite plutot que de conclure qu'il n'y
        // a pas de route. Sans cela, un PNJ arrive en retard sur le budget
        // resterait immobile jusqu'a sa prochaine pensee complete.
        if (vers === null) actor.thinkTimer = 0.05;
        else actor.path = vers;
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

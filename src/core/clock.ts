import { GAME_MINUTES_PER_SECOND } from './constants';

/**
 * Horloge du monde.
 *
 * Tout le comportement des PNJ (emplois du temps, ouverture des boutiques,
 * lumiere ambiante) depend d'elle : c'est la source de verite du temps de jeu,
 * jamais l'horloge reelle.
 */
export class GameClock {
  /** Minutes ecoulees depuis le debut de la partie. */
  private minutes: number;

  constructor(startHour = 7, startMinute = 0) {
    this.minutes = startHour * 60 + startMinute;
  }

  /** Etat complet de l'horloge, en minutes. C'est ce que la sauvegarde stocke. */
  get totalMinutes(): number {
    return this.minutes;
  }

  advance(realSeconds: number): void {
    this.minutes += realSeconds * GAME_MINUTES_PER_SECOND;
  }

  get minute(): number {
    return Math.floor(this.minutes) % 60;
  }

  get hour(): number {
    return Math.floor(this.minutes / 60) % 24;
  }

  get day(): number {
    return Math.floor(this.minutes / (60 * 24)) + 1;
  }

  /** Heure fractionnaire dans [0, 24), pratique pour interpoler la lumiere. */
  get hourFloat(): number {
    return (this.minutes / 60) % 24;
  }

  get isNight(): boolean {
    const h = this.hourFloat;
    return h < 6 || h >= 20;
  }

  format(): string {
    const h = String(this.hour).padStart(2, '0');
    const m = String(this.minute).padStart(2, '0');
    return `Jour ${this.day} — ${h}:${m}`;
  }
}

import type { Activity } from '../objects/actor';

export interface ScheduleEntry {
  /** Heure de debut, dans [0, 24). */
  hour: number;
  activity: Activity;
  /** Lieu ou l'activite se deroule. */
  tx: number;
  ty: number;
  /** Rayon de flanerie autour du lieu, pour l'activite « wander ». */
  radius?: number;
}

/**
 * Resout l'entree d'emploi du temps active a une heure donnee.
 *
 * C'est le mecanisme qui donne a Ultima VII sa reputation : chaque PNJ a une
 * journee (dormir, manger, travailler, boire a la taverne) et le monde continue
 * de tourner que le joueur regarde ou non. L'emploi du temps est circulaire :
 * a 2 h du matin, l'entree active est la derniere de la veille.
 */
export function currentEntry(schedule: readonly ScheduleEntry[], hour: number): ScheduleEntry | null {
  if (schedule.length === 0) return null;

  const sorted = [...schedule].sort((a, b) => a.hour - b.hour);
  let active: ScheduleEntry | null = sorted[sorted.length - 1]!; // repli circulaire
  for (const entry of sorted) {
    if (entry.hour <= hour) active = entry;
    else break;
  }
  return active;
}

/** Emploi du temps type d'un artisan, parametre par ses lieux de vie. */
export function craftsmanSchedule(places: {
  bed: { tx: number; ty: number };
  work: { tx: number; ty: number };
  tavern: { tx: number; ty: number };
  square: { tx: number; ty: number };
}): ScheduleEntry[] {
  return [
    { hour: 0, activity: 'sleep', ...places.bed },
    { hour: 7, activity: 'eat', ...places.tavern },
    { hour: 8, activity: 'work', ...places.work },
    { hour: 12, activity: 'eat', ...places.tavern },
    { hour: 13, activity: 'work', ...places.work },
    { hour: 18, activity: 'wander', ...places.square, radius: 4 },
    { hour: 20, activity: 'eat', ...places.tavern },
    { hour: 22, activity: 'sleep', ...places.bed },
  ];
}

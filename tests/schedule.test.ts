import { describe, expect, it } from 'vitest';
import { currentEntry, craftsmanSchedule, type ScheduleEntry } from '../src/sim/schedule';
import { GameClock } from '../src/core/clock';
import { ambientAt } from '../src/render/lighting';
import { ConversationState, getConversation } from '../src/script/conversation';
import '../src/data/dialogue';

const schedule: ScheduleEntry[] = [
  { hour: 0, activity: 'sleep', tx: 1, ty: 1 },
  { hour: 8, activity: 'work', tx: 5, ty: 5 },
  { hour: 18, activity: 'eat', tx: 9, ty: 9 },
  { hour: 22, activity: 'sleep', tx: 1, ty: 1 },
];

describe('emplois du temps', () => {
  it('selectionne l\'activite en cours', () => {
    expect(currentEntry(schedule, 9)!.activity).toBe('work');
    expect(currentEntry(schedule, 19)!.activity).toBe('eat');
    expect(currentEntry(schedule, 23)!.activity).toBe('sleep');
  });

  it('boucle sur la veille avant la premiere entree', () => {
    const partial: ScheduleEntry[] = [
      { hour: 8, activity: 'work', tx: 5, ty: 5 },
      { hour: 20, activity: 'sleep', tx: 1, ty: 1 },
    ];
    // A 3 h du matin, c'est encore l'entree de 20 h qui s'applique.
    expect(currentEntry(partial, 3)!.activity).toBe('sleep');
  });

  it('gere un emploi du temps vide', () => {
    expect(currentEntry([], 12)).toBeNull();
  });

  it('produit une journee d\'artisan complete', () => {
    const places = {
      bed: { tx: 1, ty: 1 },
      work: { tx: 2, ty: 2 },
      tavern: { tx: 3, ty: 3 },
      square: { tx: 4, ty: 4 },
    };
    const made = craftsmanSchedule(places);
    expect(currentEntry(made, 3)!.activity).toBe('sleep');
    expect(currentEntry(made, 10)!.activity).toBe('work');
    expect(currentEntry(made, 12.5)!.activity).toBe('eat');
    expect(currentEntry(made, 19)!.activity).toBe('wander');
  });
});

describe('horloge', () => {
  it('avance et boucle sur 24 heures', () => {
    const clock = new GameClock(23, 30);
    clock.advance(60); // 60 secondes reelles = 60 minutes de jeu
    expect(clock.hour).toBe(0);
    expect(clock.minute).toBe(30);
    expect(clock.day).toBe(2);
  });

  it('distingue le jour de la nuit', () => {
    expect(new GameClock(3).isNight).toBe(true);
    expect(new GameClock(13).isNight).toBe(false);
    expect(new GameClock(21).isNight).toBe(true);
  });
});

describe('lumiere ambiante', () => {
  it('fait plus sombre la nuit qu\'a midi', () => {
    expect(ambientAt(12).darkness).toBeLessThan(ambientAt(2).darkness);
    expect(ambientAt(12).darkness).toBe(0);
    expect(ambientAt(0).darkness).toBeGreaterThan(0.5);
  });

  it('interpole entre deux moments-cles', () => {
    const dusk = ambientAt(20);
    expect(dusk.darkness).toBeGreaterThan(ambientAt(19).darkness);
    expect(dusk.darkness).toBeLessThan(ambientAt(21.5).darkness);
  });
});

describe('dialogues', () => {
  it('revele de nouveaux sujets au fil de la conversation', () => {
    const flags = new Set<string>();
    const def = getConversation('mireille')!;
    const state = new ConversationState(def, flags);

    expect(state.visibleTopics().map((t) => t.id)).not.toContain('aldric');
    state.select('bourg');
    expect(state.visibleTopics().map((t) => t.id)).toContain('aldric');
    expect(flags.has('connait_basile')).toBe(true);
  });

  it('retire un sujet a usage unique', () => {
    const state = new ConversationState(getConversation('mireille')!, new Set());
    expect(state.visibleTopics().map((t) => t.id)).toContain('nom');
    state.select('nom');
    expect(state.visibleTopics().map((t) => t.id)).not.toContain('nom');
  });

  it('partage les drapeaux entre personnages', () => {
    const flags = new Set<string>();
    const aldric = new ConversationState(getConversation('aldric')!, flags);

    // Sans avoir entendu parler du luth, Aldric n'a pas le sujet.
    aldric.select('forge');
    expect(aldric.visibleTopics().map((t) => t.id)).not.toContain('luth');

    // Apres avoir parle a Mireille, le sujet apparait.
    const mireille = new ConversationState(getConversation('mireille')!, flags);
    mireille.select('bourg');
    mireille.select('basile');
    expect(flags.has('connait_luth')).toBe(true);

    const aldric2 = new ConversationState(getConversation('aldric')!, flags);
    expect(aldric2.visibleTopics().map((t) => t.id)).toContain('luth');
  });
});

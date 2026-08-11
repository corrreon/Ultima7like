import { describe, expect, it } from 'vitest';
import '../src/data/dialogue';
import { allConversations } from '../src/script/conversation';

/**
 * Integrite des arbres de dialogue.
 *
 * Un dialogue ne plante jamais : un sujet inatteignable ne fait rien, il
 * n'apparait simplement pas, et rien ne le signale. C'est le mode de panne le
 * plus couteux du jeu, parce qu'il se traduit par une quete qu'on ne peut pas
 * terminer sans qu'aucune trace n'apparaisse nulle part.
 */
describe('arbres de dialogue', () => {
  const convs = allConversations();

  it('ne reference que des sujets qui existent', () => {
    for (const conv of convs) {
      const ids = new Set(conv.topics.map((t) => t.id));
      for (const id of conv.initial) {
        expect(ids.has(id), `${conv.id} : sujet initial inconnu « ${id} »`).toBe(true);
      }
      for (const topic of conv.topics) {
        for (const revealed of topic.reveals ?? []) {
          expect(ids.has(revealed), `${conv.id}/${topic.id} : revele « ${revealed} », inconnu`).toBe(true);
        }
      }
    }
  });

  it('laisse chaque sujet atteignable', () => {
    for (const conv of convs) {
      const atteignables = new Set(conv.initial);
      for (const topic of conv.topics) {
        for (const revealed of topic.reveals ?? []) atteignables.add(revealed);
      }
      for (const topic of conv.topics) {
        expect(atteignables.has(topic.id), `${conv.id} : sujet orphelin « ${topic.id} »`).toBe(true);
      }
    }
  });

  it('ne cache pas derriere une revelation un sujet qui attend un drapeau du dehors', () => {
    // Le piege : `reveals` ne dure que le temps d'une conversation, alors
    // qu'un drapeau est definitif. Un sujet revele sur place mais qui exige un
    // drapeau pose ailleurs demande de sortir pour l'obtenir — et sortir
    // remet la liste des sujets a `initial`. Il n'est donc jamais visible.
    for (const conv of convs) {
      const initial = new Set(conv.initial);
      const posesIci = new Set(conv.topics.flatMap((t) => t.sets ?? []));

      for (const topic of conv.topics) {
        if (!topic.requires || initial.has(topic.id)) continue;
        for (const flag of topic.requires) {
          expect(
            posesIci.has(flag),
            `${conv.id}/${topic.id} exige « ${flag} », pose ailleurs, sans etre dans initial`,
          ).toBe(true);
        }
      }
    }
  });

  it('donne a chaque conversation une sortie', () => {
    for (const conv of convs) {
      const sorties = conv.topics.filter((t) => t.ends && conv.initial.includes(t.id));
      expect(sorties.length, `${conv.id} : aucune facon de prendre conge`).toBeGreaterThan(0);
    }
  });
});

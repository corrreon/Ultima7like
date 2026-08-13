import { describe, expect, it } from 'vitest';
import '../src/data/dialogue';
import { allConversations } from '../src/script/conversation';
import { buildTown } from '../src/data/town';
import { populate } from '../src/data/npcs';

/**
 * Integrite des arbres de dialogue.
 *
 * Un dialogue ne plante jamais : un sujet inatteignable ne fait rien, il
 * n'apparait simplement pas, et rien ne le signale. C'est le mode de panne le
 * plus couteux du jeu, parce qu'il se traduit par une quete qu'on ne peut pas
 * terminer sans qu'aucune trace n'apparaisse nulle part.
 */
describe('arbres de dialogue', () => {
  // Peupler le bourg **avant** de collecter les conversations : celles des
  // habitants quelconques sont generees a ce moment-la, et n'existent pas au
  // chargement du module. Sans cet appel, ce fichier ne verifiait que les
  // quatre arbres ecrits a la main — et laissait passer seize arbres generes
  // dont aucun n'avait de sortie, ce qui bloquait le panneau de dialogue
  // ouvert pour de bon.
  populate(buildTown());
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

describe('identifiants de sujets', () => {
  it('sont uniques dans chaque conversation', () => {
    // Deux sujets de meme identifiant se retrouvent tous deux dans la liste, et
    // toute recherche par identifiant prend le premier : le second devient
    // inatteignable sans que rien ne le signale. C'est arrive en greffant une
    // quete sur un PNJ qui avait deja un sujet du meme nom.
    for (const conv of allConversations()) {
      const vus = new Set<string>();
      for (const topic of conv.topics) {
        expect(vus.has(topic.id), `${conv.id} : deux sujets « ${topic.id} »`).toBe(false);
        vus.add(topic.id);
      }
    }
  });
});

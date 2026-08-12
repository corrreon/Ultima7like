import { describe, expect, it } from 'vitest';
import { GameObject } from '../src/objects/gameobject';
import { aUnUsage } from '../src/script/usecode';
import { allShapes } from '../src/world/shapes';

/**
 * Ce que le doigt peut atteindre.
 *
 * Le bouton « Agir » balaie les tuiles voisines et ne declenche que ce qui a un
 * comportement. Quand ce filtre etait une liste de drapeaux ecrite a la main,
 * elle a derive : le lit avait recu le sommeil sans y figurer, et le bouton
 * ouvrait la porte de la chambre au lieu de coucher l'Avatar.
 */
describe('ce qui a un usage', () => {
  const objet = (shape: string): GameObject => new GameObject({ shape, tx: 5, ty: 5 });

  it('reconnait tout ce qui a un comportement declare', () => {
    // Chacun a un `onUse` dans usecode.ts. Les nommer un par un est le but :
    // ajouter un comportement sans le rendre accessible au doigt doit se voir.
    for (const shape of ['bed', 'canopybed', 'anvil', 'sign', 'lamppost', 'hearth', 'lute', 'torch']) {
      expect(aUnUsage(objet(shape)), `${shape} devrait avoir un usage`).toBe(true);
    }
  });

  it('reconnait les comportements generiques', () => {
    expect(aUnUsage(objet('door'))).toBe(true); // porte
    expect(aUnUsage(objet('chest'))).toBe(true); // contenant
    expect(aUnUsage(objet('bread'))).toBe(true); // nourriture
    expect(aUnUsage(objet('gold'))).toBe(true); // ramassable
  });

  it('ecarte le decor', () => {
    // Sans quoi le bouton « fait » un mur ou un arbre, et n'atteint jamais
    // l'objet interessant deux cases plus loin.
    for (const shape of ['wall', 'roof', 'tree', 'fence', 'well', 'rug']) {
      expect(aUnUsage(objet(shape)), `${shape} ne devrait rien faire`).toBe(false);
    }
  });

  it('n\'offre pas de ramasser ce qui est deja dans un sac', () => {
    const sac = new GameObject({ shape: 'bag' });
    const piece = new GameObject({ shape: 'gold' });
    sac.add(piece);
    expect(aUnUsage(piece)).toBe(false);
  });

  it('ne laisse aucune shape transportable hors de portee du doigt', () => {
    // Regle generale plutot qu'une liste : tout ce qui se ramasse doit pouvoir
    // etre ramasse au doigt.
    for (const shape of allShapes()) {
      if (!shape.takeable) continue;
      expect(aUnUsage(objet(shape.id)), `${shape.id} est transportable`).toBe(true);
    }
  });
});

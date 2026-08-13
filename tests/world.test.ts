import { describe, expect, it } from 'vitest';
import { World } from '../src/world/world';
import { GameObject } from '../src/objects/gameobject';
import { CHUNK_SIZE } from '../src/core/constants';
import { buildTown, LANDMARKS, LOGIS_PREFIX, PORTES, REMPART, WORLD_SIZE } from '../src/data/town';
import { findPath } from '../src/sim/pathfind';

describe('monde et chunks', () => {
  it('range les objets dans le chunk correspondant', () => {
    const world = new World(64, 64);
    const obj = new GameObject({ shape: 'tree', tx: 20, ty: 35 });
    world.addObject(obj);

    const chunk = world.chunkByIndex(Math.floor(20 / CHUNK_SIZE), Math.floor(35 / CHUNK_SIZE));
    expect(chunk?.objects).toContain(obj);
  });

  it('reindexe un objet qui change de chunk', () => {
    const world = new World(64, 64);
    const obj = new GameObject({ shape: 'bag', tx: 5, ty: 5 });
    world.addObject(obj);
    world.moveObject(obj, 40, 40);

    expect(world.chunkByIndex(0, 0)?.objects ?? []).not.toContain(obj);
    expect(world.chunkByIndex(2, 2)?.objects).toContain(obj);
    expect(world.objectsAt(40, 40)).toContain(obj);
  });

  it('tient compte de l\'emprise au sol', () => {
    const world = new World(64, 64);
    // Un lit fait 1x2 : sa tuile est le coin bas-droit, il s'etend vers le nord.
    const bed = new GameObject({ shape: 'bed', tx: 10, ty: 10 });
    world.addObject(bed);

    expect(world.objectsAt(10, 10)).toContain(bed);
    expect(world.objectsAt(10, 9)).toContain(bed);
    expect(world.objectsAt(10, 8)).not.toContain(bed);
    expect(world.objectsAt(11, 10)).not.toContain(bed);
  });

  it('trouve les objets par-dela les frontieres de chunk', () => {
    const world = new World(64, 64);
    // Objet a cheval sur la limite x = 16.
    const bed = new GameObject({ shape: 'bed', tx: 15, ty: 16 });
    world.addObject(bed);
    expect(world.objectsAt(15, 15)).toContain(bed);
    expect(world.objectsInRect(10, 10, 20, 20)).toContain(bed);
  });

  it('considere l\'eau et les murs comme infranchissables', () => {
    const world = new World(32, 32);
    world.setTerrain(3, 3, 'water');
    world.addObject(new GameObject({ shape: 'wall', tx: 5, ty: 5 }));

    expect(world.isBlocked(3, 3)).toBe(true);
    expect(world.isBlocked(5, 5)).toBe(true);
    expect(world.isBlocked(6, 6)).toBe(false);
    expect(world.isBlocked(-1, 0)).toBe(true);
  });

  it('distingue ce qui arrete les pas de ce qui arrete le regard', () => {
    const world = new World(32, 32);
    world.setTerrain(5, 5, 'water');
    world.addObject(new GameObject({ shape: 'table', tx: 8, ty: 8 })); // hauteur 2
    world.addObject(new GameObject({ shape: 'wall', tx: 11, ty: 11 })); // hauteur 5

    // L'eau et la table bloquent le passage ou pas, mais laissent voir.
    expect(world.isBlocked(5, 5)).toBe(true);
    expect(world.isOpaque(5, 5)).toBe(false);
    expect(world.isBlocked(8, 8)).toBe(true);
    expect(world.isOpaque(8, 8)).toBe(false);
    // Le mur arrete les deux.
    expect(world.isOpaque(11, 11)).toBe(true);
  });

  it('coupe la ligne de vue derriere un mur, pas derriere une table', () => {
    const world = new World(32, 32);
    for (let y = 0; y < 32; y++) {
      if (y === 5) continue;
      world.addObject(new GameObject({ shape: 'wall', tx: 10, ty: y }));
    }
    const door = new GameObject({ shape: 'door', tx: 10, ty: 5 });
    world.addObject(door);

    // A travers le mur : rien.
    expect(world.hasLineOfSight(8, 8, 12, 8)).toBe(false);
    // A travers une porte fermee : rien non plus.
    expect(world.hasLineOfSight(8, 5, 12, 5)).toBe(false);
    // Porte ouverte : on voit.
    door.frame = 1;
    expect(world.hasLineOfSight(8, 5, 12, 5)).toBe(true);
  });

  it('n\'exclut pas les extremites de la ligne de vue', () => {
    const world = new World(32, 32);
    // On doit pouvoir agir sur la porte devant laquelle on se tient, bien
    // qu'elle soit elle-meme opaque.
    world.addObject(new GameObject({ shape: 'door', tx: 4, ty: 4 }));
    expect(world.hasLineOfSight(4, 5, 4, 4)).toBe(true);
    expect(world.hasLineOfSight(4, 6, 4, 4)).toBe(true);
    // Mais pas sur ce qui se trouve juste derriere.
    expect(world.hasLineOfSight(4, 5, 4, 3)).toBe(false);
  });

  it('libere le passage quand la porte s\'ouvre', () => {
    const world = new World(32, 32);
    const door = new GameObject({ shape: 'door', tx: 4, ty: 4 });
    world.addObject(door);
    expect(world.isBlocked(4, 4)).toBe(true);
    door.frame = 1;
    expect(world.isBlocked(4, 4)).toBe(false);
  });
});

describe('carte de Valmoret', () => {
  const world = buildTown();

  it('genere les lieux publics et le quartier d\'habitation', () => {
    const noms = world.regions.map((r) => r.name);
    expect(noms).toContain('Taverne du Chat Endormi');
    expect(noms).toContain('Halle au grain');

    // Vingt logis, deux lits chacun : de quoi coucher les quarante habitants
    // quelconques. Un habitant sans lit dormirait dans un champ.
    const logis = world.regions.filter((r) => r.name.startsWith(LOGIS_PREFIX));
    expect(logis).toHaveLength(20);

    const lits = [...world.allObjects()].filter(
      (o) => o.shapeId === 'bed' && world.regionAt(o.tx, o.ty)?.name.startsWith(LOGIS_PREFIX),
    );
    expect(lits).toHaveLength(40);
  });

  it('ferme la ville, sauf aux portes', () => {
    // Une enceinte percee quelque part n'est plus une enceinte : on entre par
    // la breche, les portes ne servent a rien, et le rempart devient un decor.
    const breches: string[] = [];
    for (let tx = REMPART.x0; tx <= REMPART.x1; tx++) {
      for (const ty of [REMPART.y0, REMPART.y1]) {
        if (!world.isBlocked(tx, ty)) breches.push(`${tx},${ty}`);
      }
    }
    for (let ty = REMPART.y0 + 1; ty < REMPART.y1; ty++) {
      for (const tx of [REMPART.x0, REMPART.x1]) {
        if (!world.isBlocked(tx, ty)) breches.push(`${tx},${ty}`);
      }
    }
    // Les seules ouvertures sont les portes, et elles commencent ouvertes.
    expect(breches.sort()).toEqual(PORTES.map((p) => `${p.tx},${p.ty}`).sort());
  });

  it('laisse chaque batiment a l\'ecart du rempart', () => {
    // Le rempart est pose apres les plans et ne passe pas par `validerPlans` :
    // un batiment qui le toucherait verrait ses murs ecrases sans un mot.
    for (const region of world.regions) {
      expect(region.x0, `${region.name} touche le rempart`).toBeGreaterThan(REMPART.x0 + 2);
      expect(region.x1, `${region.name} touche le rempart`).toBeLessThan(REMPART.x1 - 2);
      expect(region.y0, `${region.name} touche le rempart`).toBeGreaterThan(REMPART.y0 + 2);
      expect(region.y1, `${region.name} touche le rempart`).toBeLessThan(REMPART.y1 - 2);
    }
  });

  it('laisse une route du coeur de ville jusqu\'au campement, hors les murs', () => {
    // La quete des brigands en depend : si le rempart enferme le joueur, elle
    // devient injouable sans que rien ne le signale.
    const chemin = findPath(world, LANDMARKS.square, LANDMARKS.camp, {
      tolerance: 1,
      maxNodes: 20000,
    });
    expect(chemin.length).toBeGreaterThan(0);
    // Et cette route passe bien par une porte.
    expect(chemin.some((pas) => PORTES.some((p) => p.tx === pas.tx && p.ty === pas.ty))).toBe(true);
  });

  it('donne au batiment en L une forme reelle, pas sa boite englobante', () => {
    const hall = world.regions.find((r) => r.name === 'Halle au grain')!;

    // Le coin nord-est du rectangle est en dehors du batiment : c'est le creux
    // du L. La boite englobante le contient, la forme reelle non.
    const notch = { tx: hall.x1, ty: hall.y0 };
    expect(notch.tx).toBeLessThanOrEqual(hall.x1);
    expect(world.regionAt(notch.tx, notch.ty)).toBeNull();

    // Le corps principal, lui, appartient bien au batiment.
    expect(world.regionAt(hall.x0 + 3, hall.y0 + 2)?.name).toBe('Halle au grain');
    expect(world.regionAt(hall.x1 - 1, hall.y1 - 2)?.name).toBe('Halle au grain');
  });

  it('distingue interieur et murs dans une region', () => {
    const hall = world.regions.find((r) => r.name === 'Halle au grain')!;
    // Coin haut-gauche : c'est un mur, donc pas un interieur.
    expect(world.isBuildingInterior(hall, hall.x0, hall.y0)).toBe(false);
    // Une case de plancher l'est.
    expect(world.isBuildingInterior(hall, hall.x0 + 3, hall.y0 + 2)).toBe(true);
    // Le creux du L n'est ni l'un ni l'autre.
    expect(world.isBuildingInterior(hall, hall.x1, hall.y0)).toBe(false);
  });

  it('pose chaque lit entierement sur du plancher', () => {
    // L'emprise s'etend vers le nord-ouest depuis la tuile de l'objet : elargir
    // un meuble peut le faire mordre sur un mur sans que rien ne proteste, le
    // lit n'etant pas solide. La verification vaut pour toute augmentation
    // future d'emprise.
    const beds = [...world.allObjects()].filter((o) => o.shapeId === 'bed');
    expect(beds.length).toBeGreaterThan(0);

    for (const bed of beds) {
      const [w, d] = bed.shape.footprint;
      const region = world.regionAt(bed.tx, bed.ty);
      expect(region, `lit en ${bed.tx},${bed.ty} hors batiment`).not.toBeNull();

      for (let dy = 0; dy < d; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const tx = bed.tx - dx;
          const ty = bed.ty - dy;
          expect(
            world.isBuildingInterior(region!, tx, ty),
            `lit en ${bed.tx},${bed.ty} deborde sur ${tx},${ty}`,
          ).toBe(true);
        }
      }
    }
  });

  it('place les objets multi-tuiles sur toute leur emprise', () => {
    const rug = [...world.allObjects()].find((o) => o.shapeId === 'rug');
    expect(rug).toBeDefined();
    expect(rug!.shape.footprint).toEqual([3, 2]);

    // Un tapis de 3x2 ancre en (tx, ty) couvre tx-2..tx et ty-1..ty.
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        expect(world.objectsAt(rug!.tx - dx, rug!.ty - dy)).toContain(rug);
      }
    }
    expect(world.objectsAt(rug!.tx - 3, rug!.ty)).not.toContain(rug);
    expect(world.objectsAt(rug!.tx + 1, rug!.ty)).not.toContain(rug);
  });

  it('pose un puits de 2x2 qui bloque ses quatre cases', () => {
    const well = [...world.allObjects()].find((o) => o.shapeId === 'well');
    expect(well).toBeDefined();
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        expect(world.isBlocked(well!.tx - dx, well!.ty - dy)).toBe(true);
      }
    }
  });

  it('place les lieux de vie sur des tuiles coherentes', () => {
    const bedTiles = [LANDMARKS.tavernBedA, LANDMARKS.smithyBed, LANDMARKS.bardBed, LANDMARKS.guardBed];
    for (const tile of bedTiles) {
      const objects = world.objectsAt(tile.tx, tile.ty);
      expect(objects.some((o) => o.shapeId === 'bed')).toBe(true);
    }
    expect(world.objectsAt(LANDMARKS.smithyAnvil.tx, LANDMARKS.smithyAnvil.ty)
      .some((o) => o.shapeId === 'anvil')).toBe(true);
  });

  it('laisse l\'Avatar sur une case franchissable', () => {
    expect(world.isBlocked(LANDMARKS.avatarStart.tx, LANDMARKS.avatarStart.ty)).toBe(false);
  });

  it('reste dans ses limites', () => {
    expect(world.inBounds(WORLD_SIZE - 1, WORLD_SIZE - 1)).toBe(true);
    expect(world.inBounds(WORLD_SIZE, 0)).toBe(false);
  });

  it('remplit les contenants', () => {
    const chest = world.objectsAt(28, 29).find((o) => o.shapeId === 'chest');
    expect(chest).toBeDefined();
    expect(chest!.contents.length).toBeGreaterThan(0);
    expect(chest!.totalWeight).toBeGreaterThan(chest!.ownWeight);
  });

  it('ne laisse aucun contenant vide au campement', () => {
    // Poser une caisse et un sac dans le decor puis les laisser vides est le
    // meilleur moyen de faire passer trois brigands pour une perte de temps.
    // La regle vaut pour tout contenant du campement, y compris ceux qu'on y
    // ajoutera plus tard.
    const camp = LANDMARKS.camp;
    const contenants = [...world.allObjects()].filter(
      (o) => o.isContainer && o.parent === null
        && Math.max(Math.abs(o.tx - camp.tx), Math.abs(o.ty - camp.ty)) <= 6,
    );
    expect(contenants.length).toBeGreaterThanOrEqual(3);

    for (const c of contenants) {
      expect(c.contents.length, `${c.name} en ${c.tx},${c.ty} est vide`).toBeGreaterThan(0);
    }
  });
});

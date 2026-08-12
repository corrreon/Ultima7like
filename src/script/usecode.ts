import { GameObject } from '../objects/gameobject';
import { Actor } from '../objects/actor';
import type { World } from '../world/world';
import { soigner, soinsDuRepas } from '../sim/repos';

/**
 * « Usecode » : le comportement des objets quand on les utilise.
 *
 * Ultima VII embarque une machine virtuelle a pile et un bytecode compile
 * (usecode) qui pilote tout : portes, quetes, dialogues, pieges. On garde
 * l'idee — le comportement est une donnee attachee a la shape, pas du code
 * disperse dans le moteur — mais on l'implemente ici avec de simples closures
 * TypeScript, ce qui suffit tant qu'on n'a pas besoin de sauvegarder l'etat
 * d'execution d'un script en cours.
 */

export interface UsecodeContext {
  world: World;
  /** Qui declenche l'action (l'Avatar la plupart du temps). */
  actor: Actor;
  /** Ecrit une ligne dans le journal affiche a l'ecran. */
  log: (text: string) => void;
  /** Ouvre la fenetre d'un contenant. */
  openContainer: (obj: GameObject) => void;
  /** Demarre une conversation. */
  startConversation: (npc: Actor) => void;
  /**
   * Ramasse un objet et le range. Retourne false si c'est impossible.
   *
   * Le clic simple met l'objet « en main », a la facon d'Ultima VII, ce qui
   * suppose d'ouvrir ensuite son sac pour l'y deposer — trois gestes pour
   * ramasser une piece, et aucun equivalent commode au doigt. « Utiliser » un
   * objet transportable qui n'a pas d'autre usage le range donc directement.
   */
  take: (obj: GameObject) => boolean;
  /**
   * Dort jusqu'au matin. L'usecode ne connait ni l'horloge ni les hostiles :
   * il declare l'intention, le jeu en tire les consequences.
   */
  dormir: () => void;
}

export type UsecodeHandler = (obj: GameObject, ctx: UsecodeContext) => void;

const handlers = new Map<string, UsecodeHandler>();

/** Associe un comportement a une shape. */
export function onUse(shapeId: string, handler: UsecodeHandler): void {
  handlers.set(shapeId, handler);
}

/**
 * Cet objet fait-il quelque chose quand on l'utilise ?
 *
 * Le bouton « Agir » du tactile balaie les tuiles autour de l'Avatar et doit
 * ecarter ce qui ne repondrait pas — inutile de « manger » le plancher parce
 * qu'il etait la premiere case rencontree. Il le faisait avec une liste de
 * drapeaux ecrite a la main : portes, contenants, objets transportables et
 * l'enclume, nommee en dur.
 *
 * Cette liste a derive. Le lit a recu le sommeil, l'atre se couvre, l'enseigne
 * se lit, le reverbere se regarde — aucun n'y figurait, donc **rien de tout
 * cela n'etait accessible au doigt**. Mesure dans le jeu : au pied d'un lit, le
 * bouton ouvrait la porte de la chambre.
 *
 * La question a poser n'est pas « de quel type est cet objet » mais « a-t-il un
 * comportement », et c'est le registre d'usecode qui le sait. Ainsi la liste ne
 * peut plus se desynchroniser : enregistrer un comportement suffit a le rendre
 * accessible au doigt.
 */
export function aUnUsage(obj: GameObject): boolean {
  if (handlers.has(obj.shapeId)) return true;
  const shape = obj.shape;
  if (shape.door === true || shape.container === true) return true;
  if ((shape.food ?? 0) > 0) return true;
  return shape.takeable === true && obj.parent === null;
}

/**
 * Declenche l'usage d'un objet.
 * Retourne false si rien n'etait prevu, pour que l'appelant affiche un message.
 */
export function use(obj: GameObject, ctx: UsecodeContext): boolean {
  const specific = handlers.get(obj.shapeId);
  if (specific) {
    specific(obj, ctx);
    return true;
  }

  // Comportements par defaut deduits des drapeaux de la shape : c'est ce qui
  // evite d'ecrire un script pour chacun des centaines d'objets du monde.
  const shape = obj.shape;

  if (shape.door) {
    toggleDoor(obj, ctx);
    return true;
  }

  if (shape.container) {
    ctx.openContainer(obj);
    return true;
  }

  if (shape.food) {
    // Manger est le seul soin qu'on ait toujours sur soi. Le message dit ce
    // qu'on a gagne, sinon rien ne distingue une miche d'une pomme.
    const rendus = soigner(ctx.actor, soinsDuRepas(shape.food));
    ctx.log(
      rendus > 0
        ? `Vous mangez ${obj.name.toLowerCase()}. Vous vous sentez mieux (+${rendus}).`
        : `Vous mangez ${obj.name.toLowerCase()}.`,
    );
    consumeOne(obj, ctx.world);
    return true;
  }

  // En dernier, pour ne pas ramasser ce qui a un usage propre : un tonneau
  // s'ouvre, une miche se mange, et seul ce qui ne sait rien faire d'autre se
  // met dans le sac.
  if (shape.takeable && obj.parent === null) {
    return ctx.take(obj);
  }

  return false;
}

/** Ouvre ou ferme une porte, en verifiant qu'elle n'est pas verrouillee. */
export function toggleDoor(obj: GameObject, ctx: UsecodeContext): void {
  if (obj.quality > 0 && obj.frame === 0) {
    const key = ctx.actor.findItem('key');
    if (!key || key.quality !== obj.quality) {
      ctx.log('La porte est verrouillee.');
      return;
    }
    ctx.log('Vous deverrouillez la porte.');
    obj.quality = 0;
  }
  obj.frame = obj.frame === 0 ? 1 : 0;
  ctx.log(obj.frame === 1 ? 'La porte s\'ouvre.' : 'La porte se ferme.');
}

/** Retire une unite d'une pile, en supprimant l'objet s'il est epuise. */
export function consumeOne(obj: GameObject, world: World): void {
  if (obj.quantity > 1) {
    obj.quantity--;
    return;
  }
  if (obj.parent) obj.detach();
  else world.removeObject(obj);
}

// --- Comportements specifiques -------------------------------------------

onUse('bed', (_obj, ctx) => ctx.dormir());
onUse('canopybed', (_obj, ctx) => ctx.dormir());

onUse('anvil', (_obj, ctx) => {
  const hammer = ctx.actor.findItem('hammer');
  if (!hammer) {
    ctx.log('Il vous faudrait un marteau de forge.');
    return;
  }
  ctx.log('Vous frappez le metal rougi. Le son resonne dans l\'atelier.');
});

onUse('sign', (obj, ctx) => {
  ctx.log(`L'enseigne indique : « ${obj.customName ?? 'illisible'} ».`);
});

onUse('lamppost', (obj, ctx) => {
  ctx.log(obj.frame === 0 ? 'La lanterne brule deja.' : 'La lanterne est eteinte.');
});

// Frame 0 : flammes (animees). Frame 3 : braises couvertes.
onUse('hearth', (obj, ctx) => {
  obj.frame = obj.frame === 0 ? 3 : 0;
  ctx.log(obj.frame === 0 ? 'Le feu reprend.' : 'Vous couvrez les braises.');
});

onUse('lute', (_obj, ctx) => {
  ctx.log('Vous jouez quelques notes. Un chien aboie au loin.');
});

onUse('torch', (obj, ctx) => {
  obj.quality = obj.quality === 0 ? 1 : 0;
  ctx.log(obj.quality === 1 ? 'La torche s\'embrase.' : 'Vous etouffez la flamme.');
});

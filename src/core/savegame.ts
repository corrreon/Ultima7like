import { Actor } from '../objects/actor';
import { GameObject, peekNextObjectId, setNextObjectId } from '../objects/gameobject';
import { World, type BuildingRegion } from '../world/world';
import type { ScheduleEntry } from '../sim/schedule';
import { GameClock } from './clock';

/**
 * Sauvegarde et chargement.
 *
 * C'est l'etape structurante de tout projet de ce type, et la repousser coute
 * cher : elle oblige a rendre l'etat du jeu serialisable, ce qui revele
 * immediatement les endroits ou cet etat est cache dans des fermetures ou des
 * references circulaires.
 *
 * Le verdict pour ce moteur est bon : l'usecode est fait de fermetures, mais
 * ces fermetures sont du **code**, pas de l'etat — l'etat d'un objet tient
 * entierement dans sa frame et sa qualite. Rien a demeler. La seule vraie
 * difficulte est l'arborescence des contenants, qui est circulaire (un objet
 * connait son parent, le parent connait ses enfants) : on ne serialise que la
 * descendance, et le lien parent se reconstruit a la lecture.
 *
 * Choix assume : on sauvegarde le monde en entier plutot qu'un differentiel
 * par rapport a la graine de generation. C'est plus volumineux mais robuste —
 * une sauvegarde ne se casse pas quand la carte change de version.
 */

export const SAVE_VERSION = 1;
const STORAGE_KEY = 'ultima7like.save';

/**
 * Empreinte de la carte de depart.
 *
 * Une sauvegarde contient le terrain et tous les objets : elle fige donc la
 * carte telle qu'elle etait au moment de la premiere partie. Ajouter un
 * sentier, un feu de camp ou un batiment ne change alors **rien** pour qui a
 * deja joue — le monde repris est l'ancien, sans que rien ne le signale. C'est
 * le pire mode de panne possible : le jeu a l'air de fonctionner, il raconte
 * simplement une autre carte que celle qu'on croit.
 *
 * D'ou cette empreinte, calculee sur la carte neuve et rangee dans la
 * sauvegarde. Elle se recalcule toute seule a chaque modification de la carte,
 * ce qu'un numero de version tenu a la main ne fait pas — et c'est justement
 * cet oubli qui a produit le probleme.
 *
 * On ne prend que ce qui vient du generateur de carte : terrain, regions, et
 * objets a leur place d'origine. Ce que le joueur deplace ensuite n'en fait
 * pas partie, sans quoi l'empreinte changerait au premier pas.
 */
export function mapSignature(world: World): string {
  let h = 0x811c9dc5;
  const melange = (texte: string): void => {
    for (let i = 0; i < texte.length; i++) {
      h ^= texte.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };

  melange(`${world.widthTiles}x${world.heightTiles}`);
  for (let ty = 0; ty < world.heightTiles; ty++) {
    for (let tx = 0; tx < world.widthTiles; tx++) melange(world.terrainAt(tx, ty));
  }
  for (const region of world.regions) melange(region.name);
  const objets = [...world.allObjects()]
    .map((o) => `${o.shapeId}@${o.tx},${o.ty},${o.tz}`)
    .sort();
  for (const objet of objets) melange(objet);

  return (h >>> 0).toString(36);
}

/** Objet serialise. Les clefs sont courtes : il y en a des milliers. */
export interface SavedObject {
  i: number;
  s: string;
  f?: number;
  x?: number;
  y?: number;
  z?: number;
  q?: number;
  Q?: number;
  n?: string;
  c?: SavedObject[];
}

export interface SavedActor extends SavedObject {
  d: string;
  px: number;
  py: number;
  dir: number;
  hp: number;
  mhp: number;
  sp: number;
  act: string;
  conv?: string;
  /** Compagnon. Absent pour la quasi-totalite des acteurs, d'ou l'optionnel. */
  party?: boolean;
  sched?: ScheduleEntry[];
  home?: { tx: number; ty: number };
}

/** Plage de terrain : identifiant, nombre de cases consecutives. */
export type TerrainRun = [string, number];

export interface SaveData {
  v: number;
  /** Empreinte de la carte de depart. Voir `mapSignature`. */
  map?: string;
  /** Date de la sauvegarde, en ms epoch. Sert a l'affichage seulement. */
  at: number;
  minutes: number;
  w: number;
  h: number;
  terrain: TerrainRun[];
  /** Variante de chaque case, un chiffre par tuile, en balayage ligne par ligne. */
  tframes: string;
  regions: BuildingRegion[];
  objects: SavedObject[];
  actors: SavedActor[];
  /** Index de l'Avatar dans `actors`. */
  avatar: number;
  flags: string[];
  nextId: number;
}

// --- Ecriture -------------------------------------------------------------

function saveObject(obj: GameObject): SavedObject {
  const out: SavedObject = { i: obj.id, s: obj.shapeId };
  if (obj.frame !== 0) out.f = obj.frame;
  if (obj.tx !== 0) out.x = obj.tx;
  if (obj.ty !== 0) out.y = obj.ty;
  if (obj.tz !== 0) out.z = obj.tz;
  if (obj.quantity !== 1) out.q = obj.quantity;
  if (obj.quality !== 0) out.Q = obj.quality;
  if (obj.customName !== undefined) out.n = obj.customName;
  if (obj.contents.length > 0) out.c = obj.contents.map(saveObject);
  return out;
}

function saveActor(actor: Actor): SavedActor {
  const base = saveObject(actor);
  const out: SavedActor = {
    ...base,
    d: actor.displayName,
    px: actor.px,
    py: actor.py,
    dir: actor.dir,
    hp: actor.hp,
    mhp: actor.maxHp,
    sp: actor.speed,
    act: actor.activity,
  };
  if (actor.conversationId !== undefined) out.conv = actor.conversationId;
  if (actor.inParty) out.party = true;
  if (actor.schedule.length > 0) out.sched = actor.schedule;
  if (actor.home !== undefined) out.home = actor.home;
  return out;
}

/**
 * Terrain compresse.
 *
 * Une carte de 96x96 fait 9216 cases, dont d'immenses aplats d'herbe. Le
 * codage par plages est donc tres rentable — a condition de ne coder que
 * l'**identifiant** du terrain.
 *
 * Le premier jet encodait identifiant et variante ensemble, et ne compressait
 * quasiment rien : les variantes d'herbe sont tirees au hasard case par case,
 * donc deux voisines different presque toujours. Les variantes partent donc
 * dans une chaine separee, un chiffre par tuile.
 */
function saveTerrain(world: World): { runs: TerrainRun[]; frames: string } {
  const runs: TerrainRun[] = [];
  const frames: string[] = [];
  let current: TerrainRun | null = null;

  for (let ty = 0; ty < world.heightTiles; ty++) {
    for (let tx = 0; tx < world.widthTiles; tx++) {
      const id = world.terrainAt(tx, ty);
      if (current && current[0] === id) current[1]++;
      else {
        current = [id, 1];
        runs.push(current);
      }
      frames.push(String(world.terrainFrameAt(tx, ty) % 10));
    }
  }
  return { runs, frames: frames.join('') };
}

export interface GameState {
  world: World;
  avatar: Actor;
  clock: GameClock;
  flags: Set<string>;
  /**
   * Empreinte de la carte **neuve** dont cette partie est issue.
   *
   * Elle se calcule sur une carte fraichement generee, jamais sur le monde en
   * cours : le joueur deplace des objets, et l'empreinte doit rester celle du
   * generateur.
   */
  mapSignature?: string;
}

export function serialize(state: GameState): SaveData {
  const { world, avatar, clock, flags } = state;
  const terrain = saveTerrain(world);
  return {
    v: SAVE_VERSION,
    map: state.mapSignature ?? '',
    at: Date.now(),
    minutes: clock.totalMinutes,
    w: world.widthTiles,
    h: world.heightTiles,
    terrain: terrain.runs,
    tframes: terrain.frames,
    regions: world.regions.map((r) => ({ ...r })),
    objects: [...world.allObjects()].map(saveObject),
    actors: world.actors.map(saveActor),
    avatar: world.actors.indexOf(avatar),
    flags: [...flags],
    nextId: peekNextObjectId(),
  };
}

// --- Lecture --------------------------------------------------------------

function loadObject(data: SavedObject): GameObject {
  const obj = new GameObject({
    id: data.i,
    shape: data.s,
    frame: data.f ?? 0,
    tx: data.x ?? 0,
    ty: data.y ?? 0,
    tz: data.z ?? 0,
    quantity: data.q ?? 1,
    quality: data.Q ?? 0,
    ...(data.n !== undefined ? { name: data.n } : {}),
  });
  // On force l'ajout sans passer par canAccept : le contenu etait deja valide
  // au moment de la sauvegarde, et une regle de capacite qui aurait change
  // depuis ne doit pas faire disparaitre les affaires du joueur.
  for (const child of data.c ?? []) {
    const loaded = loadObject(child);
    loaded.parent = obj;
    obj.contents.push(loaded);
  }
  return obj;
}

function loadActor(data: SavedActor): Actor {
  const actor = new Actor({
    id: data.i,
    shape: data.s,
    displayName: data.d,
    frame: data.f ?? 0,
    tx: data.x ?? 0,
    ty: data.y ?? 0,
    tz: data.z ?? 0,
    quality: data.Q ?? 0,
    maxHp: data.mhp,
    speed: data.sp,
    schedule: data.sched ?? [],
    ...(data.conv !== undefined ? { conversationId: data.conv } : {}),
    ...(data.home !== undefined ? { home: data.home } : {}),
  });
  actor.px = data.px;
  actor.py = data.py;
  actor.dir = data.dir as Actor['dir'];
  actor.hp = data.hp;
  actor.inParty = data.party === true;
  actor.activity = data.act as Actor['activity'];
  for (const child of data.c ?? []) {
    const loaded = loadObject(child);
    loaded.parent = actor;
    actor.contents.push(loaded);
  }
  return actor;
}

function loadTerrain(world: World, runs: TerrainRun[], frames: string): void {
  let index = 0;
  for (const [id, count] of runs) {
    for (let n = 0; n < count; n++) {
      const tx = index % world.widthTiles;
      const ty = Math.floor(index / world.widthTiles);
      world.setTerrain(tx, ty, id, Number(frames[index] ?? '0'));
      index++;
    }
  }
}

export class SaveError extends Error {}

/**
 * Relit une sauvegarde.
 *
 * `attendue` est l'empreinte de la carte neuve. Fournie, elle fait refuser une
 * sauvegarde issue d'une carte differente — mieux vaut repartir de zero en le
 * disant que jouer une carte fantome sur laquelle la moitie de ce que les PNJ
 * racontent n'existe pas.
 */
export function deserialize(data: SaveData, attendue?: string): GameState {
  if (attendue !== undefined && (data.map ?? '') !== attendue) {
    throw new SaveError(
      'La carte a change depuis cette sauvegarde : le monde enregistre est l\'ancien.',
    );
  }

  if (data.v !== SAVE_VERSION) {
    // Point d'accroche des migrations : tant qu'il n'y a qu'une version, on
    // refuse proprement plutot que de charger un etat incoherent.
    throw new SaveError(
      `Sauvegarde en version ${data.v}, ce moteur attend la version ${SAVE_VERSION}.`,
    );
  }

  const world = new World(data.w, data.h);
  loadTerrain(world, data.terrain, data.tframes);
  world.regions.push(...data.regions);

  for (const saved of data.objects) world.addObject(loadObject(saved));
  for (const saved of data.actors) world.addActor(loadActor(saved));

  const avatar = world.actors[data.avatar];
  if (!avatar) throw new SaveError('Sauvegarde sans Avatar.');

  setNextObjectId(data.nextId);

  return {
    world,
    avatar,
    clock: new GameClock(0, data.minutes),
    flags: new Set(data.flags),
  };
}

// --- Persistance ----------------------------------------------------------

/** Ecrit la sauvegarde dans le stockage local. Retourne false en cas d'echec. */
export function writeToStorage(state: GameState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(state)));
    return true;
  } catch {
    // Quota depasse, ou stockage refuse en navigation privee. On ne fait pas
    // echouer la partie pour autant.
    return false;
  }
}

/**
 * Resultat d'une tentative de reprise.
 *
 * Distinguer les cas plutot que de rendre `null` partout : « il n'y avait pas
 * de partie » et « il y en avait une, mais elle est perimee » demandent des
 * mots differents au joueur, et sans cette distinction l'appelant en est
 * reduit a relire la sauvegarde une seconde fois pour deviner laquelle.
 */
export type LoadOutcome =
  | { kind: 'ok'; state: GameState }
  | { kind: 'aucune' }
  | { kind: 'perimee' }
  | { kind: 'illisible' };

/** Lit la sauvegarde. `attendue` : empreinte de la carte neuve. */
export function readFromStorage(attendue?: string): LoadOutcome {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { kind: 'aucune' };
  }
  if (!raw) return { kind: 'aucune' };

  let data: SaveData;
  try {
    data = JSON.parse(raw) as SaveData;
  } catch {
    return { kind: 'illisible' };
  }

  if (attendue !== undefined && (data.map ?? '') !== attendue) return { kind: 'perimee' };

  try {
    return { kind: 'ok', state: deserialize(data, attendue) };
  } catch {
    return { kind: 'illisible' };
  }
}

export function hasStoredSave(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Rien a faire : l'absence de stockage n'est pas une erreur de jeu.
  }
}

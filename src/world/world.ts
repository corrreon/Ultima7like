import { CHUNK_SIZE } from '../core/constants';
import { GameObject } from '../objects/gameobject';
import { Actor } from '../objects/actor';
import { getShape } from './shapes';

/**
 * Un chunk : une parcelle carree de terrain plus les objets qui y sont poses.
 *
 * Ultima VII decoupe son monde de 3072x3072 tuiles en chunks de 16x16, ce qui
 * permet de ne charger et de ne dessiner que le voisinage du joueur. On garde
 * ce decoupage : c'est ce qui rend le monde « sans couture » sans avoir a tout
 * garder en memoire vive ni a tout parcourir a chaque image.
 */
export class Chunk {
  /** Identifiants de terrain, indexes par y * CHUNK_SIZE + x. */
  readonly terrain: string[];
  /** Variante de frame du terrain, pour casser la repetition visuelle. */
  readonly terrainFrame: Uint8Array;
  /** Objets dont l'origine tombe dans ce chunk. */
  readonly objects: GameObject[] = [];

  constructor(
    readonly cx: number,
    readonly cy: number,
    fill = 'grass',
  ) {
    this.terrain = new Array<string>(CHUNK_SIZE * CHUNK_SIZE).fill(fill);
    this.terrainFrame = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  }
}

export interface BuildingRegion {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Le monde : terrain, objets, acteurs, et les requetes spatiales dont le reste
 * du moteur a besoin (qu'y a-t-il sur cette tuile ? est-elle franchissable ?).
 */
export class World {
  private readonly chunks = new Map<string, Chunk>();
  readonly actors: Actor[] = [];
  readonly regions: BuildingRegion[] = [];

  constructor(
    readonly widthTiles: number,
    readonly heightTiles: number,
  ) {}

  private static key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.widthTiles && ty < this.heightTiles;
  }

  /** Recupere le chunk contenant la tuile, en le creant au besoin. */
  chunkAt(tx: number, ty: number, create = true): Chunk | undefined {
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const key = World.key(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk && create) {
      chunk = new Chunk(cx, cy);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  chunkByIndex(cx: number, cy: number): Chunk | undefined {
    return this.chunks.get(World.key(cx, cy));
  }

  // --- Terrain ------------------------------------------------------------

  setTerrain(tx: number, ty: number, id: string, frame = 0): void {
    if (!this.inBounds(tx, ty)) return;
    const chunk = this.chunkAt(tx, ty)!;
    const index = (ty % CHUNK_SIZE) * CHUNK_SIZE + (tx % CHUNK_SIZE);
    chunk.terrain[index] = id;
    chunk.terrainFrame[index] = frame;
  }

  terrainAt(tx: number, ty: number): string {
    if (!this.inBounds(tx, ty)) return 'water';
    const chunk = this.chunkAt(tx, ty, false);
    if (!chunk) return 'grass';
    return chunk.terrain[(ty % CHUNK_SIZE) * CHUNK_SIZE + (tx % CHUNK_SIZE)] ?? 'grass';
  }

  terrainFrameAt(tx: number, ty: number): number {
    const chunk = this.chunkAt(tx, ty, false);
    if (!chunk) return 0;
    return chunk.terrainFrame[(ty % CHUNK_SIZE) * CHUNK_SIZE + (tx % CHUNK_SIZE)] ?? 0;
  }

  // --- Objets -------------------------------------------------------------

  /** Pose un objet dans le monde a sa position courante. */
  addObject(obj: GameObject): void {
    obj.detach();
    const chunk = this.chunkAt(obj.tx, obj.ty)!;
    chunk.objects.push(obj);
  }

  /** Retire un objet du monde (il n'est plus pose nulle part). */
  removeObject(obj: GameObject): void {
    const chunk = this.chunkAt(obj.tx, obj.ty, false);
    if (!chunk) return;
    const index = chunk.objects.indexOf(obj);
    if (index >= 0) chunk.objects.splice(index, 1);
  }

  /** Deplace un objet deja pose, en le reindexant si besoin de chunk. */
  moveObject(obj: GameObject, tx: number, ty: number, tz = obj.tz): void {
    this.removeObject(obj);
    obj.tx = tx;
    obj.ty = ty;
    obj.tz = tz;
    this.addObject(obj);
  }

  addActor(actor: Actor): void {
    this.actors.push(actor);
  }

  /** Tous les objets poses dont l'emprise couvre la tuile. */
  objectsAt(tx: number, ty: number): GameObject[] {
    const found: GameObject[] = [];
    // Une emprise peut deborder depuis un chunk voisin : on balaie les chunks
    // adjacents pour ne rien manquer.
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const chunk = this.chunkByIndex(cx + dx, cy + dy);
        if (!chunk) continue;
        for (const obj of chunk.objects) {
          if (obj.occupies(tx, ty)) found.push(obj);
        }
      }
    }
    return found;
  }

  /** Tous les objets poses dans un rectangle de tuiles. */
  objectsInRect(x0: number, y0: number, x1: number, y1: number): GameObject[] {
    const found: GameObject[] = [];
    const cx0 = Math.floor(x0 / CHUNK_SIZE) - 1;
    const cy0 = Math.floor(y0 / CHUNK_SIZE) - 1;
    const cx1 = Math.floor(x1 / CHUNK_SIZE);
    const cy1 = Math.floor(y1 / CHUNK_SIZE);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.chunkByIndex(cx, cy);
        if (!chunk) continue;
        for (const obj of chunk.objects) {
          const [w, h] = obj.shape.footprint;
          if (obj.tx < x0 - 1 || obj.tx - w + 1 > x1) continue;
          if (obj.ty < y0 - 1 || obj.ty - h + 1 > y1) continue;
          found.push(obj);
        }
      }
    }
    return found;
  }

  /**
   * Tous les objets poses dans le monde, tous chunks confondus.
   * Les acteurs n'y figurent pas : ils vivent dans `actors`.
   */
  *allObjects(): Iterable<GameObject> {
    for (const chunk of this.chunks.values()) yield* chunk.objects;
  }

  /** Coordonnees de tous les chunks existants. */
  chunkKeys(): Array<{ cx: number; cy: number }> {
    return [...this.chunks.values()].map((chunk) => ({ cx: chunk.cx, cy: chunk.cy }));
  }

  actorAt(tx: number, ty: number, ignore?: Actor): Actor | null {
    for (const actor of this.actors) {
      if (actor === ignore || !actor.isAlive) continue;
      if (Math.round(actor.px) === tx && Math.round(actor.py) === ty) return actor;
    }
    return null;
  }

  // --- Requetes de deplacement -------------------------------------------

  /**
   * La tuile est-elle franchissable (terrain et objets) ?
   *
   * `doorsPassable` permet de considerer une porte fermee comme traversable :
   * c'est ce dont le pathfinding des PNJ a besoin, puisqu'ils savent ouvrir
   * une porte en arrivant devant. L'Avatar, lui, se cogne dedans.
   */
  isBlocked(tx: number, ty: number, doorsPassable = false): boolean {
    if (!this.inBounds(tx, ty)) return true;
    if (getShape(this.terrainAt(tx, ty)).solid) return true;
    for (const obj of this.objectsAt(tx, ty)) {
      if (this.blocksMovement(obj, doorsPassable)) return true;
    }
    return false;
  }

  /** Comme isBlocked, mais en tenant compte des acteurs presents. */
  isOccupied(tx: number, ty: number, ignore?: Actor, doorsPassable = false): boolean {
    if (this.isBlocked(tx, ty, doorsPassable)) return true;
    return this.actorAt(tx, ty, ignore) !== null;
  }

  /** Une porte ouverte ne bloque pas ; un objet solide, oui. */
  blocksMovement(obj: GameObject, doorsPassable = false): boolean {
    const shape = obj.shape;
    if (!shape.solid) return false;
    if (shape.door && (doorsPassable || obj.frame === 1)) return false;
    return true;
  }

  /**
   * L'objet bloque-t-il la vue ?
   *
   * A distinguer soigneusement du blocage du deplacement : on voit par-dessus
   * une table ou un coffre, on ne voit pas a travers un mur, et l'eau arrete
   * les pas sans arreter le regard. D'ou le critere sur la hauteur plutot que
   * sur le seul drapeau `solid`.
   */
  blocksSight(obj: GameObject): boolean {
    const shape = obj.shape;
    if (!shape.solid || shape.height < 3) return false;
    if (shape.door && obj.frame === 1) return false; // porte ouverte
    return true;
  }

  isOpaque(tx: number, ty: number): boolean {
    for (const obj of this.objectsAt(tx, ty)) {
      if (this.blocksSight(obj)) return true;
    }
    return false;
  }

  /**
   * Y a-t-il une ligne de vue degagee entre deux tuiles ?
   *
   * Les deux extremites sont exclues : on doit pouvoir ouvrir la porte devant
   * laquelle on se tient, alors qu'elle est elle-meme opaque.
   */
  hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps <= 1) return true;

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const tx = Math.round(x0 + dx * t);
      const ty = Math.round(y0 + dy * t);
      if ((tx === x0 && ty === y0) || (tx === x1 && ty === y1)) continue;
      if (this.isOpaque(tx, ty)) return false;
    }
    return true;
  }

  /** Porte fermee presente sur la tuile, s'il y en a une. */
  closedDoorAt(tx: number, ty: number): GameObject | null {
    for (const obj of this.objectsAt(tx, ty)) {
      if (obj.shape.door && obj.frame === 0) return obj;
    }
    return null;
  }

  /** Region (batiment) contenant la tuile, s'il y en a une. */
  regionAt(tx: number, ty: number): BuildingRegion | null {
    for (const region of this.regions) {
      if (tx >= region.x0 && tx <= region.x1 && ty >= region.y0 && ty <= region.y1) {
        return region;
      }
    }
    return null;
  }
}

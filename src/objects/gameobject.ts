import { getShape, type ShapeDef } from '../world/shapes';

let nextId = 1;

/** Reinitialise le compteur d'identifiants (utile dans les tests). */
export function resetObjectIds(): void {
  nextId = 1;
}

/** Prochain identifiant qui sera attribue. Sauvegarde par savegame.ts. */
export function peekNextObjectId(): number {
  return nextId;
}

/**
 * Restaure le compteur d'identifiants apres un chargement.
 * Ne recule jamais : deux objets vivants ne doivent pas partager un identifiant.
 */
export function setNextObjectId(value: number): void {
  nextId = Math.max(nextId, value);
}

export interface ObjectInit {
  shape: string;
  /** Identifiant impose, uniquement lors d'un chargement de partie. */
  id?: number;
  frame?: number;
  tx?: number;
  ty?: number;
  tz?: number;
  quantity?: number;
  quality?: number;
  name?: string;
  contents?: GameObject[];
}

/**
 * Objet du monde.
 *
 * Un objet est soit pose dans le monde (parent === null, coordonnees valides),
 * soit contenu dans un autre objet (parent !== null). Cette dualite est la
 * regle centrale d'Ultima VII : un sac dans un coffre dans une maison est une
 * chaine d'objets tout a fait ordinaire, et le poids remonte la chaine.
 */
export class GameObject {
  readonly id: number;
  readonly shapeId: string;
  frame: number;
  tx: number;
  ty: number;
  tz: number;
  /** Quantite, pour les objets empilables (or, fleches). */
  quantity: number;
  /** Champ libre : etat de la serrure, cle associee, cuisson du pain... */
  quality: number;
  /** Nom personnalise, sinon celui de la shape. */
  customName?: string;

  parent: GameObject | null = null;
  readonly contents: GameObject[] = [];

  constructor(init: ObjectInit) {
    if (init.id !== undefined) {
      // Chargement d'une partie : on reprend l'identifiant d'origine, et on
      // pousse le compteur au-dela pour que les objets crees ensuite ne
      // reutilisent pas un identifiant deja vivant.
      this.id = init.id;
      nextId = Math.max(nextId, init.id + 1);
    } else {
      this.id = nextId++;
    }
    this.shapeId = init.shape;
    this.frame = init.frame ?? 0;
    this.tx = init.tx ?? 0;
    this.ty = init.ty ?? 0;
    this.tz = init.tz ?? 0;
    this.quantity = init.quantity ?? 1;
    this.quality = init.quality ?? 0;
    if (init.name !== undefined) this.customName = init.name;
    for (const child of init.contents ?? []) this.add(child);
  }

  get shape(): ShapeDef {
    return getShape(this.shapeId);
  }

  get name(): string {
    return this.customName ?? this.shape.name;
  }

  get isContainer(): boolean {
    return this.shape.container === true;
  }

  /** Poids propre de l'objet, quantite comprise, hors contenu. */
  get ownWeight(): number {
    return (this.shape.weight ?? 0) * this.quantity;
  }

  /** Poids total : l'objet plus, recursivement, tout ce qu'il contient. */
  get totalWeight(): number {
    let total = this.ownWeight;
    for (const child of this.contents) total += child.totalWeight;
    return total;
  }

  /** Volume occupe dans le contenant parent. */
  get volume(): number {
    return (this.shape.volume ?? 0) * this.quantity;
  }

  /** Volume deja consomme a l'interieur de cet objet. */
  get usedCapacity(): number {
    let used = 0;
    for (const child of this.contents) used += child.volume;
    return used;
  }

  get freeCapacity(): number {
    if (!this.isContainer) return 0;
    return (this.shape.capacity ?? 0) - this.usedCapacity;
  }

  /** Verifie qu'un objet peut entrer ici (contenant, place, pas de cycle). */
  canAccept(obj: GameObject): boolean {
    if (!this.isContainer) return false;
    if (obj === this) return false;
    if (obj.contains(this)) return false; // pas de contenant recursif
    return obj.volume <= this.freeCapacity;
  }

  /** Vrai si `obj` est quelque part dans l'arborescence de cet objet. */
  contains(obj: GameObject): boolean {
    for (const child of this.contents) {
      if (child === obj || child.contains(obj)) return true;
    }
    return false;
  }

  /** Ajoute un objet au contenu, en le detachant d'abord de son parent. */
  add(obj: GameObject): boolean {
    if (!this.canAccept(obj)) return false;
    obj.detach();
    obj.parent = this;
    this.contents.push(obj);
    return true;
  }

  /** Retire l'objet de son parent, sans le placer ailleurs. */
  detach(): void {
    if (!this.parent) return;
    const list = this.parent.contents;
    const index = list.indexOf(this);
    if (index >= 0) list.splice(index, 1);
    this.parent = null;
  }

  /** Remonte la chaine des parents jusqu'a l'objet racine. */
  get root(): GameObject {
    let current: GameObject = this;
    while (current.parent) current = current.parent;
    return current;
  }

  /** Position dans le monde : celle de l'objet, ou celle de sa racine. */
  worldPosition(): { tx: number; ty: number; tz: number } {
    const root = this.root;
    return { tx: root.tx, ty: root.ty, tz: root.tz };
  }

  /** Fusionne deux piles d'objets identiques (or + or). */
  canStackWith(other: GameObject): boolean {
    return (
      this.shape.stackable === true &&
      other.shapeId === this.shapeId &&
      other.quality === this.quality
    );
  }

  /** Occupe-t-il la tuile donnee, compte tenu de son emprise au sol ? */
  occupies(tx: number, ty: number): boolean {
    const [w, h] = this.shape.footprint;
    return tx > this.tx - w && tx <= this.tx && ty > this.ty - h && ty <= this.ty;
  }

  /** Description lisible, avec la quantite si l'objet s'empile. */
  describe(): string {
    if (this.quantity > 1) return `${this.name} (${this.quantity})`;
    return this.name;
  }
}

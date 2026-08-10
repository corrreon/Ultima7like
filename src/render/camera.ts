import { LIFT_OFFSET, TILE_SIZE } from '../core/constants';

/**
 * Camera : conversion monde <-> ecran.
 *
 * Ultima VII n'est pas isometrique, contrairement a une idee repandue : la
 * grille reste alignee sur l'ecran (le nord est en haut), et c'est la hauteur
 * (« lift ») qui decale le sprite en diagonale, vers le haut et vers la gauche.
 * C'est ce seul decalage qui produit la fausse 3D caracteristique du jeu, et
 * c'est ce que reproduit `worldToScreen`.
 *
 * Convention d'ancrage, identique a celle du jeu d'origine : la tuile (tx, ty)
 * d'un objet designe le coin bas-droit de son emprise, et le sprite est colle
 * a ce coin. Un objet de 1x2 tuiles s'etend donc vers le nord.
 */
export class Camera {
  /** Position visee, en tuiles (flottantes). */
  x = 0;
  y = 0;
  /** Facteur de zoom entier, pour rester net en pixel art. */
  zoom = 2;

  /** Taille de la zone visible, en pixels logiques. */
  viewWidth = 0;
  viewHeight = 0;

  setViewport(pixelWidth: number, pixelHeight: number): void {
    this.viewWidth = pixelWidth / this.zoom;
    this.viewHeight = pixelHeight / this.zoom;
  }

  /** Suit une cible avec un lissage exponentiel independant du framerate. */
  follow(tx: number, ty: number, dt: number, stiffness = 8): void {
    const k = 1 - Math.exp(-stiffness * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  /** Coin haut-gauche de la vue, en pixels monde. */
  get originX(): number {
    return this.x * TILE_SIZE - this.viewWidth / 2;
  }

  get originY(): number {
    return this.y * TILE_SIZE - this.viewHeight / 2;
  }

  /**
   * Position ecran du coin bas-droit d'une tuile, hauteur comprise.
   * Le sprite est ensuite dessine en soustrayant ses propres dimensions.
   */
  worldToScreen(tx: number, ty: number, tz = 0): { sx: number; sy: number } {
    return {
      sx: (tx + 1) * TILE_SIZE - tz * LIFT_OFFSET - this.originX,
      sy: (ty + 1) * TILE_SIZE - tz * LIFT_OFFSET - this.originY,
    };
  }

  /** Tuile visee par un point de l'ecran (au niveau du sol, tz = 0). */
  screenToWorld(pixelX: number, pixelY: number): { tx: number; ty: number } {
    const wx = pixelX / this.zoom + this.originX;
    const wy = pixelY / this.zoom + this.originY;
    return { tx: Math.floor(wx / TILE_SIZE), ty: Math.floor(wy / TILE_SIZE) };
  }

  /** Rectangle de tuiles a dessiner, avec une marge pour les objets hauts. */
  visibleTileRect(margin = 8): { x0: number; y0: number; x1: number; y1: number } {
    const x0 = Math.floor(this.originX / TILE_SIZE) - margin;
    const y0 = Math.floor(this.originY / TILE_SIZE) - margin;
    const x1 = Math.ceil((this.originX + this.viewWidth) / TILE_SIZE) + margin;
    const y1 = Math.ceil((this.originY + this.viewHeight) / TILE_SIZE) + margin;
    return { x0, y0, x1, y1 };
  }
}

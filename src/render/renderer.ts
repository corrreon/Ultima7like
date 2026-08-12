import { TILE_SIZE } from '../core/constants';
import type { GameClock } from '../core/clock';
import type { Actor } from '../objects/actor';
import type { GameObject } from '../objects/gameobject';
import type { World } from '../world/world';
import { transitionsAt } from '../world/terrain';
import { getKerb, getSprite, getTransition, type Sprite } from './art';
import { Camera } from './camera';
import { Lighting, type LightSource } from './lighting';
import { SHADOW } from './palette';

interface Drawable {
  sprite: Sprite;
  sx: number;
  sy: number;
  depth: number;
  tie: number;
}

/** Cotes testes pour poser une bordure de trottoir. */
const KERB_SIDES: Array<['n' | 'e' | 's' | 'w', number, number]> = [
  ['n', 0, -1],
  ['e', 1, 0],
  ['s', 0, 1],
  ['w', -1, 0],
];

interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Cet objet fait-il partie du sol ?
 *
 * Une hauteur nulle veut dire « pose a plat » : un tapis, des cailloux, une
 * touffe d'herbe. Rien ne passe dessous, tout passe dessus — ils sortent donc
 * du tri en profondeur et sont dessines avec le terrain.
 */
export function isFloorProp(obj: GameObject): boolean {
  const shape = obj.shape;
  return shape.kind === 'object' && !shape.roof && shape.height === 0 && obj.tz === 0;
}

/**
 * Rendu de la scene.
 *
 * L'ordre des passes reproduit celui d'un decor peint : le sol, puis les
 * raccords entre terrains, puis les ombres portees, puis tout ce qui se
 * dresse — trie du plus lointain au plus proche.
 *
 * L'ordre de dessin de cette derniere passe est le vrai sujet d'un moteur de
 * ce type. Exult resout le probleme par une comparaison topologique entre
 * boites englobantes, ce qui est exact mais couteux ; on utilise ici une cle
 * de tri suffisante dans la quasi-totalite des cas.
 */
export class Renderer {
  /** Rayon du sort de lumiere en cours, 0 s'il n'y en a pas. */
  halo = 0;
  readonly camera = new Camera();
  private readonly lighting = new Lighting();
  private readonly drawables: Drawable[] = [];
  /** Horloge d'animation, en secondes reelles. */
  private time = 0;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(world: World, avatar: Actor, clock: GameClock, pixelWidth: number, pixelHeight: number): void {
    const ctx = this.ctx;
    const camera = this.camera;
    camera.setViewport(pixelWidth, pixelHeight);
    this.time = performance.now() / 1000;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0a08';
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    ctx.scale(camera.zoom, camera.zoom);

    // Le sol n'a aucun debordement vertical : une marge etroite suffit, et
    // cela evite de calculer des raccords sur des centaines de tuiles
    // invisibles. Les objets, eux, peuvent depasser de plusieurs tuiles.
    const ground = camera.visibleTileRect(2);
    const view = camera.visibleTileRect(8);

    this.drawTerrain(world, ground);

    const insideRegion = world.regionAt(Math.round(avatar.px), Math.round(avatar.py));
    const hiddenRegion = insideRegion?.name ?? null;

    this.drawFloorProps(world, view, hiddenRegion, clock);
    this.drawShadows(world, view, hiddenRegion);

    this.drawables.length = 0;
    this.collectObjects(world, view, hiddenRegion, clock);
    this.collectActors(world, avatar, view, hiddenRegion);

    this.drawables.sort((a, b) => a.depth - b.depth || a.tie - b.tie);
    for (const item of this.drawables) {
      ctx.drawImage(item.sprite.canvas, Math.round(item.sx), Math.round(item.sy));
    }

    this.drawBarks(world, view);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.lighting.render(
      ctx,
      camera,
      clock,
      this.collectLights(world, avatar, clock),
      pixelWidth,
      pixelHeight,
    );
  }

  // --- Sol ----------------------------------------------------------------

  /**
   * Sol et raccords.
   *
   * Chaque tuile recoit sa texture, puis les liserés des terrains voisins plus
   * « forts » qui debordent dessus. Sans cette seconde passe, le monde a
   * l'aspect d'un damier, et c'est ce qui trahit un prototype avant meme la
   * qualite du dessin.
   */
  private drawTerrain(world: World, view: TileRect): void {
    const ctx = this.ctx;
    for (let ty = view.y0; ty <= view.y1; ty++) {
      for (let tx = view.x0; tx <= view.x1; tx++) {
        if (!world.inBounds(tx, ty)) continue;
        const id = world.terrainAt(tx, ty);
        const frame = this.terrainFrame(id, tx, ty, world.terrainFrameAt(tx, ty));
        const { sx, sy } = this.camera.worldToScreen(tx, ty, 0);
        const dx = Math.round(sx - TILE_SIZE);
        const dy = Math.round(sy - TILE_SIZE);
        ctx.drawImage(getSprite(id, frame).canvas, dx, dy);

        for (const transition of transitionsAt(world, tx, ty)) {
          const sprite = getTransition(transition.terrain, transition.dir);
          if (sprite) ctx.drawImage(sprite.canvas, dx, dy);
        }

        // Bordure de trottoir sur le pourtour des surfaces pavees. Sans elle,
        // une place n'est qu'une tache de texture differente au milieu de
        // l'herbe ; avec elle, elle se lit comme un ouvrage delimite.
        if (id === 'stone') {
          for (const [dir, ox, oy] of KERB_SIDES) {
            if (world.terrainAt(tx + ox, ty + oy) === 'stone') continue;
            const kerb = getKerb(dir);
            if (kerb) ctx.drawImage(kerb.canvas, dx, dy);
          }
        }
      }
    }
  }

  /** L'eau ondule ; les autres terrains gardent leur variante fixe. */
  private terrainFrame(id: string, tx: number, ty: number, stored: number): number {
    if (id !== 'water') return stored;
    // Le dephasage par tuile fait courir la houle au lieu de faire clignoter
    // toute la surface d'un bloc.
    return Math.floor(this.time * 3 + (tx + ty) * 0.35) % 4;
  }

  // --- Revetements de sol ---------------------------------------------------

  /**
   * Objets plats : tapis, cailloux, touffes d'herbe.
   *
   * Ils sont dessines juste apres le terrain, hors du tri en profondeur, parce
   * qu'ils **font partie du sol** : rien ne passe dessous, tout passe dessus.
   *
   * Sans cette passe, un tapis masque le personnage qui marche dessus. La cle
   * de tri ne peut pas s'en sortir : elle donne une profondeur unique a l'objet
   * entier, calculee depuis son coin bas-droit, alors qu'un tapis de 3x2
   * s'etend sur six cases. Un garde debout sur le coin haut-gauche du tapis a
   * donc une profondeur inferieure de trois au tapis lui-meme, et se retrouve
   * dessous — c'est la limite connue du tri par cle, sur le cas ou elle se voit
   * le plus.
   *
   * Les ombres de contact viennent apres, ce qui est correct : l'ombre d'un
   * meuble doit tomber sur le tapis, pas dessous.
   */
  private drawFloorProps(
    world: World,
    view: TileRect,
    hiddenRegion: string | null,
    clock: GameClock,
  ): void {
    for (const obj of world.objectsInRect(view.x0, view.y0, view.x1, view.y1)) {
      if (!isFloorProp(obj)) continue;
      if (this.hiddenUnderRoof(world, obj.tx, obj.ty, hiddenRegion)) continue;
      const sprite = getSprite(obj.shapeId, this.objectFrame(obj, clock));
      const { sx, sy } = this.camera.worldToScreen(obj.tx, obj.ty, obj.tz);
      this.ctx.drawImage(
        sprite.canvas,
        Math.round(sx - sprite.width),
        Math.round(sy - sprite.height),
      );
    }
  }

  // --- Ombres portees ------------------------------------------------------

  /**
   * Ombres de contact.
   *
   * Ultima VII n'en avait pas — ses ombres etaient peintes dans les sprites.
   * Une tache sombre sous chaque objet coute presque rien et resout le defaut
   * le plus visible d'une vue de trois quarts : sans elle, les objets ont
   * l'air de flotter au-dessus du sol.
   */
  private drawShadows(world: World, view: TileRect, hiddenRegion: string | null): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = SHADOW;
    ctx.globalAlpha = 0.26;

    for (const obj of world.objectsInRect(view.x0, view.y0, view.x1, view.y1)) {
      const shape = obj.shape;
      if (shape.roof || shape.height < 1) continue;
      if (shape.roof && hiddenRegion) continue;
      if (this.hiddenUnderRoof(world, obj.tx, obj.ty, hiddenRegion)) continue;
      const [w] = shape.footprint;
      const { sx, sy } = this.camera.worldToScreen(obj.tx, obj.ty, obj.tz);
      this.shadowEllipse(sx, sy, w);
    }

    for (const actor of world.actors) {
      if (!actor.isAlive) continue;
      if (actor.px < view.x0 || actor.px > view.x1) continue;
      if (actor.py < view.y0 || actor.py > view.y1) continue;
      const ax = Math.round(actor.px);
      const ay = Math.round(actor.py);
      if (this.hiddenUnderRoof(world, ax, ay, hiddenRegion)) continue;
      const { sx, sy } = this.camera.worldToScreen(actor.px, actor.py, actor.tz);
      this.shadowEllipse(sx, sy, 1);
    }

    ctx.restore();
  }

  private shadowEllipse(sx: number, sy: number, footprint: number): void {
    const ctx = this.ctx;
    // Legerement decalee en bas a droite : la lumiere vient du haut a gauche,
    // comme dans tous les sprites.
    const cx = sx - TILE_SIZE / 2 + 1;
    const cy = sy - TILE_SIZE / 4 + 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, TILE_SIZE * 0.36 * footprint, TILE_SIZE * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Objets et acteurs ---------------------------------------------------

  /**
   * Frame effective d'un objet : animation en boucle si la shape en declare
   * une, et bascule jour/nuit pour les luminaires.
   */
  private objectFrame(obj: GameObject, clock: GameClock): number {
    const shape = obj.shape;

    if (shape.lightAtNight && !clock.isNight) return 1; // lanterne eteinte

    const anim = shape.anim;
    if (anim && obj.frame === anim.whenFrame) {
      // Le decalage par identifiant desynchronise les objets identiques :
      // deux atres dans la meme piece ne doivent pas crepiter a l'unisson.
      const index = Math.floor(this.time * anim.fps + obj.id) % anim.frames.length;
      return anim.frames[index]!;
    }

    return obj.frame;
  }

  private push(obj: GameObject, sprite: Sprite): void {
    const { sx, sy } = this.camera.worldToScreen(obj.tx, obj.ty, obj.tz);
    const [w, h] = obj.shape.footprint;

    // Profondeur : distance diagonale a la camera, puis hauteur.
    // Les toits sont un cas a part : ils sont poses en hauteur et decales de
    // deux tuiles pour retomber sur les murs, donc leur profondeur doit etre
    // calculee depuis la tuile qu'ils recouvrent visuellement, sinon ils
    // passeraient devant tout ce qui se trouve au sud du batiment.
    const depth = obj.shape.roof
      ? obj.tx - obj.tz / 2 + (obj.ty - obj.tz / 2) + 0.4
      : obj.tx + obj.ty + obj.tz * 0.5;

    this.drawables.push({
      sprite,
      sx: sx - sprite.width,
      sy: sy - sprite.height,
      depth,
      // A profondeur egale, les grandes emprises (sols, lits) passent dessous.
      tie: -(w * h) * 100 + obj.id * 1e-4,
    });
  }

  /**
   * L'element est-il sous un toit qu'on ne traverse pas du regard ?
   *
   * Sans cette regle, tout ce qui depasse d'une tuile a l'interieur d'une
   * maison — la flamme d'un atre, une plante, une cheminee — transperce la
   * toiture vue de l'exterieur. La cle de tri en profondeur ne peut pas
   * resoudre le cas : ces objets sont bel et bien plus au nord que les tuiles
   * de toit qui devraient les masquer.
   *
   * On ne teste que l'interieur strict de la region : murs et portes
   * appartiennent a l'enveloppe du batiment et restent visibles.
   */
  private hiddenUnderRoof(
    world: World,
    tx: number,
    ty: number,
    hiddenRegion: string | null,
  ): boolean {
    const region = world.regionAt(tx, ty);
    if (!region || region.name === hiddenRegion) return false;
    // Le masque du batiment, et non sa boite englobante : sur un plan en L,
    // le creux du L est dehors et doit rester visible.
    return world.isBuildingInterior(region, tx, ty);
  }

  private collectObjects(
    world: World,
    view: TileRect,
    hiddenRegion: string | null,
    clock: GameClock,
  ): void {
    for (const obj of world.objectsInRect(view.x0, view.y0, view.x1, view.y1)) {
      if (obj.shape.roof) {
        // Chaque tuile de toit porte le nom de son batiment : c'est ainsi
        // qu'on fait disparaitre le bon toit quand l'Avatar franchit une porte.
        if (hiddenRegion && obj.customName === hiddenRegion) continue;
        this.push(obj, getSprite(obj.shapeId, this.objectFrame(obj, clock)));
        continue;
      }
      // Les revetements de sol ont deja ete dessines avec le terrain.
      if (isFloorProp(obj)) continue;
      if (this.hiddenUnderRoof(world, obj.tx, obj.ty, hiddenRegion)) continue;
      this.push(obj, getSprite(obj.shapeId, this.objectFrame(obj, clock)));
    }
  }

  private collectActors(
    world: World,
    avatar: Actor,
    view: TileRect,
    hiddenRegion: string | null,
  ): void {
    for (const actor of world.actors) {
      if (!actor.isAlive) continue;
      if (actor.px < view.x0 || actor.px > view.x1 || actor.py < view.y0 || actor.py > view.y1) {
        continue;
      }
      // Un personnage enferme dans une maison ne doit pas apparaitre
      // par-dessus le toit.
      if (
        actor !== avatar &&
        this.hiddenUnderRoof(world, Math.round(actor.px), Math.round(actor.py), hiddenRegion)
      ) {
        continue;
      }
      const sprite = getSprite(actor.shapeId, actor.spriteFrame);
      // Les acteurs se deplacent en continu : on interpole leur position ecran
      // plutot que de la caler sur la grille, sinon la marche est saccadee.
      const { sx, sy } = this.camera.worldToScreen(actor.px, actor.py, actor.tz);
      this.drawables.push({
        sprite,
        sx: sx - sprite.width,
        sy: sy - sprite.height,
        depth: actor.px + actor.py + actor.tz * 0.5 + 0.01,
        tie: actor === avatar ? 1 : 0,
      });
    }
  }

  /** Bulles de dialogue, dessinees apres les sprites mais avant la lumiere. */
  private drawBarks(world: World, view: TileRect): void {
    const ctx = this.ctx;
    ctx.font = '7px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (const actor of world.actors) {
      if (!actor.barkText || actor.barkTimer <= 0) continue;
      if (actor.px < view.x0 || actor.px > view.x1 || actor.py < view.y0 || actor.py > view.y1) {
        continue;
      }
      const { sx, sy } = this.camera.worldToScreen(actor.px, actor.py, actor.tz);
      const x = sx - TILE_SIZE / 2;
      const y = sy - 32;
      const width = ctx.measureText(actor.barkText).width + 6;
      ctx.fillStyle = 'rgba(12, 10, 8, 0.82)';
      ctx.fillRect(x - width / 2, y - 8, width, 11);
      ctx.fillStyle = '#e8dcc0';
      ctx.fillText(actor.barkText, x, y);
    }
    ctx.textAlign = 'left';
  }

  /** Rassemble les sources de lumiere visibles. */
  private collectLights(world: World, avatar: Actor, clock: GameClock): LightSource[] {
    const lights: LightSource[] = [];
    const view = this.camera.visibleTileRect(4);

    for (const obj of world.objectsInRect(view.x0, view.y0, view.x1, view.y1)) {
      const radius = obj.shape.light ?? 0;
      if (radius <= 0) continue;
      if (obj.shape.lightAtNight && !clock.isNight) continue;
      if (obj.shapeId === 'hearth' && obj.frame === 3) continue; // feu couvert
      // Legere respiration des flammes : la lueur ne doit pas etre figee.
      const flicker = obj.shape.anim ? 1 + Math.sin(this.time * 7 + obj.id) * 0.06 : 1;
      lights.push({ x: obj.tx, y: obj.ty, radius: radius * flicker });
    }

    // Torche allumee dans l'inventaire de l'Avatar : c'est tout l'interet d'en
    // porter une, donc elle eclaire nettement plus que le halo de base.
    const torch = avatar.findItem('torch');
    if (torch && torch.quality === 1) {
      lights.push({ x: avatar.px, y: avatar.py, radius: 5.5, intensity: 0.92 });
    }
    // Sort de lumiere : une lueur froide, plus large qu'une torche et sans
    // vacillement — c'est ce qui la distingue d'une flamme au premier coup
    // d'oeil, sans qu'aucun texte n'ait a le dire.
    if (this.halo > 0) {
      lights.push({ x: avatar.px, y: avatar.py, radius: this.halo, intensity: 0.95 });
    }
    // Halo minimal autour du joueur, pour rester jouable de nuit sans torche.
    lights.push({ x: avatar.px, y: avatar.py, radius: 2.2, intensity: 0.3 });

    return lights;
  }
}

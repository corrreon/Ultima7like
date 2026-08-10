import { TILE_SIZE } from '../core/constants';
import type { GameClock } from '../core/clock';
import type { Actor } from '../objects/actor';
import type { GameObject } from '../objects/gameobject';
import type { World } from '../world/world';
import { getSprite } from './art';
import { Camera } from './camera';
import { Lighting, type LightSource } from './lighting';

interface Drawable {
  sprite: ReturnType<typeof getSprite>;
  sx: number;
  sy: number;
  depth: number;
  tie: number;
}

/**
 * Rendu de la scene.
 *
 * L'ordre de dessin est le vrai sujet d'un moteur comme celui-ci. Exult resout
 * le probleme par une comparaison topologique entre boites englobantes, ce qui
 * est exact mais couteux ; on utilise ici une cle de tri suffisante dans la
 * quasi-totalite des cas : on dessine du plus « loin » (au nord-ouest) au plus
 * « pres », puis du plus bas au plus haut. Les artefacts residuels apparaissent
 * surtout entre objets tres larges et tres proches — c'est le point a reprendre
 * si l'on veut la rigueur d'Exult.
 */
export class Renderer {
  readonly camera = new Camera();
  private readonly lighting = new Lighting();
  private readonly drawables: Drawable[] = [];

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(world: World, avatar: Actor, clock: GameClock, pixelWidth: number, pixelHeight: number): void {
    const ctx = this.ctx;
    const camera = this.camera;
    camera.setViewport(pixelWidth, pixelHeight);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0a08';
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    ctx.scale(camera.zoom, camera.zoom);

    const view = camera.visibleTileRect();
    this.drawTerrain(world, view);

    // Les toits disparaissent des que l'Avatar entre dans le batiment : sans
    // cela on ne verrait jamais l'interieur, puisque la camera est fixe.
    const insideRegion = world.regionAt(Math.round(avatar.px), Math.round(avatar.py));

    this.drawables.length = 0;
    this.collectObjects(world, view, insideRegion?.name ?? null);
    this.collectActors(world, avatar, view);

    this.drawables.sort((a, b) => a.depth - b.depth || a.tie - b.tie);
    for (const item of this.drawables) {
      ctx.drawImage(item.sprite.canvas, Math.round(item.sx), Math.round(item.sy));
    }

    this.drawBarks(world, view);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.lighting.render(ctx, camera, clock, this.collectLights(world, avatar, clock), pixelWidth, pixelHeight);
  }

  private drawTerrain(world: World, view: { x0: number; y0: number; x1: number; y1: number }): void {
    const ctx = this.ctx;
    for (let ty = view.y0; ty <= view.y1; ty++) {
      for (let tx = view.x0; tx <= view.x1; tx++) {
        if (!world.inBounds(tx, ty)) continue;
        const sprite = getSprite(world.terrainAt(tx, ty), world.terrainFrameAt(tx, ty));
        const { sx, sy } = this.camera.worldToScreen(tx, ty, 0);
        ctx.drawImage(sprite.canvas, Math.round(sx - TILE_SIZE), Math.round(sy - TILE_SIZE));
      }
    }
  }

  private push(obj: GameObject, sprite: ReturnType<typeof getSprite>): void {
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

  private collectObjects(
    world: World,
    view: { x0: number; y0: number; x1: number; y1: number },
    hiddenRegion: string | null,
  ): void {
    for (const obj of world.objectsInRect(view.x0, view.y0, view.x1, view.y1)) {
      // Chaque tuile de toit porte le nom de son batiment : c'est ainsi qu'on
      // fait disparaitre le bon toit quand l'Avatar franchit une porte.
      if (obj.shape.roof && hiddenRegion && obj.customName === hiddenRegion) continue;
      this.push(obj, getSprite(obj.shapeId, obj.frame));
    }
  }

  private collectActors(
    world: World,
    avatar: Actor,
    view: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    for (const actor of world.actors) {
      if (!actor.isAlive) continue;
      if (actor.px < view.x0 || actor.px > view.x1 || actor.py < view.y0 || actor.py > view.y1) {
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
  private drawBarks(world: World, view: { x0: number; y0: number; x1: number; y1: number }): void {
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
      const y = sy - 30;
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
      if (obj.shapeId === 'hearth' && obj.frame === 1) continue; // feu couvert
      lights.push({ x: obj.tx, y: obj.ty, radius });
    }

    // Torche allumee dans l'inventaire de l'Avatar : c'est tout l'interet d'en
    // porter une, donc elle eclaire nettement plus que le halo de base.
    const torch = avatar.findItem('torch');
    if (torch && torch.quality === 1) {
      lights.push({ x: avatar.px, y: avatar.py, radius: 5.5, intensity: 0.92 });
    }
    // Halo minimal autour du joueur, pour rester jouable de nuit sans torche.
    lights.push({ x: avatar.px, y: avatar.py, radius: 2.2, intensity: 0.3 });

    return lights;
  }
}

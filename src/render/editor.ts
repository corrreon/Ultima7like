import type { World } from '../world/world';
import type { Camera } from './camera';
import { TILE_SIZE } from '../core/constants';

/**
 * Calque d'edition de carte.
 *
 * Ce qui coute cher quand on ajoute un batiment n'est pas de dessiner son plan
 * — c'est de trouver ou le poser. Les origines s'ecrivent en dur, on les
 * calcule de tete, et un chevauchement ne se voit qu'en cherchant sur place
 * pourquoi une piece n'a plus de porte.
 *
 * Le calque montre les trois choses qui manquent : **l'emprise de chaque
 * batiment**, **son origine**, et **ce que la validation reproche a la carte**.
 * On saisit un batiment a la souris, on le pose ailleurs, la carte se
 * reconstruit, et les problemes s'affichent en direct.
 *
 * Il ne modifie pas les plans : il pose un calque de deplacements par-dessus
 * (voir `deplacerPlan`). Une session se termine en recopiant les origines dans
 * `plans.ts` — c'est un editeur d'implantation, pas un remplacant du fichier.
 */

const OR = '#e8c46a';
const ROUGE = '#e2584c';
const OMBRE = 'rgba(12, 10, 8, 0.75)';

export interface EtatEditeur {
  actif: boolean;
  /** Batiment saisi, s'il y en a un. */
  saisi: string | null;
  /** Tuile sous le curseur, pour l'affichage. */
  curseur: { tx: number; ty: number } | null;
  /** Ce que la validation reproche a la carte en cours. */
  problemes: string[];
}

/** Le batiment dont l'emprise contient cette tuile, s'il y en a un. */
export function batimentA(world: World, tx: number, ty: number): string | null {
  for (const region of world.regions) {
    if (tx < region.x0 || tx > region.x1 || ty < region.y0 || ty > region.y1) continue;
    return region.name;
  }
  return null;
}

/**
 * Dessine le calque.
 *
 * Appele apres la scene et avant l'eclairage : le calque doit rester lisible de
 * nuit, ce qui ne serait pas le cas s'il passait sous le voile.
 */
export function dessinerEditeur(
  ctx: CanvasRenderingContext2D,
  world: World,
  camera: Camera,
  etat: EtatEditeur,
  uiScale: number,
  largeur: number,
  hauteur: number,
): void {
  if (!etat.actif) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.lineWidth = 1 / camera.zoom;
  ctx.font = '7px ui-monospace, monospace';
  ctx.textAlign = 'left';

  for (const region of world.regions) {
    // Le coin haut-gauche de l'emprise. `worldToScreen` vise le coin bas-droit
    // d'une tuile : on remonte donc d'une tuile pour cerner la region entiere.
    const a = camera.worldToScreen(region.x0, region.y0, 0);
    const b = camera.worldToScreen(region.x1, region.y1, 0);
    const x = a.sx - TILE_SIZE;
    const y = a.sy - TILE_SIZE;
    const w = b.sx - x;
    const h = b.sy - y;
    if (x > largeur / camera.zoom || y > hauteur / camera.zoom || x + w < 0 || y + h < 0) continue;

    const choisi = region.name === etat.saisi;
    ctx.strokeStyle = choisi ? OR : 'rgba(232, 196, 106, 0.45)';
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));

    // Nom et origine, sur un fond opaque : un texte pose sur une toiture claire
    // devient illisible des qu'on s'eloigne.
    const etiquette = `${region.name}  ${region.x0},${region.y0}`;
    const l = ctx.measureText(etiquette).width + 4;
    ctx.fillStyle = OMBRE;
    ctx.fillRect(Math.round(x), Math.round(y) - 9, l, 9);
    ctx.fillStyle = choisi ? OR : '#d8cdb4';
    ctx.fillText(etiquette, Math.round(x) + 2, Math.round(y) - 2);
  }

  ctx.restore();

  // Bandeau : le mode, la tuile visee, et les reproches de la validation.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(uiScale, uiScale);
  ctx.font = '8px ui-monospace, monospace';
  ctx.textAlign = 'left';

  const lignes = [
    'EDITEUR — clic : saisir · fleches : deplacer · F2 : quitter'
    + (etat.curseur ? `  ·  tuile ${etat.curseur.tx},${etat.curseur.ty}` : ''),
    etat.saisi ? `saisi : ${etat.saisi}` : 'aucun batiment saisi',
    ...(etat.problemes.length > 0
      ? etat.problemes.slice(0, 4)
      : ['carte valide']),
  ];

  const largeurUi = largeur / uiScale;
  ctx.fillStyle = OMBRE;
  ctx.fillRect(0, 0, largeurUi, 12 * lignes.length + 6);
  for (const [i, ligne] of lignes.entries()) {
    ctx.fillStyle = i >= 2 && etat.problemes.length > 0 ? ROUGE : '#e8e0cc';
    ctx.fillText(ligne, 6, 14 + i * 12);
  }
  ctx.restore();
}

import { describe, expect, it } from 'vitest';
import { contentBounds, insetRect, isKeyColor, keyOutBackground } from '../src/render/atlas';

/** Fabrique une cellule remplie de magenta, avec un rectangle opaque dedans. */
function cell(
  width: number,
  height: number,
  box?: { x: number; y: number; w: number; h: number },
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 0;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  if (box) {
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) {
        const i = (y * width + x) * 4;
        data[i] = 90;
        data[i + 1] = 70;
        data[i + 2] = 40;
        data[i + 3] = 255;
      }
    }
  }
  return data;
}

describe('detourage des planches', () => {
  it('reconnait le magenta de fond, avec tolerance', () => {
    expect(isKeyColor(255, 0, 255)).toBe(true);
    // Compression et redimensionnement font deriver la teinte : la tolerance
    // evite de laisser une frange autour de chaque objet.
    expect(isKeyColor(248, 20, 240)).toBe(true);
    // Une couleur d'objet ne doit jamais etre prise pour du fond.
    expect(isKeyColor(150, 40, 140)).toBe(false);
    expect(isKeyColor(90, 70, 40)).toBe(false);
  });

  it('absorbe un fond qui derive vers un rose plus clair', () => {
    // Cas observe sur une planche generee : une cellule sur deux tire vers un
    // rose franchement plus clair, hors de portee d'une simple tolerance.
    expect(isKeyColor(240, 80, 240)).toBe(true);
    expect(isKeyColor(238, 68, 238)).toBe(true);
  });

  it('epargne les couleurs saturees des dessins', () => {
    expect(isKeyColor(160, 32, 48)).toBe(false); // cramoisi
    expect(isKeyColor(230, 190, 60)).toBe(false); // or
    expect(isKeyColor(128, 64, 160)).toBe(false); // violet
    expect(isKeyColor(48, 72, 160)).toBe(false); // bleu roi
    expect(isKeyColor(232, 176, 144)).toBe(false); // carnation
  });

  it('retire le bord de la cellule avant de chercher le contenu', () => {
    // Les traits de grille survivent souvent a la consigne qui les interdit.
    expect(insetRect(100, 100, 0.02)).toEqual({ x: 2, y: 2, width: 96, height: 96 });
    // Une planche propre peut demander la cellule entiere.
    expect(insetRect(100, 100, 0)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    // Une marge absurde ne doit pas produire une cellule vide.
    expect(insetRect(40, 40, 5).width).toBeGreaterThan(0);
  });

  it('ignore un trait de grille qui longe la cellule', () => {
    const data = cell(64, 64, { x: 20, y: 20, w: 10, h: 10 });
    // Trait noir sur la premiere colonne, comme sur les planches generees.
    for (let y = 0; y < 64; y++) {
      const i = y * 64 * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
    // Sans retrait, le cadre part du trait et englobe toute la hauteur.
    expect(contentBounds(data, 64, 64)).toEqual({ x: 0, y: 0, width: 30, height: 64 });

    // Avec retrait, on retrouve l'objet seul. Les coordonnees sont relatives
    // au rectangle interieur, ce qui est exactement ce que decoupe loadSheet.
    const inner = insetRect(64, 64, 0.05);
    const cropped = new Uint8ClampedArray(inner.width * inner.height * 4);
    for (let y = 0; y < inner.height; y++) {
      for (let x = 0; x < inner.width; x++) {
        const from = ((y + inner.y) * 64 + (x + inner.x)) * 4;
        const to = (y * inner.width + x) * 4;
        for (let c = 0; c < 4; c++) cropped[to + c] = data[from + c] ?? 0;
      }
    }
    expect(contentBounds(cropped, inner.width, inner.height)).toEqual({
      x: 20 - inner.x,
      y: 20 - inner.y,
      width: 10,
      height: 10,
    });
  });

  it('recadre sur le contenu reel de la cellule', () => {
    // Les modeles d'image ne centrent pas au pixel pres : le recadrage est ce
    // qui permet d'ancrer correctement le sprite malgre des marges inegales.
    const data = cell(64, 64, { x: 10, y: 20, w: 30, h: 15 });
    expect(contentBounds(data, 64, 64)).toEqual({ x: 10, y: 20, width: 30, height: 15 });
  });

  it('retourne null pour une cellule vide', () => {
    expect(contentBounds(cell(32, 32), 32, 32)).toBeNull();
  });

  it('ignore les pixels deja transparents', () => {
    const data = cell(16, 16, { x: 4, y: 4, w: 4, h: 4 });
    // On efface la moitie du rectangle en le rendant transparent.
    for (let y = 4; y < 6; y++) {
      for (let x = 4; x < 8; x++) data[(y * 16 + x) * 4 + 3] = 0;
    }
    expect(contentBounds(data, 16, 16)).toEqual({ x: 4, y: 6, width: 4, height: 2 });
  });

  it('rend le fond transparent sans toucher a l\'objet', () => {
    const data = cell(8, 8, { x: 2, y: 2, w: 3, h: 3 });
    keyOutBackground(data);

    // Un pixel de fond est devenu transparent.
    expect(data[3]).toBe(0);
    // Un pixel de l'objet est intact.
    const inside = (2 * 8 + 2) * 4;
    expect(data[inside + 3]).toBe(255);
    expect(data[inside]).toBe(90);
  });
});

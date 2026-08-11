import { describe, expect, it } from 'vitest';
import { SHEETS } from '../src/data/sheets';
import { getShape, hasShape } from '../src/world/shapes';

/**
 * Les declarations de planches sont du texte libre : rien, a l'execution, ne
 * signale une erreur. `overrideSprite` accepte un identifiant inconnu et cree
 * une entree que personne ne lira jamais — le dessin est simplement absent du
 * jeu, sans un mot. D'ou ces verifications.
 */
describe('declarations de planches', () => {
  const toutes = SHEETS.flatMap((sheet) => sheet.entries.map((entry) => ({ sheet, entry })));
  // Un portrait ne fait pas partie des frames d'une shape : il n'y en a qu'un,
  // et il ne suit pas la regle du « toutes les frames ou aucune ».
  const entries = toutes.filter(({ entry }) => !entry.portrait);

  it('ne vise que des shapes existantes', () => {
    for (const { entry } of toutes) {
      expect(hasShape(entry.shape), `shape inconnue : ${entry.shape}`).toBe(true);
    }
  });

  it('ne vise que des frames et des cellules qui existent', () => {
    for (const { sheet, entry } of entries) {
      const frame = entry.frame ?? 0;
      expect(frame, `${entry.shape} frame ${frame}`).toBeLessThan(getShape(entry.shape).frames);
      expect(entry.cell, `${sheet.url} cellule ${entry.cell}`).toBeLessThan(
        sheet.columns * sheet.rows,
      );
      expect(entry.tilesWide).toBeGreaterThan(0);
    }
  });

  it('ne declare pas deux fois la meme frame', () => {
    const seen = new Set<string>();
    for (const { entry } of entries) {
      const key = `${entry.shape}#${entry.frame ?? 0}`;
      expect(seen.has(key), `${key} declaree deux fois`).toBe(false);
      seen.add(key);
    }
  });

  it('couvre toutes les frames des shapes qu\'elle touche, ou aucune', () => {
    // Une frame peinte a cote d'une frame procédurale se voit immediatement.
    // L'atre fait exception et n'est volontairement pas dans les planches : il
    // est anime, une image fixe le figerait.
    //
    // Les frames listees ici ne sont jamais posees dans le monde : leur dessin
    // n'apparait a l'ecran dans aucune situation, il n'y a donc rien a
    // remplacer. Le jour ou l'une d'elles sert, elle sort de cette liste et le
    // test redemande une planche.
    const jamaisPosees: Record<string, number> = {
      sconce: 1, // applique eteinte : rien, dans le jeu, n'eteint une applique
    };

    const byShape = new Map<string, Set<number>>();
    for (const { entry } of entries) {
      const frames = byShape.get(entry.shape) ?? new Set<number>();
      frames.add(entry.frame ?? 0);
      byShape.set(entry.shape, frames);
    }
    for (const [shape, frames] of byShape) {
      const dispensees = shape in jamaisPosees ? 1 : 0;
      expect(frames.size + dispensees, `${shape} : frames partiellement remplacees`).toBe(
        getShape(shape).frames,
      );
      const dispensee = jamaisPosees[shape];
      if (dispensee !== undefined) {
        expect(frames.has(dispensee), `${shape} frame ${dispensee} : dispense inutile`).toBe(false);
      }
    }
  });
});

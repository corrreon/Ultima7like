#!/usr/bin/env node
/**
 * Prepare une planche de dessins pour `public/sheets/`.
 *
 *   npm i --no-save sharp
 *   node tools/detourer-planches.mjs source.jpg=mobilier ... --out public/sheets
 *
 * Les modeles d'image rendent des JPEG surechantillonnes : 2048 px de cote
 * pour un dessin dont le pixel d'origine fait une dizaine de pixels, et une
 * compression qui laisse un halo de teintes intermediaires autour de chaque
 * objet. Poser ce fichier tel quel donne un depot lourd et une frange rose
 * autour des sprites.
 *
 * Ce script fait donc trois choses, dans cet ordre :
 *
 * 1. **Efface le bord des cellules.** C'est la que vivent les traits de grille
 *    que les modeles dessinent malgre la consigne. `--marge 0` pour une
 *    planche dont les dessins touchent le bord.
 *
 * 2. **Detoure par remplissage depuis le bord de chaque cellule**, et non par
 *    un seuil sur la couleur. Le fond est connexe et entoure l'objet ; le
 *    halo de compression qui le borde l'est aussi. Aucun seuil sur la couleur
 *    seule ne distingue proprement ce halo d'un pixel de dessin, un
 *    remplissage si. Une seconde passe, globale, emporte les creux fermes —
 *    dossier de chaise, anneau de clef, rayons de roue — que le remplissage ne
 *    peut pas atteindre ; elle est sans risque tant qu'aucun dessin n'emploie
 *    de magenta.
 *
 * 3. **Reduit a 512 px** avec un filtre moyenneur, puis seuille l'alpha. Le
 *    moyennage efface le bruit de compression, le seuil rend au pixel art ses
 *    bords francs. On garde environ cinq fois la resolution dont le jeu a
 *    besoin, de quoi voir venir.
 *
 * Le resultat est un PNG deja detoure : le chargeur du jeu accepte aussi bien
 * un fond magenta qu'un fond transparent.
 */
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (nom, defaut) => {
  const i = args.indexOf('--' + nom);
  return i < 0 ? defaut : args[i + 1];
};
const sortie = opt('out', 'public/sheets');
const marge = Number(opt('marge', 0.02));
const cible = Number(opt('taille', 512));
const colonnes = Number(opt('colonnes', 3));
const lignes = Number(opt('lignes', 3));
const paires = args.filter((a) => a.includes('=') && !a.startsWith('--'));

if (paires.length === 0) {
  console.error('usage : node tools/detourer-planches.mjs source.jpg=nom [...] [--marge 0.02] [--out public/sheets]');
  process.exit(1);
}

/** Magenta au sens large : ce qui reste du fond apres compression. */
const fond = (d, i) =>
  d[i] > 140 && d[i + 2] > 140 && d[i + 1] < d[i] - 40 && d[i + 1] < d[i + 2] - 40;

for (const paire of paires) {
  const [source, nom] = paire.split('=');
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const cw = Math.floor(W / colonnes);
  const ch = Math.floor(info.height / lignes);
  const inset = Math.floor(Math.min(cw, ch) * marge);

  for (let cell = 0; cell < colonnes * lignes; cell++) {
    const x0 = (cell % colonnes) * cw;
    const y0 = Math.floor(cell / colonnes) * ch;
    const ax = x0 + inset;
    const ay = y0 + inset;
    const bx = x0 + cw - inset;
    const by = y0 + ch - inset;

    for (let y = y0; y < y0 + ch; y++)
      for (let x = x0; x < x0 + cw; x++)
        if (x < ax || x >= bx || y < ay || y >= by) data[(y * W + x) * 4 + 3] = 0;

    const pile = [];
    const vus = new Uint8Array(cw * ch);
    const empiler = (x, y) => {
      if (x < ax || x >= bx || y < ay || y >= by) return;
      const k = (y - y0) * cw + (x - x0);
      if (vus[k]) return;
      if (!fond(data, (y * W + x) * 4)) return;
      vus[k] = 1;
      pile.push(x, y);
    };
    for (let x = ax; x < bx; x++) { empiler(x, ay); empiler(x, by - 1); }
    for (let y = ay; y < by; y++) { empiler(ax, y); empiler(bx - 1, y); }
    while (pile.length) {
      const y = pile.pop();
      const x = pile.pop();
      data[(y * W + x) * 4 + 3] = 0;
      empiler(x + 1, y); empiler(x - 1, y); empiler(x, y + 1); empiler(x, y - 1);
    }

    for (let y = ay; y < by; y++)
      for (let x = ax; x < bx; x++) {
        const i = (y * W + x) * 4;
        if (data[i + 3] !== 0 && fond(data, i)) data[i + 3] = 0;
      }
  }

  const reduit = await sharp(data, { raw: { width: W, height: info.height, channels: 4 } })
    .resize(cible, cible, { kernel: 'mitchell' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let p = 3; p < reduit.data.length; p += 4) reduit.data[p] = reduit.data[p] < 128 ? 0 : 255;

  const fichier = `${sortie}/${nom}.png`;
  const { size } = await sharp(reduit.data, {
    raw: { width: reduit.info.width, height: reduit.info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, palette: true })
    .toFile(fichier);
  console.log(`${fichier} — ${(size / 1024).toFixed(0)} Ko`);
}

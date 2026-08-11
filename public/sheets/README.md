# Planches de dessins

Déposez ici les planches PNG, puis déclarez leurs cellules dans
`src/data/sheets.ts`.

## Convention

Grille régulière, un objet par cellule, fond magenta `#FF00FF`.

Le chargeur recadre chaque cellule sur son contenu réel, retire le fond, puis
met à l'échelle du jeu — vous n'avez donc à centrer ni à détourer quoi que ce
soit. `tilesWide` donne la largeur voulue en tuiles ; la hauteur suit le
rapport d'aspect du dessin.

Une planche absente ou illisible n'empêche pas de jouer : le moteur garde ses
sprites générés par code et se contente d'un avertissement dans la console.

## Les planches

Elles sont là, déclarées dans `src/data/sheets.ts`, et couvrent 63 sprites.
Une planche absente ou illisible n'empêcherait pas de jouer : la console
signalerait la planche manquante et le jeu garderait ses sprites générés.

| Fichier | Contenu |
| --- | --- |
| `portraits.png` | 9 portraits de dialogue, plein cadre sur fond sombre |
| `avatar.png` | l'Avatar : dos, dos en pas, face, face en pas, profil est, profil est en pas |
| `mobilier.png` | chaise, tabouret, table, table de banquet, lit, lit à baldaquin, bibliothèque, buffet, tapis |
| `contenants.png` | coffre fermé, coffre ouvert, tonneau, caisse, sac de grain, panier, jarre, sacoche, étagère |
| `nourriture.png` | pain, fromage, jambon, poulet rôti, pomme, chope, bouteille, couvert, marmite |
| `armes.png` | épée courte, épée longue, dague, hache, marteau, écu rond, écu en amande, heaume, arc |
| `outils.png` | enclume, soufflet, marteau de forge, scie, pelle, fourche, faux, établi, meule |
| `lumiere.png` | réverbère, applique, bougeoir, lampe à huile, brasero, torche, âtre, chaudron, bougie |
| `exterieur.png` | puits, charrette, barrière, portail, abreuvoir, botte de foin, rondins, souche, seau |
| `vegetation.png` | champignons, touffe, fleurs, buisson, plante en pot, caillou, branche, ruche, herbes |
| `precieux.png` | pièces, lingot, gemme, bague, amulette, clef, parchemin, livre, luth |

L'ordre est celui de la lecture, ligne par ligne : c'est lui qui donne l'index
`cell`. Les cases sans shape correspondante restent inutilisées, sans dommage.

## D'une image générée au fichier posé ici

Ces PNG ne sont pas les images d'origine. Un modèle rend un JPEG de 2048 px de
côté pour un dessin dont le pixel d'origine fait une dizaine de pixels, avec
une compression qui laisse un halo de teintes intermédiaires autour de chaque
objet — posé tel quel, cela fait 18 Mo et une frange rose autour de chaque
sprite. `tools/detourer-planches.mjs` fait la préparation :

```sh
npm i --no-save sharp
node tools/detourer-planches.mjs source.jpg=mobilier --marge 0
```

Il efface le bord des cellules, détoure par remplissage depuis ce bord plutôt
que par un seuil sur la couleur — c'est ce qui emporte le halo de compression,
qu'aucun seuil ne distingue proprement d'un pixel de dessin — puis réduit à
512 px et seuille l'alpha pour rendre au pixel art ses bords francs. Les neuf
planches pèsent 456 Ko en tout.

Le résultat est **déjà détouré** : le fond y est transparent, pas magenta. Le
chargeur accepte les deux, la convention magenta reste celle des sources.

## Vérifier la plomberie avant de dessiner

`_test.png` est une planche synthétique de 3×3 rectangles colorés, décentrés
exprès. Déclarez-la dans `src/data/sheets.ts` et lancez le jeu : si les
rectangles remplacent le mobilier de la taverne, le pipeline fonctionne et le
problème éventuel viendra de votre planche, pas du code.

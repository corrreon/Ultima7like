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

## Fichiers attendus

`src/data/sheets.ts` déclare déjà neuf planches. Tant que le PNG n'est pas là,
la console signale la planche manquante et le jeu garde ses sprites générés.

| Fichier | Contenu |
| --- | --- |
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

## Vérifier la plomberie avant de dessiner

`_test.png` est une planche synthétique de 3×3 rectangles colorés, décentrés
exprès. Déclarez-la dans `src/data/sheets.ts` et lancez le jeu : si les
rectangles remplacent le mobilier de la taverne, le pipeline fonctionne et le
problème éventuel viendra de votre planche, pas du code.

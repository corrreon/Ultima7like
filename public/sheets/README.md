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

## Vérifier la plomberie avant de dessiner

`_test.png` est une planche synthétique de 3×3 rectangles colorés, décentrés
exprès. Déclarez-la dans `src/data/sheets.ts` et lancez le jeu : si les
rectangles remplacent le mobilier de la taverne, le pipeline fonctionne et le
problème éventuel viendra de votre planche, pas du code.

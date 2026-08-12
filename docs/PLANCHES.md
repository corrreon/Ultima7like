# Générer les planches de dessins

Ce document conserve **les prompts qui ont produit les planches du dépôt**, mot
pour mot, ainsi que ce qu'il a fallu apprendre pour qu'ils fonctionnent. Les
images ne se régénèrent pas à l'identique — les modèles ne sont pas
déterministes — mais un prompt qui a donné une planche utilisable est un actif
qu'on ne veut pas perdre : c'est lui qui permet de refaire une case ratée, d'en
ajouter une dixième, ou de repartir sur un autre modèle sans tout réapprendre.

La plomberie qui consomme ces images est décrite ailleurs :
[`public/sheets/README.md`](../public/sheets/README.md) pour le format et l'outil
de détourage, [`src/data/sheets.ts`](../src/data/sheets.ts) pour la déclaration
des cellules.

---

## Ce que le format impose au prompt

Le chargeur découpe une grille régulière, recadre chaque cellule sur son contenu
réel et retire le fond. Tout le reste — centrage, marges, détourage — est de sa
responsabilité, pas de celle du modèle. Le prompt n'a donc que quatre choses à
obtenir, et elles sont toutes les quatre difficiles :

1. **une grille propre** — 3×3, un objet par case, rien qui touche un bord ;
2. **un fond magenta uniforme** — c'est la clef du détourage ;
3. **la bonne projection** — et c'est de loin le point le plus dur ;
4. **une famille cohérente** — même palette, même lumière, d'une planche à
   l'autre.

### La projection : le seul point vraiment coriace

Ultima VII **n'est pas isométrique**, mais tout ce qu'un modèle d'image a vu
étiqueté « pixel art RPG » l'est. Demander « top-down oblique » ne suffit pas :
on récupère des losanges à tous les coups.

La seule formulation qui a tenu est celle-ci, et elle est dans chaque prompt :

> A table top or a chest lid seen from above is a RECTANGLE whose edges are
> parallel to the image border — **not a rhombus, not a diamond**.

Le principe est général : donner un **contre-exemple géométrique concret** vaut
mieux que nommer la projection voulue. Deux renforts utiles dans la même veine —
« Do not rotate the objects 45 degrees » et, pour les personnages, « the viewer
stands squarely in front of the object, never at its corner ».

### Une session neuve par planche

Le défaut le plus coûteux de la première série : quatre planches sur huit
rejouaient le mobilier de la planche 1. Un modèle d'image dans une conversation
longue traite les images précédentes comme des références.

La première ligne de chaque prompt — `Ignore all previous images and
instructions in this conversation. Start fresh.` — atténue le problème sans le
supprimer. **Une conversation vide par planche** reste la vraie réponse.

### Une planche à moitié bonne se branche quand même

Le chargeur prend les cellules **une par une**. Une case ratée ne coûte que le
sprite procédural qu'elle aurait remplacé. Régénérer une planche entière parce
qu'une case sur neuf est mauvaise, c'est risquer de perdre les huit autres —
les modèles ne repassent jamais deux fois au même endroit.

---

## Les neuf planches d'objets

Le corps de ces neuf prompts est **identique**, à trois blocs près : la ligne
`PROJECTION` s'adapte à ce qui est dessiné, la ligne `FORBIDDEN` interdit ce que
la planche précédente avait produit en trop, et la liste des neuf objets change.
Garder le reste mot pour mot est ce qui donne une famille homogène.

### Planche 1 — Mobilier

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Draw exactly 9 objects, one per cell, each centred in its cell with even margins on all sides, nothing touching a cell edge. Do not draw grid lines, borders, frames, text, labels, numbers or watermarks. The background is one uniform flat magenta #FF00FF, with no gradient, no texture and no vignette.

PROJECTION: Axis-aligned top-down oblique view, as in early-1990s tile-based computer role-playing games. The ground plane is parallel to the image edges. A table top or a chest lid seen from above is a RECTANGLE whose edges are parallel to the image border — not a rhombus, not a diamond. Do not use isometric projection. Do not rotate the objects 45 degrees.

LIGHTING: A single light source from the upper left. Upper-left faces catch the highlight, lower-right faces fall into shadow. Do not paint any cast shadow on the background.

STYLE: Early-1990s VGA hand-painted pixel art. Limited palette, ordered dithering, crisp visible pixels. No anti-aliasing, no blur, no outlines, no glossy modern shading. A muted earthy base — mossy green, warm brown, weathered grey stone, aged plaster — with saturated colour used sparingly as accents on cloth, painted wood, metal and gems: crimson, gold, royal blue, purple. The objects look solid, worn and lived-in.

FORBIDDEN: no painted drop shadow, no text or lettering on the objects, no extra scenery, furniture or props beyond the nine listed below.

The nine objects, in reading order:
1. wooden chair
2. wooden stool
3. small square table
4. long banquet table
5. simple bed
6. four-poster bed
7. bookshelf full of books
8. cupboard
9. patterned rug with fringed border
```

### Planche 2 — Contenants

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Draw exactly 9 objects, one per cell, each centred in its cell with even margins on all sides, nothing touching a cell edge. Do not draw grid lines, borders, frames, text, labels, numbers or watermarks. The background is one uniform flat magenta #FF00FF, with no gradient, no texture and no vignette.

PROJECTION: Axis-aligned top-down oblique view, as in early-1990s tile-based computer role-playing games. The ground plane is parallel to the image edges. A table top or a chest lid seen from above is a RECTANGLE whose edges are parallel to the image border — not a rhombus, not a diamond. Do not use isometric projection. Do not rotate the objects 45 degrees.

LIGHTING: A single light source from the upper left. Upper-left faces catch the highlight, lower-right faces fall into shadow. Do not paint any cast shadow on the background.

STYLE: Early-1990s VGA hand-painted pixel art. Limited palette, ordered dithering, crisp visible pixels. No anti-aliasing, no blur, no outlines, no glossy modern shading. A muted earthy base — mossy green, warm brown, weathered grey stone, aged plaster — with saturated colour used sparingly as accents on cloth, painted wood, metal and gems: crimson, gold, royal blue, purple. The objects look solid, worn and lived-in.

FORBIDDEN: no painted drop shadow, no text or lettering on the objects, no extra scenery, furniture or props beyond the nine listed below. The closed chest is closed and shows no contents.

The nine objects, in reading order:
1. closed wooden chest
2. open wooden chest
3. barrel
4. wooden crate
5. sack of grain
6. wicker basket
7. clay jar
8. leather satchel
9. wall shelf
```

### Planche 3 — Table et nourriture

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Draw exactly 9 objects, one per cell, each centred in its cell with even margins on all sides, nothing touching a cell edge. Do not draw grid lines, borders, frames, text, labels, numbers or watermarks. The background is one uniform flat magenta #FF00FF, with no gradient, no texture and no vignette.

PROJECTION: Axis-aligned top-down oblique view, as in early-1990s tile-based computer role-playing games. The ground plane is parallel to the image edges. A table top or a chest lid seen from above is a RECTANGLE whose edges are parallel to the image border — not a rhombus, not a diamond. Do not use isometric projection. Do not rotate the objects 45 degrees.

LIGHTING: A single light source from the upper left. Upper-left faces catch the highlight, lower-right faces fall into shadow. Do not paint any cast shadow on the background.

STYLE: Early-1990s VGA hand-painted pixel art. Limited palette, ordered dithering, crisp visible pixels. No anti-aliasing, no blur, no outlines, no glossy modern shading. A muted earthy base — mossy green, warm brown, weathered grey stone, aged plaster — with saturated colour used sparingly as accents on cloth, painted wood, metal and gems: crimson, gold, royal blue, purple. The objects look solid, worn and lived-in.

FORBIDDEN: no painted drop shadow, no text or lettering on the objects, no extra scenery, furniture or props beyond the nine listed below. No table, no tablecloth, no place setting under the food items.

The nine objects, in reading order:
1. loaf of bread
2. wheel of cheese
3. ham hock
4. roast fowl
5. apple
6. tankard of ale
7. wine bottle
8. plate with cutlery
9. cooking pot
```

### Planche 4 — Armes et protections

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Draw exactly 9 objects, one per cell, each centred in its cell with even margins on all sides, nothing touching a cell edge. Do not draw grid lines, borders, frames, text, labels, numbers or watermarks. The background is one uniform flat magenta #FF00FF, with no gradient, no texture and no vignette.

PROJECTION: Axis-aligned top-down oblique view, as in early-1990s tile-based computer role-playing games. The ground plane is parallel to the image edges. A table top or a chest lid seen from above is a RECTANGLE whose edges are parallel to the image border — not a rhombus, not a diamond. Do not use isometric projection. Do not rotate the objects 45 degrees. Each weapon lies flat on the ground, seen from above.

LIGHTING: A single light source from the upper left. Upper-left faces catch the highlight, lower-right faces fall into shadow. Do not paint any cast shadow on the background.

STYLE: Early-1990s VGA hand-painted pixel art. Limited palette, ordered dithering, crisp visible pixels. No anti-aliasing, no blur, no outlines, no glossy modern shading. A muted earthy base — mossy green, warm brown, weathered grey stone, aged plaster — with saturated colour used sparingly as accents on cloth, painted wood, metal and gems: crimson, gold, royal blue, purple. The objects look solid, worn and lived-in.

FORBIDDEN: no painted drop shadow, no text or lettering on the objects, no extra scenery, furniture or props beyond the nine listed below. No weapon racks, no stands, no ground surface.

The nine objects, in reading order:
1. short sword
2. long sword
3. dagger
4. hand axe
5. war hammer
6. round shield
7. kite shield
8. iron helmet
9. bow with quiver
```

### Planche 5 — Outils et métiers

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Draw exactly 9 objects, one per cell, each centred in its cell with even margins on all sides, nothing touching a cell edge. Do not draw grid lines, borders, frames, text, labels, numbers or watermarks. The background is one uniform flat magenta #FF00FF, with no gradient, no texture and no vignette.

PROJECTION: Axis-aligned top-down oblique view, as in early-1990s tile-based computer role-playing games. The ground plane is parallel to the image edges. A table top or a workbench top seen from above is a RECTANGLE whose edges are parallel to the image border — not a rhombus, not a diamond. Do not use isometric projection. Do not rotate the objects 45 degrees.

LIGHTING: A single light source from the upper left. Upper-left faces catch the highlight, lower-right faces fall into shadow. Do not paint any cast shadow on the background.

STYLE: Early-1990s VGA hand-painted pixel art. Limited palette, ordered dithering, crisp visible pixels. No anti-aliasing, no blur, no outlines, no glossy modern shading. A muted earthy base — mossy green, warm brown, weathered grey stone, aged plaster — with saturated colour used sparingly as accents on cloth, painted wood, metal and gems: crimson, gold, royal blue, purple. The objects look solid, worn and lived-in.

FORBIDDEN: no painted drop shadow, no text or lettering on the objects, no extra scenery, furniture or props beyond the nine listed below. The workbench carries no tools on it.

The nine objects, in reading order:
1. anvil
2. blacksmith bellows
3. forge hammer
4. hand saw
5. shovel
6. pitchfork
7. scythe
8. carpenter workbench
9. grindstone
```

### Planche 6 — Feu et lumière

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Draw exactly 9 objects, one per cell, each centred in its cell with even margins on all sides, nothing touching a cell edge. Do not draw grid lines, borders, frames, text, labels, numbers or watermarks. The background is one uniform flat magenta #FF00FF, with no gradient, no texture and no vignette.

PROJECTION: Axis-aligned top-down oblique view, as in early-1990s tile-based computer role-playing games. The ground plane is parallel to the image edges. A table top or a chest lid seen from above is a RECTANGLE whose edges are parallel to the image border — not a rhombus, not a diamond. Do not use isometric projection. Do not rotate the objects 45 degrees.

LIGHTING: A single light source from the upper left. Upper-left faces catch the highlight, lower-right faces fall into shadow. Do not paint any cast shadow on the background. Flames are drawn as small crisp dithered shapes; do not paint a soft glow, a halo or a bloom around them, and do not let a flame light up the magenta background.

STYLE: Early-1990s VGA hand-painted pixel art. Limited palette, ordered dithering, crisp visible pixels. No anti-aliasing, no blur, no outlines, no glossy modern shading. A muted earthy base — mossy green, warm brown, weathered grey stone, aged plaster — with saturated colour used sparingly as accents on cloth, painted wood, metal and gems: crimson, gold, royal blue, purple. The objects look solid, worn and lived-in.

FORBIDDEN: no painted drop shadow, no text or lettering on the objects, no extra scenery, furniture or props beyond the nine listed below. No wall behind the torch bracket or the fireplace beyond the object itself.

The nine objects, in reading order:
1. street lantern on a post
2. wall torch bracket
3. candlestick
4. oil lamp
5. iron brazier
6. hand torch
7. lit fireplace
8. cauldron
9. single candle
```

### Planche 7 — Extérieur

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Draw exactly 9 objects, one per cell, each centred in its cell with even margins on all sides, nothing touching a cell edge. Do not draw grid lines, borders, frames, text, labels, numbers or watermarks. The background is one uniform flat magenta #FF00FF, with no gradient, no texture and no vignette.

PROJECTION: Axis-aligned top-down oblique view, as in early-1990s tile-based computer role-playing games. The ground plane is parallel to the image edges. A well mouth or a cart bed seen from above is a RECTANGLE or a circle whose axes are parallel to the image border — not a rhombus, not a diamond. Do not use isometric projection. Do not rotate the objects 45 degrees. The fence section runs straight along the horizontal axis of its cell.

LIGHTING: A single light source from the upper left. Upper-left faces catch the highlight, lower-right faces fall into shadow. Do not paint any cast shadow on the background.

STYLE: Early-1990s VGA hand-painted pixel art. Limited palette, ordered dithering, crisp visible pixels. No anti-aliasing, no blur, no outlines, no glossy modern shading. A muted earthy base — mossy green, warm brown, weathered grey stone, aged plaster — with saturated colour used sparingly as accents on cloth, painted wood, metal and gems: crimson, gold, royal blue, purple. The objects look solid, worn and lived-in.

FORBIDDEN: no painted drop shadow, no text or lettering on the objects, no extra scenery, furniture or props beyond the nine listed below. No patch of grass or dirt under the objects.

The nine objects, in reading order:
1. stone well
2. wooden handcart
3. wooden fence section
4. garden gate
5. water trough
6. hay bale
7. log pile
8. tree stump
9. wooden bucket
```

### Planche 8 — Végétation et menu décor

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Draw exactly 9 objects, one per cell, each centred in its cell with even margins on all sides, nothing touching a cell edge. Do not draw grid lines, borders, frames, text, labels, numbers or watermarks. The background is one uniform flat magenta #FF00FF, with no gradient, no texture and no vignette.

PROJECTION: Axis-aligned top-down oblique view, as in early-1990s tile-based computer role-playing games. The ground plane is parallel to the image edges. A pot rim or a stone base seen from above reads as a circle or a RECTANGLE whose axes are parallel to the image border — not a rhombus, not a diamond. Do not use isometric projection. Do not rotate the objects 45 degrees.

LIGHTING: A single light source from the upper left. Upper-left faces catch the highlight, lower-right faces fall into shadow. Do not paint any cast shadow on the background.

STYLE: Early-1990s VGA hand-painted pixel art. Limited palette, ordered dithering, crisp visible pixels. No anti-aliasing, no blur, no outlines, no glossy modern shading. A muted earthy base — mossy green, warm brown, weathered grey stone, aged plaster — with saturated colour used sparingly as accents on cloth, painted wood, metal and gems: crimson, gold, royal blue, purple. The objects look solid, worn and lived-in.

FORBIDDEN: no painted drop shadow, no text or lettering on the objects, no extra scenery, furniture or props beyond the nine listed below. No soil patch, no grass ground, no flower bed under the plants — each object floats alone on the magenta.

The nine objects, in reading order:
1. cluster of mushrooms
2. grass tuft
3. wildflower cluster
4. small shrub
5. potted plant
6. small rock
7. fallen branch
8. beehive
9. bundle of dried herbs
```

### Planche 9 — Précieux et quête

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Draw exactly 9 objects, one per cell, each centred in its cell with even margins on all sides, nothing touching a cell edge. Do not draw grid lines, borders, frames, text, labels, numbers or watermarks. The background is one uniform flat magenta #FF00FF, with no gradient, no texture and no vignette.

PROJECTION: Axis-aligned top-down oblique view, as in early-1990s tile-based computer role-playing games. The ground plane is parallel to the image edges. An open book or an ingot seen from above is a RECTANGLE whose edges are parallel to the image border — not a rhombus, not a diamond. Do not use isometric projection. Do not rotate the objects 45 degrees. Each small item lies flat on the ground, seen from above.

LIGHTING: A single light source from the upper left. Upper-left faces catch the highlight, lower-right faces fall into shadow. Do not paint any cast shadow on the background. Gems and gold catch a hard pixel highlight, never a soft lens flare or sparkle.

STYLE: Early-1990s VGA hand-painted pixel art. Limited palette, ordered dithering, crisp visible pixels. No anti-aliasing, no blur, no outlines, no glossy modern shading. A muted earthy base — mossy green, warm brown, weathered grey stone, aged plaster — with saturated colour used sparingly as accents on cloth, painted wood, metal and gems: crimson, gold, royal blue, purple. The objects look solid, worn and lived-in.

FORBIDDEN: no painted drop shadow, no text or lettering on the objects, no extra scenery, furniture or props beyond the nine listed below. The open book and the scroll show blank or scribbled pages, never readable words.

The nine objects, in reading order:
1. pile of gold coins
2. gold ingot
3. cut gemstone
4. jewelled ring
5. amulet
6. iron key
7. rolled scroll
8. open book
9. lute
```

---

## Les portraits de dialogue

**À faire en premier si on ne fait qu'une planche.** C'est le meilleur rapport
effort/effet du projet : dans Ultima VII le portrait fait la moitié de la
présence d'un personnage, et neuf visages isolés n'ont aucune cohérence à tenir
entre eux — contrairement aux six poses d'un même personnage.

Deux différences de forme avec les planches d'objets : le dessin **remplit sa
cellule** au lieu de flotter sur du magenta (il n'y a rien à détourer, le
portrait est un rectangle plein), et le fond est sombre, pas magenta.

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Each cell contains one character portrait that FILLS ITS CELL COMPLETELY, edge to edge — no border, no margin, no magenta, no empty space. Nine portraits in total. Do not draw grid lines, frames, text, labels, numbers or watermarks.

FRAMING: Head and shoulders, seen from the front, the face turned slightly toward the viewer. The head occupies roughly the upper two thirds of the cell. Behind each figure is a plain dark background — deep brown or slate — with a faint lighter halo behind the head, and nothing else: no scenery, no room, no window, no props.

STYLE: Early-1990s VGA hand-painted pixel art portrait, as in the character close-ups of a 1992 computer role-playing game. Roughly 64 by 80 pixels of real detail, upscaled — chunky visible pixels, limited palette, ordered dithering for the shading. No anti-aliasing, no blur, no soft airbrush, no modern digital painting, no photorealism, no anime. Faces are ordinary and lived-in, not beautiful: crooked noses, weathered skin, tired eyes, uneven stubble.

LIGHTING: A single light from the upper left. The left of each face catches the light, the right side falls into shadow, with a hard dithered edge between the two.

The nine portraits, in reading order:
1. a travelling adventurer, early thirties, brown hair to the jaw, blue tunic with a gold collar, calm and watchful
2. a village man, forties, thinning brown hair, plain green tunic, mild and a little dull
3. an innkeeper woman, forties, red hair tied back, cream blouse, shrewd and warm
4. a town guard, fifties, grey stubble, iron helmet with a nose guard, bored
5. a blacksmith, heavy build, black beard, soot on the face, dark red shirt, scowling
6. a bandit, gaunt, greasy dark hair, scar across the cheek, filthy brown leather, sneering
7. a bandit chief, broad, shaved head, gold earring, dark green cloak over mail, cold and amused
8. a young bard, twenties, long fair hair, wine-red doublet, cheerful
9. an old woman, seventy, white hair under a grey shawl, deeply lined face, kind
```

La consigne « ordinaires et vécus, pas beaux » n'est pas une coquetterie : sans
elle on obtient neuf mannequins interchangeables, et un bourg dont les habitants
se ressemblent n'a pas d'habitants.

Neuf portraits pour six personnages : les trois derniers (chef de bande, barde,
vieille femme) attendent que le bourg s'étoffe.

---

## Les personnages qui marchent

**Une planche par personnage, jamais plusieurs personnages sur la même.** Ce qui
compte ici est la cohérence entre les six cases d'un même personnage ; y mêler
un second personnage la détruit.

C'est le cas le plus difficile de tout le lot. Un objet est un dessin isolé :
s'il est réussi, il est utilisable. Un personnage en demande six qui doivent être
*le même* — même taille, même carrure, même vêtement — vus de dos, de face et de
profil, dans deux poses. Et comme les acteurs sont ancrés par le bas, **un écart
d'un seul pixel de hauteur entre deux poses fait sautiller le personnage à
chaque pas**.

Trois mécanismes du chargeur répondent à cela, et il faut les connaître avant de
générer quoi que ce soit (voir l'en-tête de `src/data/sheets.ts`) :

- **`group`** recadre plusieurs cellules sur l'union de leurs contenus, ce qui
  leur donne un cadre commun et supprime le sautillement ;
- **`mirror`** dérive le profil ouest du profil est — six dessins au lieu de
  huit, et une symétrie que personne ne tient à la main ;
- **`portrait`** vise le portrait de dialogue plutôt que le sprite de monde.

Le prompt ci-dessous est celui de l'Avatar. Pour les autres, **remplacer le seul
bloc `THE CHARACTER`** et garder tout le reste mot pour mot.

```
Ignore all previous images and instructions in this conversation. Start fresh.

LAYOUT: A single square image. Divide it into 3 columns by 3 rows of equal square cells. Cells 1 to 6, in reading order, each contain ONE full-body character sprite, standing, centred, feet near the bottom of the cell, with clear space above the head. Cells 7, 8 and 9 are empty background. Do not draw grid lines, borders, frames, text, labels, numbers, arrows or watermarks. The background is one uniform flat magenta #FF00FF everywhere, the exact same shade in every cell, with no gradient, no texture, no vignette, no shadow on the ground.

THE SAME CHARACTER, SIX TIMES: All six sprites are the identical person — same height, same build, same hair, same clothes, same colours, same proportions, drawn at exactly the same size. Only the viewing direction and the leg position change. This matters more than anything else in this image: if two cells show people of different heights or different clothing, the sheet is unusable.

THE SIX CELLS, in reading order:
1. seen from BEHIND, standing still, feet together, arms at the sides
2. seen from BEHIND, mid-stride, left leg forward and right arm forward
3. seen from the FRONT, standing still, feet together, arms at the sides
4. seen from the FRONT, mid-stride, right leg forward and left arm forward
5. seen from the RIGHT SIDE, in pure profile facing right, standing still
6. seen from the RIGHT SIDE, in pure profile facing right, mid-stride, legs apart
Never draw the left profile: it is produced by mirroring cell 5 and 6.

PROJECTION: The character stands upright, seen from slightly above, as in a top-down tile-based role-playing game. The whole body is visible down to the feet. Do not tilt or rotate the figure. Do not use isometric projection.

STYLE: Early-1990s VGA hand-painted pixel art. The figure is about 32 pixels tall in real detail, upscaled — chunky visible pixels, a limited palette, ordered dithering. No anti-aliasing, no blur, no black outline, no glossy modern shading, no anime, no chibi. Readable silhouette above all: shoulders clearly wider than the head, a dark edge along the lower-right side of the body. Muted earthy colours with one saturated accent.

LIGHTING: A single light source from the upper left, identical in all six cells. Do not paint any cast shadow on the background.

THE CHARACTER: a travelling adventurer, early thirties, brown hair to the jaw, a blue knee-length tunic with a gold-trimmed collar, brown leather boots and belt, no weapon drawn.
```

Les cinq autres blocs `THE CHARACTER`, à substituer tels quels :

```
a village man, forties, plain green tunic, brown hose, worn leather shoes, a small belt pouch
```
```
an innkeeper woman, forties, red hair tied back, long cream dress with a dark blue apron, sleeves rolled to the elbow
```
```
a town guard, fifties, iron helmet with a nose guard, grey mail over a dark tunic, red cloak on the shoulders, boots
```
```
a blacksmith, heavy build, black beard, a dark red shirt with the sleeves cut off, a thick brown leather apron, soot-stained arms
```
```
a bandit, gaunt, greasy dark hair, filthy brown leather jerkin, mismatched green trousers, rags bound round the shins
```

Les descriptions reprennent **exactement** celles des portraits correspondants :
c'est ce qui fait que le sprite et le visage du même personnage ont les mêmes
cheveux et le même vêtement.

---

## Une fois la planche obtenue

1. **Détourer et réduire** avec `tools/detourer-planches.mjs` — un modèle rend un
   JPEG de 2048 px avec un halo de compression autour de chaque objet ; posé tel
   quel cela ferait 18 Mo et une frange rose. Voir
   [`public/sheets/README.md`](../public/sheets/README.md).
2. **Poser le PNG** dans `public/sheets/`.
3. **Déclarer les cellules** dans `src/data/sheets.ts`. Pour un personnage, la
   fonction `personnage()` encode déjà l'ordre des frames, le groupe et le
   miroir : une ligne suffit.
4. **Régler `tilesWide`**, et c'est là que se joue le résultat. L'emprise au sol
   de la shape est un point de départ, pas une réponse : un objet transportable
   dessiné à `1` fait la largeur de la table qui le porte et la masque
   entièrement. Pain 0,5, pomme 0,35, chope 0,4.
5. **Regarder le jeu.** Les deux défauts les plus fréquents — un objet trop gros
   et un objet posé au pied du meuble au lieu du plateau — ne se voient pas dans
   le code.

## Les pièges du détourage, dans l'ordre où ils sont apparus

Chacun a coûté du temps ; ils reviendront sur toute planche générée.

**Le magenta n'est pas uniforme.** La compression JPEG le fait dériver dans
toutes les directions. Comparer à `#FF00FF` avec une tolérance ne marche pas :
une tolérance assez large pour avaler le halo mange aussi les roses du dessin.
Le test retenu porte sur le **caractère magenta** de la couleur — rouge et bleu
forts, vert faible, rouge et bleu proches l'un de l'autre — et non sur sa
distance à une couleur de référence.

**Les traits de grille survivent à la consigne.** Les modèles en dessinent
malgré l'interdiction, et un trait qui longe le bord d'une cellule fait recadrer
sur la cellule entière : l'objet se retrouve minuscule et mal ancré. D'où
`margin`, un retrait de 2 % ignoré sur le pourtour de chaque cellule.

**Le remplissage depuis le bord n'atteint pas les trous fermés.** Le dossier
d'une chaise, l'anneau d'une clef : ces zones de fond sont encerclées par le
dessin et restent opaques. Il faut une passe globale en plus du remplissage
depuis le bord.

**Le fond détouré est transparent, pas magenta.** Le chargeur accepte les deux ;
la convention magenta reste celle des sources, la transparence celle des
fichiers versionnés.

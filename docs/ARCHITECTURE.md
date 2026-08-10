# Architecture

Ce document explique *pourquoi* le code est organisé ainsi, et où sont les
simplifications assumées. Le README explique la méthode générale ; ici on entre
dans les décisions.

## Principe directeur

Le moteur est une **simulation à laquelle on ajoute un rendu**, et non un moteur
graphique auquel on ajoute des règles. Concrètement :

- la logique pure (objets, monde, pathfinding, emplois du temps, dialogues) ne
  dépend jamais du DOM, et tourne donc sous Node — c'est ce qui rend les 57
  tests possibles sans navigateur ;
- toute la connaissance du canvas est confinée à `src/render/` et `src/input/`.

Cette séparation n'est pas cosmétique : elle permet de tester qu'un PNJ rentre
bien chez lui sans afficher une seule image, et de remplacer le rendu (WebGL,
terminal, moteur natif) sans toucher à la simulation.

## Le modèle d'objet

`src/world/shapes.ts` définit un registre de *shapes* : la description partagée
de ce qu'est un type d'objet (emprise au sol, hauteur, poids, volume, drapeaux).
`src/objects/gameobject.ts` définit l'instance : une position, une frame, une
quantité, une qualité, un parent et un contenu.

La règle centrale est qu'un objet est **soit posé dans le monde** (`parent ===
null`, coordonnées valides), **soit contenu dans un autre objet**. Il n'y a pas
de troisième état, pas d'« inventaire » distinct des conteneurs du monde : le
sac de l'Avatar est un conteneur comme le coffre de la taverne, et l'Avatar
lui-même est un conteneur.

Cette uniformité paie immédiatement :

- `totalWeight` est une récursion de quatre lignes qui donne le poids d'une
  maison entière ;
- déplacer un objet d'un coffre vers un sac ne demande aucun code spécifique ;
- les cycles (un sac dans lui-même) se règlent par une seule vérification dans
  `canAccept`.

`Actor` étend `GameObject` plutôt que de vivre à côté. Un acteur a donc un
poids et peut, en principe, être contenu — c'est ce qui rendrait naturels les
cadavres transportables ou les créatures en cage.

## Le monde

`World` conserve des `Chunk` de 16×16 tuiles dans une `Map` indexée par
coordonnées de chunk. Chaque chunk porte son terrain (un tableau de
`CHUNK_SIZE²` identifiants) et la liste des objets dont l'**origine** y tombe.

Un détail non trivial : un objet dont l'emprise déborde sur le chunk voisin
reste rangé dans le chunk de son origine. `objectsAt` balaie donc aussi les
chunks adjacents, sans quoi un lit posé à cheval sur une frontière deviendrait
invisible depuis la moitié de ses cases. Un test couvre précisément ce cas.

Le découpage n'est pas décoratif : c'est lui qui permettrait de ne charger que
le voisinage du joueur sur une carte de la taille de celle d'Ultima VII
(3072×3072 tuiles, soit 192×192 chunks regroupés en 12×12 superchunks).

### Franchissabilité

`isBlocked(tx, ty, doorsPassable)` est la seule autorité. Le troisième
paramètre existe parce que joueur et PNJ n'ont pas la même notion d'obstacle :
une porte close arrête l'Avatar, mais un PNJ sait l'ouvrir. Sans cette
distinction, le pathfinding refuse d'entrer dans les bâtiments et le bourg
paraît mort.

## Rendu

### Projection

Ultima VII **n'est pas isométrique**. La grille reste alignée sur l'écran (le
nord est en haut, une tuile est un carré), et c'est la hauteur — le *lift* —
qui décale le sprite d'une demi-tuile vers le haut **et** vers la gauche par
niveau. `Camera.worldToScreen` implémente exactement cela.

Deux conventions en découlent, toutes deux héritées du jeu d'origine :

- la tuile `(tx, ty)` d'un objet désigne le **coin bas-droit** de son emprise,
  et le sprite est collé à ce coin ; un objet de 1×2 s'étend donc vers le nord ;
- pour qu'un toit posé à la hauteur 4 retombe pile sur ses murs, il faut le
  placer 2 tuiles plus loin en x et en y (`ROOF_SHIFT` dans `src/data/town.ts`).

### Ordre de dessin

C'est le point le plus délicat. Le terrain est dessiné en premier, en balayage
simple. Les objets et acteurs sont ensuite collectés, triés, puis dessinés :

```
profondeur = x + y + hauteur × 0,5
égalité    → les grandes emprises (sols, lits) passent dessous
```

**Simplification assumée.** Exult effectue une comparaison topologique entre
boîtes englobantes, exacte mais coûteuse. La clé ci-dessus se trompe dans les
cas où deux objets larges et hauts se chevauchent fortement. C'est le premier
endroit à reprendre pour un projet sérieux.

Les toits sont un cas particulier : parce qu'ils sont décalés de deux tuiles,
leur profondeur doit être recalculée depuis la tuile qu'ils recouvrent
*visuellement*, sinon ils passent devant tout ce qui se trouve au sud du
bâtiment.

### Lumière

Un voile de la couleur ambiante est peint par-dessus la scène en `multiply`,
puis chaque source y perce un trou par dégradé radial en `destination-out`.

Le piège est que ces trous **se cumulent multiplicativement** : trois lampes qui
se recouvrent à 60 % chacune ne laissent que 6 % du voile. Sur une place bordée
de huit réverbères, la nuit disparaît complètement. D'où des rayons courts
(4 tuiles) et une atténuation qui concentre la clarté dans le premier tiers du
rayon.

### Art

`src/render/art.ts` dessine tous les sprites au démarrage dans des canvas hors
écran. C'est une contrainte volontaire (aucune donnée sous copyright dans le
dépôt) qui a un effet secondaire agréable : le projet n'a aucun asset binaire.
Le remplacer par un chargeur d'atlas PNG ne demande que de respecter
l'interface `Sprite` — rien d'autre dans le moteur ne connaît le format.

## Simulation

### Emplois du temps

Un emploi du temps est une liste d'entrées `{ heure, activité, lieu }`.
`currentEntry` sélectionne l'entrée active, **de façon circulaire** : à 3 h du
matin, c'est l'entrée de la veille au soir qui s'applique.

`ScheduleAI.think` compare en permanence où se trouve le PNJ à ce que l'heure
lui prescrit ; s'il n'est pas au bon endroit, il calcule un chemin, sinon il
joue son activité. C'est tout. La richesse apparente du bourg vient de la
densité des emplois du temps, pas de la complexité de l'IA — c'est la leçon
principale à retenir d'Ultima VII sur ce point.

### Pathfinding

A\* huit directions, heuristique octile, avec deux règles qui changent beaucoup
le rendu visuel :

- **pas de coupe d'angle** entre deux obstacles diagonaux, sinon les PNJ
  traversent les coins de murs ;
- **tolérance d'arrivée**, parce que la destination d'un emploi du temps (le
  lit, l'enclume) est presque toujours une case occupée par du mobilier.

Invariant maintenu : un chemin ne pose jamais le pied sur une case bloquée.
Atteindre une cible infranchissable passe par la tolérance, jamais par une
exception sur la case d'arrivée.

La file de priorité est un tableau balayé linéairement. C'est suffisant à
l'échelle d'un bourg ; à l'échelle d'une carte d'Ultima VII il faudrait un tas
binaire, et probablement un graphe de navigation hiérarchique.

### Franchissable et visible

Deux notions voisines qu'il ne faut surtout pas confondre :

- `isBlocked` répond « puis-je marcher ici ? ». L'eau et les tables bloquent.
- `isOpaque` répond « puis-je voir à travers ? ». Le critère est la hauteur :
  seuls les objets solides d'au moins 3 niveaux (murs, portes closes, arbres)
  arrêtent le regard. On voit par-dessus une table, et au-delà d'un étang.

`hasLineOfSight` parcourt la droite entre deux tuiles, **extrémités exclues** :
il faut pouvoir ouvrir la porte devant laquelle on se tient, alors qu'elle est
elle-même opaque. Sans ce mécanisme, on fouille les coffres à travers les murs
— ce qui arrive en permanence, les bâtiments étant petits.

## Entrées et interface tactile

Tout passe par les Pointer Events : souris, doigt et stylet empruntent le même
chemin. Les évènements sont mis en file et consommés une fois par frame, et la
boucle de jeu décide qui les reçoit — **les commandes tactiles d'abord, les
fenêtres ensuite, le monde en dernier**. Cet ordre n'est pas négociable : un
appui sur le stick virtuel ne doit jamais faire marcher l'Avatar vers la tuile
qui se trouve dessous.

Trois échelles cohabitent, et les mélanger est la source d'erreur principale :

| Espace | Unité | Qui l'utilise |
|---|---|---|
| Pixels CSS | ce que voit le navigateur | rien, sinon la mise en page |
| Pixels de rendu | pixels du canvas | caméra, monde, lumière |
| Points d'interface | rendu ÷ `uiScale` | fenêtres, journal, commandes |

`uiScale` vaut la densité d'écran, majorée de 15 % sur appareil tactile : une
cible de moins de 9 mm se rate systématiquement au doigt. Majorer davantage est
contre-productif — il reste alors si peu de points en largeur que les fenêtres
couvrent l'écran.

Le zoom de la caméra, lui, est choisi pour montrer un nombre de tuiles donné
(13 sur téléphone, 24 sur ordinateur) et reste entier pour garder le pixel art
net.

Le bouton **Agir** mérite un mot : il applique l'action à l'élément interactif
le plus proche, personnages d'abord, puis objets par distance croissante, en
filtrant sur la ligne de vue. C'est l'équivalent au doigt du double-clic, qui
demande une précision que le doigt n'a pas — et il n'y a presque jamais
d'ambiguïté sur ce que le joueur veut faire quand il est à côté.

## Scripts

### Usecode

Ultima VII embarque une machine virtuelle à pile et un bytecode compilé.
Ici, un comportement est une closure enregistrée par identifiant de shape
(`onUse('anvil', …)`), avec un **repli sur les drapeaux de la shape** : tout ce
qui porte `door` s'ouvre, tout ce qui porte `container` s'ouvre, tout ce qui
porte `food` se mange. Ce repli est essentiel — il évite d'écrire un script pour
chacun des centaines d'objets d'un monde réel.

**Limite connue, et ce que la sauvegarde en a dit.** On craint souvent que des
closures rendent une partie insérialisable. La distinction qui compte est
ailleurs : ces closures sont du **code**, pas de l'état. L'état d'un objet tient
entièrement dans sa frame et sa qualité, donc rien n'a eu à être démêlé — voir
la section Sauvegarde.

La limite reste réelle mais plus étroite : le jour où il faudra sauvegarder au
*milieu* d'un script en cours (une cinématique, une quête à étapes), il faudra
une VM avec un état explicite. Tant que les scripts sont atomiques, l'approche
actuelle suffit.

### Dialogues

Des sujets cliquables, un état conversationnel, et surtout des **drapeaux
partagés par tout le jeu**. C'est ce dernier point qui fait la différence entre
un arbre de dialogue et une enquête : apprendre quelque chose de Mireille rend
visible un sujet chez Aldric, dont la réponse en débloque un chez Basile. Un
sujet peut être présent dès le départ mais invisible tant que son drapeau n'est
pas posé — c'est ainsi qu'un PNJ « sait » une chose seulement après que le
joueur l'a apprise ailleurs.

## Sauvegarde

`src/core/savegame.ts`. Trois décisions structurent le format.

**On sauvegarde le monde entier, pas un différentiel** par rapport à la graine
de génération. C'est plus volumineux — 88 Ko pour le bourg — mais une
sauvegarde ne se casse pas quand la carte change de version.

**Les identifiants d'objets sont restaurés tels quels.** `ObjectInit` accepte un
`id` imposé, et le compteur global est poussé au-delà du maximum rencontré : un
objet créé après le chargement ne peut donc pas réutiliser l'identifiant d'un
objet vivant. Un test le vérifie explicitement.

**Le lien parent se reconstruit à la lecture.** L'arborescence des contenants
est circulaire (un objet connaît son parent, le parent connaît ses enfants) :
on ne sérialise que la descendance. Au chargement on remplit `contents` et
`parent` directement, sans passer par `canAccept` — une règle de capacité qui
aurait changé entre deux versions ne doit pas faire disparaître les affaires du
joueur.

### Le piège du codage par plages

Le terrain est compressé par plages. Le premier jet encodait l'identifiant
**et** la variante dans la même plage, et ne compressait quasiment rien : les
variantes d'herbe sont tirées au hasard case par case, donc deux voisines
diffèrent presque toujours. En séparant les deux — plages sur les identifiants,
chaîne d'un chiffre par case pour les variantes — on passe de 7043 plages à
moins de 900 pour 9216 cases.

### Ce qui doit être reconstruit au chargement

Remplacer le monde ne suffit pas : tout ce qui en gardait une référence devient
obsolète. L'IA en tient une, les fenêtres d'inventaire pointent vers des objets
qui n'existent plus, la caméra suit un Avatar disparu. Même chose pour la
poignée de débogage `window.u7`, dont les champs sont des **accesseurs** et non
des copies — figées, elles pointeraient vers un monde mort et laisseraient
croire que le chargement n'a rien fait. C'est exactement le bug qui s'est
produit pendant l'écriture.

## Ce qui n'est pas fait

Volontairement hors périmètre de ce prototype, par ordre d'importance :
sauvegarde, combat, magie, commerce, streaming réel des chunks, éditeur de
cartes, son. Voir [ROADMAP.md](ROADMAP.md).

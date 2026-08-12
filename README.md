# Ultima7like — comment créer un clone d'Ultima VII

Ce dépôt répond à la question de deux manières : un **guide de méthode** (ce
fichier) et un **prototype fonctionnel** qui met en œuvre les systèmes décrits,
pour que la réponse soit vérifiable plutôt que théorique.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 176 tests
```

Une version jouable est publiée automatiquement à chaque poussée sur `main` :
**https://corrreon.github.io/Ultima7like/**

| | Ordinateur | Mobile |
|---|---|---|
| Marcher | flèches / ZQSD, ou clic | stick virtuel, ou toucher |
| Utiliser, parler, **ramasser** | double-clic, ou `E` | bouton **Agir**, ou double-tap |
| Prendre en main / poser | clic sur l'objet | toucher l'objet |
| Sac | `I` | bouton **Sac** |
| Journal de quêtes | `J` | bouton **Notes** |
| Grimoire | `G` | — |
| Dégainer / rengainer | `C` | bouton **Armes** |
| Pause | `P` | — |
| Menu (sauver, charger, recommencer) | `M` | bouton **Menu** |
| Éditeur de carte | `F2` | — |
| Fermer | `Échap` | bouton **Fermer** |
| Sauver / charger | `F5` / `F9` (`F8` : nouvelle partie) | par le **Menu** |

Un objet posé au sol se ramasse d'un seul geste : « utiliser » un objet
transportable le range directement, dans la bourse ou le sac s'il y a lieu. Le
clic simple garde le comportement d'origine — l'objet passe *en main*, et on le
dépose où l'on veut.

La partie est sauvegardée automatiquement toutes les 30 secondes et quand
l'onglet passe en arrière-plan ; elle reprend seule au lancement.

Une sauvegarde contient le terrain et tous les objets : elle fige donc la carte
telle qu'elle était. Quand la carte change d'une version à l'autre, la partie
précédente ne peut plus être reprise et le jeu repart à neuf en le disant —
sans quoi on jouerait un ancien monde où la moitié de ce que les PNJ racontent
n'existe pas.

---

## 1. D'abord, décider ce que « clone » veut dire

Trois projets très différents se cachent derrière le mot, et les confondre est
la première cause d'échec :

| Objectif | Ce que ça implique | Référence |
|---|---|---|
| **Rejouer les jeux d'origine** sur du matériel moderne | Réécrire le moteur, et lire les fichiers de données originaux | [Exult](https://exult.info) |
| **Faire un jeu original** qui procure les mêmes sensations | Réimplémenter les *systèmes*, avec ses propres contenus | ce dépôt |
| **Refaire l'ambiance** (vue, interface, palette) | Le piège : sans la simulation, on obtient un ARPG quelconque | — |

Si le but est le premier, il ne faut pas partir de zéro : Exult est un moteur
C++/SDL mature qui fait tourner *The Black Gate* et *Serpent Isle*, avec son
éditeur de cartes (Exult Studio) et son compilateur d'usecode. Contribuer y est
plus utile que recommencer.

Ce dépôt vise le second objectif.

### Le point juridique, à régler avant d'écrire une ligne

Réécrire un moteur par rétro-ingénierie est licite. **Redistribuer les données
du jeu ne l'est pas** : sprites, musiques, cartes et usecode restent la
propriété d'Electronic Arts. C'est pourquoi Exult ne livre aucun contenu et
exige que l'utilisateur possède le jeu.

Ici la contrainte est poussée plus loin : **le dépôt ne contient aucun octet issu
d'Ultima VII**. Les sprites sont d'abord générés par code au démarrage
(`src/render/art.ts`), puis remplacés par des planches PNG originales
(`public/sheets/`) produites pour ce projet — les prompts et la méthode sont
conservés dans [docs/PLANCHES.md](docs/PLANCHES.md). Le bourg, ses habitants et
leurs histoires sont originaux.

## 2. Ce qui fait vraiment Ultima VII

Ce ne sont ni les graphismes ni le scénario, mais sept mécanismes. Les rater,
c'est faire un jeu qui ressemble à Ultima VII sans y ressembler du tout.

1. **Tout est un objet.** Le brin d'herbe, le mur, la miche de pain et le
   forgeron partagent une structure unique : un identifiant de *shape*, un
   numéro de frame, des drapeaux, un poids, un volume. Rien n'est « du décor ».
2. **Les conteneurs sont récursifs.** Un sac dans un coffre dans une maison, et
   le poids remonte la chaîne. C'est ce qui rend le monde manipulable.
3. **Le monde est continu**, découpé en chunks, sans écran de chargement ni
   combat séparé.
4. **Les PNJ ont un emploi du temps** : ils dorment, mangent, travaillent,
   rentrent chez eux. Le bourg vit que le joueur regarde ou non.
5. **Les comportements sont des données** attachées aux objets (l'usecode),
   pas du code éparpillé dans le moteur.
6. **La projection n'est pas isométrique** — contrairement à ce qu'on lit
   souvent. La grille reste alignée sur l'écran ; c'est la *hauteur* qui décale
   le sprite en diagonale. Voir §4.
7. **Le temps réel**, avec une horloge de jeu qui pilote la lumière, les
   commerces et les PNJ.

## 3. L'ordre de construction

L'ordre compte, parce que chaque étape dépend structurellement de la
précédente. Celui-ci a été suivi pour ce dépôt :

1. **Boucle à pas fixe et horloge de jeu** — `src/core/`. Une simulation dont
   le comportement dépend du framerate est irrécupérable ensuite.
2. **Registre de shapes et modèle d'objet** — `src/world/shapes.ts`,
   `src/objects/`. *À faire en premier*, tout le reste en dépend. Poids, volume,
   conteneurs, emprise au sol.
3. **Monde en chunks et requêtes spatiales** — `src/world/world.ts`. « Qu'y
   a-t-il sur cette case ? Est-elle franchissable ? »
4. **Rendu** — `src/render/`. Terrain, puis tri en profondeur des objets.
5. **Déplacement et A\*** — `src/sim/pathfind.ts`.
6. **Emplois du temps** — `src/sim/schedule.ts`, `ai.ts`. C'est ici que le
   monde devient vivant, et c'est étonnamment peu de code.
7. **Usecode** — `src/script/usecode.ts`.
8. **Interface d'inventaire** — `src/render/ui.ts`. Manipulation directe.
9. **Cycle jour/nuit et lumières** — `src/render/lighting.ts`.
10. **Dialogues à sujets** — `src/script/conversation.ts`.

11. **Sauvegarde** — `src/core/savegame.ts`. À faire tôt : elle force à rendre
    l'état sérialisable, ce qui révèle où cet état se cache.

Viennent ensuite le combat, la magie et un éditeur de cartes :
voir [docs/ROADMAP.md](docs/ROADMAP.md).

## 4. Les pièges, tels qu'ils se sont présentés

Chacun a réellement fait perdre du temps pendant l'écriture du prototype. Ils
reviendront dans tout projet du même genre.

**Le tri en profondeur est le vrai sujet.** Dessiner un monde en fausse 3D
revient à ordonner correctement des milliers de sprites. Exult résout le
problème par une comparaison topologique entre boîtes englobantes. Ce
prototype utilise une clé de tri (`x + y`, puis hauteur), suffisante dans la
quasi-totalité des cas — c'est le premier endroit à reprendre pour aller vers
la rigueur d'Exult.

**La hauteur décale en diagonale.** Une tuile fait 8×8 pixels dans le jeu
d'origine, et chaque niveau de *lift* décale le sprite de 4 pixels vers le haut
**et** vers la gauche. C'est ce seul décalage qui produit la fausse 3D. Une
conséquence peu évidente : pour qu'un toit posé à la hauteur 4 retombe
exactement sur ses murs, il faut le placer 2 tuiles plus loin en x et en y.

**Les PNJ doivent savoir ouvrir les portes.** Sans cela, le pathfinding refuse
d'entrer dans les bâtiments et tout le monde reste planté dehors : le bourg a
l'air mort alors que les emplois du temps fonctionnent parfaitement. Le
pathfinding a donc besoin de deux notions distinctes de « franchissable » —
celle du joueur, qui se cogne dans une porte close, et celle du PNJ, qui
l'ouvre.

**Les lumières se cumulent de façon multiplicative.** Un voile nocturne troué
par des dégradés en `destination-out` disparaît entièrement dès que quelques
sources se recouvrent : trois lampes à 60 % ne laissent que 6 % du voile, et la
nuit redevient un plein jour terne. Il faut des rayons courts et une
atténuation resserrée.

**Une destination peut être infranchissable.** Un PNJ qui va se coucher vise
son lit, c'est-à-dire un obstacle. Le pathfinding doit accepter une *tolérance*
d'arrivée plutôt qu'une exception sur la case cible — sinon l'invariant « un
chemin ne pose jamais le pied sur une case bloquée » saute, et l'Avatar traverse
les murs au clic.

**« À portée » ne suffit pas, il faut « visible ».** Sans ligne de vue, on
fouille les coffres à travers les murs et on engage la conversation avec
quelqu'un enfermé dans la pièce d'à côté. Le piège est que voir et marcher
n'obéissent pas aux mêmes règles : on voit par-dessus une table, on voit
au-delà d'un étang, mais pas à travers une porte close. Deux notions distinctes,
donc, et non un seul drapeau « solide ».

**Compresser une carte demande de séparer ce qui se répète de ce qui varie.**
Le codage par plages du terrain ne compressait presque rien tant qu'identifiant
et variante étaient encodés ensemble : les variantes d'herbe sont tirées au
hasard case par case, donc deux voisines diffèrent presque toujours. En les
séparant, on passe de 7043 plages à moins de 900 pour 9216 cases.

**Un monde rechargé invalide tout ce qui le référençait.** L'IA en garde une
référence, les fenêtres d'inventaire pointent vers des objets qui n'existent
plus, et une poignée de débogage qui aurait figé les références d'origine
pointerait vers un monde mort — en laissant croire que le chargement n'a rien
fait. C'est exactement le bug rencontré.

**L'interface mobile n'est pas l'interface de bureau mise à l'échelle.** Un
bandeau de 200 points occupe un cinquième d'un écran d'ordinateur et les deux
tiers d'un téléphone. Grossir l'interface pour le doigt réduit d'autant le
nombre de points disponibles : au-delà d'un certain facteur, les fenêtres
couvrent l'écran. Il faut des largeurs calculées, pas fixes.

**Une sauvegarde fige la carte.** Sauver le monde entier plutôt qu'un
différentiel rend le format robuste, mais une partie reprise après une mise à
jour rejoue l'ancienne carte : les PNJ parlent alors d'un chemin qui n'existe
nulle part, et rien ne le signale puisque la sauvegarde est valide. Il faut une
empreinte de la carte de départ, et refuser en le disant.

**Un compagnon qui suit doit se remettre en marche avant d'être perdu.** Le
premier réglage — ne recalculer un chemin qu'une fois le précédent épuisé, avec
une laisse de deux tuiles — laissait le compagnon se croire arrivé à trois
tuiles du meneur, donc planté derrière un arbre pendant qu'on s'éloignait. Trois
correctifs cumulés, dont une tolérance d'arrivée : dix-sept blocages mesurés,
puis zéro.

**Le plus utile a été trouvé en jouant, pas en lisant le code.** Une étagère
dont les variantes ne changeaient jamais, un lit dessiné de face pour une
emprise en profondeur, des plats posés au pied de la table plutôt que dessus,
une nourriture large comme le meuble qui la porte, un sujet de dialogue
inatteignable : aucun de ces défauts n'apparaît à la relecture, tous sautent aux
yeux à l'écran. Piloter le jeu compilé dans un navigateur — Playwright, avec une
poignée de débogage exposée — s'est révélé le meilleur outil de vérification du
projet, devant les tests unitaires.

## 5. Ce que contient le prototype

Un bourg, Valmoret : cinq bâtiments, des routes, un étang, quatre habitants qui
vivent leur journée — et, au sud-ouest, un campement de brigands au bout d'un
sentier.

- **Objets** — poids en 1/10 de stone comme dans l'original, volume, conteneurs
  imbriqués sans limite de profondeur, empilement, surcharge qui ralentit.
- **Monde** — 96×96 tuiles en chunks de 16×16, bâtiments décrits par des plans
  ASCII (`src/data/town.ts`), toits qui s'escamotent quand on entre.
- **PNJ** — Mireille, Aldric, Basile et Jehan, chacun avec lit, poste de travail
  et habitudes ; ils ouvrent les portes et les referment derrière eux.
- **Dialogues** — sujets cliquables, drapeaux partagés entre personnages : ce
  que Mireille vous apprend débloque un sujet chez Aldric, dont la réponse
  débloque un sujet chez Basile.
- **Quêtes** — deux, avec un journal (`J`) déduit des drapeaux et non d'un état
  parallèle : rendre son luth à Basile, nettoyer le campement pour Jehan.
- **Combat** — temps réel avec pause (`P`), comme l'original ; camps portés par
  la shape, arme choisie dans l'inventaire, butin qui tombe au sol.
- **Groupe** — deux compagnons au maximum, recrutés par le dialogue, qui suivent
  en formation et dégainent avec le meneur.
- **Commerce** — achat et vente à partir de `shape.value`, avec la bourse du
  marchand comme limite réelle.
- **Magie** (`G`) — quatre sorts, un par usage : soigner, éclairer, frapper,
  ouvrir. Le coût est double — des réactifs qui sont des objets ordinaires, et
  de la magie qui revient d'elle-même.
- **Jour/nuit** — lumière ambiante interpolée, réverbères qui s'allument au
  crépuscule, torche transportable.
- **Mobile** — stick virtuel, bouton *Agir* qui vise l'élément interactif le
  plus proche, interface dont les tailles s'adaptent à la densité d'écran et
  au format ; le zoom montre moins de tuiles sur un téléphone que sur un
  ordinateur, sinon les sprites deviennent des confettis.
- **Sauvegarde** — état complet du monde dans le stockage local, reprise
  automatique au lancement ; format versionné.
- **Graphismes** — palette unifiée avec tramage, raccords entre terrains,
  toitures à deux pentes, ombres de contact, eau et flammes animées, puis
  **16 planches de dessins originaux — 104 sprites peints, portraits de
  dialogue compris** — qui remplacent le procédural une cellule à la fois. La
  méthode est détaillée dans [docs/GRAPHISMES.md](docs/GRAPHISMES.md), la
  production des planches et ses prompts dans
  [docs/PLANCHES.md](docs/PLANCHES.md).

Une poignée de débogage est exposée dans la console : `u7.clock.advance(600)`
avance de dix heures, `u7.world` et `u7.avatar` donnent accès à la simulation,
`u7.getSprite` et `u7.getPortrait` permettent de vérifier qu'un dessin chargé
depuis une planche a bien la taille attendue, et `u7.findPath` de demander
« pourquoi ce PNJ ne bouge pas ? » — une question à laquelle l'écran ne répond
pas. Ces accès sont des **accesseurs**, pas des copies : figés, ils pointeraient
vers le monde d'avant après un chargement de partie.

## 6. Aller plus loin

- **[Exult](https://exult.info)** — la référence absolue. Lire son code est le
  meilleur cours disponible sur l'architecture d'Ultima VII, en particulier
  `Game_object`, la gestion des chunks et l'ordre de rendu.
- **[Nuvie](https://nuvie.sourceforge.net)** — même démarche pour Ultima VI.
- La documentation des formats de fichiers d'Ultima VII, maintenue par la
  communauté Exult, décrit `u7map`, `u7chunks`, `shapes.vga` et l'usecode.

## Structure

```
src/core/     boucle, horloge, aléatoire déterministe, constantes
src/world/    registre de shapes, chunks, requêtes spatiales
src/objects/  GameObject (poids, volume, conteneurs) et Actor
src/sim/      pathfinding A*, emplois du temps, IA, combat, groupe
src/script/   usecode (comportements), dialogues, quêtes et commerce
src/render/   art procédural, caméra, tri du peintre, lumière, interface
src/input/    clavier, souris, commandes tactiles
src/data/     la ville, les habitants, les dialogues, les planches
public/       les planches de dessins
tools/        préparation des planches (détourage, réduction)
tests/        136 tests sur la logique pure
docs/         architecture, graphismes, prompts des planches, feuille de route
.github/      vérification et publication automatiques
```

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — le détail des choix techniques
- [docs/GRAPHISMES.md](docs/GRAPHISMES.md) — comment monter les graphismes au
  niveau d'Ultima VII
- [docs/PLANCHES.md](docs/PLANCHES.md) — la production des planches de dessins,
  prompts conservés mot pour mot
- [docs/ROADMAP.md](docs/ROADMAP.md) — ce qui est fait, et dans quel ordre

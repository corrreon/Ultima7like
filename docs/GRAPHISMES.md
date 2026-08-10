# Monter les graphismes au niveau d'Ultima VII

## Le diagnostic, qui n'est pas celui qu'on attend

Ultima VII tourne en **320×200, 256 couleurs, tuiles de 8 pixels**. Techniquement,
c'est moins que ce que fait n'importe quel prototype écrit aujourd'hui. Si votre
jeu a l'air amateur à côté, ce n'est donc ni la résolution ni le nombre de
couleurs qui sont en cause.

L'écart se joue sur six leviers, classés ci-dessous par **rendu visuel obtenu
par unité d'effort**. Les trois premiers coûtent peu et changent tout ; c'est
généralement l'inverse de l'ordre dans lequel on est tenté de s'y prendre.

---

## 1. Une seule palette, une seule lumière

**Le levier le plus rentable, et de loin.**

U7 travaille avec 256 couleurs globales. Chaque sprite pioche dans le même jeu,
donc tout se marie automatiquement. Choisir ses couleurs sprite par sprite — ce
que faisait la première version de ce moteur — donne un ensemble qui jure, même
quand chaque élément pris isolément est correct.

Deux disciplines, à tenir sans exception :

- **Des rampes, pas des couleurs.** `src/render/palette.ts` définit une
  vingtaine de rampes de 5 valeurs (`grass`, `wood`, `metal`, `skin`…). Aucun
  code de dessin n'écrit un code hexadécimal en dur.
- **La lumière vient du haut à gauche.** Hautes lumières en haut à gauche,
  ombres en bas à droite, partout. C'est ce qui donne du volume à des sprites
  minuscules.

Ajoutez-y le **tramage** : avec peu de couleurs, alterner deux teintes en
damier (matrice de Bayer) simule les teintes intermédiaires. C'est la texture
granuleuse caractéristique de l'art VGA — et un dégradé lisse sur du pixel art
se repère instantanément comme « moderne ».

Dernier point, sous-estimé : **les fonds sont désaturés, les accents ne le sont
pas.** Ultima VII pose des magentas, des ors et des rouges francs sur des
pierres et des herbes ternes. Désaturer uniformément — le réflexe quand on
cherche un rendu « d'époque » — donne une image plate. Ce sont les objets qui
portent la couleur.

## 1 bis. Casser la grille — le tramage ne suffit pas

En comparant à de vraies captures d'Ultima VII, un défaut saute aux yeux que
la palette seule ne corrige pas : **leurs sols ne se lisent pas comme des
tuiles.** Un dallage y est un semis de galets de tailles variées dont aucun ne
s'aligne sur la grille ; une pelouse est une masse continue.

Trois causes, et trois remèdes :

**Le tramage de Bayer est périodique.** Il se répète tous les 4 pixels :
parfait pour simuler une teinte intermédiaire sur un petit sprite, désastreux
pour texturer un sol. Une pelouse tramée en Bayer se lit comme un grillage
régulier. Il faut du **bruit apériodique** (une fonction de hachage sur les
coordonnées).

**Le bruit par pixel n'est pas une texture.** Premier essai avec du bruit fin :
de la neige de télévision. L'œil y voit du bruit, pas de la matière. Il faut un
**grain** — échantillonner le bruit tous les 2 pixels produit de petits amas,
ce qui est exactement l'aspect recherché. Même remarque sur l'amplitude : une
bande de valeurs resserrée lit comme une masse, une bande large comme du
poivre et sel.

**Les motifs doivent traverser les bords.** Un galet dessiné près d'un bord est
aussi dessiné de l'autre côté, si bien que la tuile se raccorde à elle-même. Les
formes franchissent alors les jointures au lieu de s'arrêter dessus. Combiné à
six variantes par terrain, cela suffit à faire disparaître le damier.

## 2. Les raccords entre terrains

**Le signe qui trahit un prototype avant même la qualité du dessin.**

Un damier de tuiles carrées aux bords francs ne ressemble à rien de naturel. U7
dessine des tuiles de raccord entre chaque paire de terrains.

On obtient le même résultat sans dessiner des centaines de tuiles à la main
(`src/world/terrain.ts`) : chaque terrain reçoit une **priorité**, et un terrain
plus prioritaire déborde sur ses voisins par un liseré tramé. Huit débordements
suffisent — quatre côtés, quatre coins.

L'ordre suit la logique physique : l'eau est le fond, le sable se dépose sur ses
bords, la terre battue mord sur le sable, l'herbe reprend ses droits sur la
terre. Les sols construits, eux, ne débordent sur rien : une dalle de pierre a
un bord net, et c'est ce qui la fait lire comme un ouvrage humain.

Trois pièges :

- un coin ne se dessine que si les deux côtés adjacents ne débordent pas déjà,
  sinon on empile deux liserés et chaque angle vire au noir ;
- les débordements s'empilent du moins prioritaire au plus prioritaire ;
- **le liseré doit onduler.** Une bande d'épaisseur constante fait tout de
  suite « masque calculé ». Sur la grève d'Ultima VII, l'herbe mord sur le
  sable par avancées et reculs irréguliers : deux octaves de bruit ajoutées à
  la distance suffisent à rompre la régularité.

## 3. La densité de détail

**Un sol nu fait « niveau de test », quelle que soit la qualité des textures.**

Chaque plan d'Ultima VII est encombré. La tentation est de mettre ce détail
*dans* la texture du sol : c'est une erreur. Le premier jet mettait sept touffes
vivement contrastées dans chaque tuile d'herbe ; répété sur tout un écran, cela
ne lit plus comme de l'herbe mais comme du grésillement.

La bonne répartition est l'inverse :

- **le sol reste calme** — peu de contraste, quelques variantes ;
- **le détail vient d'objets posés dessus** — touffes, fleurs, cailloux,
  champignons, caisses, tonneaux.

L'avantage secondaire est considérable : ces objets participent déjà au tri en
profondeur, aux ombres et à l'occlusion, donc ils habitent la scène au lieu de
la tapisser.

## 4. Les ombres de contact

U7 n'en avait pas — ses ombres étaient peintes dans les sprites. Mais une tache
sombre sous chaque objet coûte quasiment rien et résout le défaut le plus visible
d'une vue de trois quarts : sans elle, tout flotte au-dessus du sol.

Une passe entre le sol et les objets, une ellipse à 26 % d'opacité, légèrement
décalée en bas à droite pour rester cohérente avec la direction de la lumière.

## 5. L'animation

Un monde où rien ne bouge a l'air d'une maquette. U7 obtenait ses animations par
**rotation de palette** — l'eau, les flammes, les torches. Le principe est
transposable directement : une shape déclare `anim: { whenFrame, frames, fps }`,
et le rendu fait défiler les frames.

Deux détails qui comptent :

- **déphaser par tuile** pour l'eau, sinon toute la surface clignote d'un bloc
  au lieu d'onduler ;
- **déphaser par identifiant d'objet** pour les flammes, sinon deux âtres dans
  la même pièce crépitent à l'unisson.

## 6. L'architecture, pas les textures

**Ce qui fait la silhouette d'une ville d'Ultima VII, ce sont les toits.**

Un bâtiment coiffé d'un plan plat de tuiles identiques ne ressemble pas à une
maison : il ressemble à une boîte. Le premier passage sur ces graphismes avait
tout amélioré *sauf* ça, et c'est resté le défaut le plus criant.

Une toiture à deux versants ne demande pourtant que d'encoder la position de
chaque tuile : faîtage au milieu, versants de part et d'autre, égout aux
extrémités, rives à gauche et à droite. C'est la **différence de valeur de part
et d'autre du faîtage** qui fait lire la pente. Ajoutez-y une cheminée sur le
faîtage, et le bourg a une silhouette.

Même logique pour les murs : trois variantes réparties de façon déterministe
(panneau nu, croix de Saint-André, fenêtre à meneaux) suffisent. Une façade dont
chaque tuile est identique se lit comme une texture répétée, pas comme un
bâtiment.

### Le piège : ce qui dépasse à travers le toit

Dès que les objets gagnent en hauteur, ils **transpercent la toiture** vue de
l'extérieur — la flamme d'un âtre, une plante, une cheminée. Aucune clé de tri
en profondeur ne peut résoudre le cas : ces objets sont bel et bien plus au nord
que les tuiles de toit censées les masquer.

La solution n'est pas dans le tri mais dans l'occlusion : **ne pas dessiner
l'intérieur d'un bâtiment dont le toit est visible**. C'est correct, c'est ce
que fait le jeu d'origine, et c'est aussi un gain de performance.

## 7. Meubler les intérieurs

Des pièces vides avec quatre meubles font « niveau de test », exactement comme
un sol nu. Les intérieurs d'Ultima VII sont encombrés : bibliothèques, tapis,
plantes en pot, tabourets, vaisselle sur les tables, appliques aux murs.

Deux détails portent beaucoup :

- **un meuble haut adossé à un mur** change la lecture d'une pièce, parce qu'il
  donne une élévation à autre chose que les murs ;
- **une applique murale** posée sur la tuile *devant* le mur avec un lift de 2
  retombe pile sur la maçonnerie — le décalage diagonal de la hauteur fait le
  travail tout seul.

## 8. Les portraits de dialogue

Dans Ultima VII, le portrait fait la moitié de la présence d'un personnage.
Sans lui, une conversation n'est qu'un pavé de texte.

À 44×52 on peut donner des traits, une carnation modelée en trois valeurs et un
vêtement — ce qu'un sprite de 16 pixels ne permet pas. Le gain de présence est
sans commune mesure avec le coût.

Même remarque pour l'interface elle-même : un rectangle d'un pixel fait panneau
de débogage. Un liseré clair en haut à gauche, sombre en bas à droite, et quatre
rivets d'angle suffisent à évoquer un panneau de bois cerclé de métal. C'est la
règle de lumière des sprites, appliquée à l'interface.

## 9. Silhouette et volume dans les sprites

En dernier seulement, parce que c'est le plus coûteux. Trois techniques portent
l'essentiel du résultat :

- **Construire les masses en trois passes** — ombre, corps, hautes lumières,
  chacune décalée vers le haut à gauche. Le feuillage des arbres est fait
  d'amas de disques, pas d'une ellipse unie.
- **Assombrir le contour** du côté opposé à la lumière. Un pixel suffit.
- **Donner une structure aux grandes surfaces.** Un mur uni de 16 pixels de
  large est le plus sûr moyen d'avoir l'air pauvre : sablière éclairée,
  panneaux de torchis tramés, colombages, fenêtre à meneaux.

Piège rencontré ici : mettre un poteau de colombage de chaque côté de la tuile
semble logique, mais les tuiles voisines produisent alors des poteaux jumelés et
la façade se lit comme une palissade. **Un** poteau par tuile donne un rythme
régulier, donc un mur continu.

---

## Pourquoi des tuiles de 16 pixels et non 8

Choix assumé : la densité de détail d'U7, à une résolution de tuile doublée.
Les tuiles de 8 pixels du jeu d'origine supposent un écran de 320×200 ; sur un
écran moderne il faut de toute façon agrandir. Travailler directement en 16
donne de la place pour le détail sans multiplier les facteurs d'échelle.

Le zoom, lui, s'adapte : 24 tuiles visibles en largeur sur ordinateur, 13 sur
téléphone.

## Le plafond honnête de l'art procédural

Tout ce qui précède est fait dans ce dépôt. Il faut être clair sur la suite :
**des sprites générés par code ne rattraperont pas des dessins peints à la
main.** Les artistes d'Origin ont produit des milliers de shapes, et aucun
algorithme ne remplace ce travail.

Ce que le code peut faire, et qui est fait ici, c'est :

1. **les systèmes qui font qu'un dessin lit bien** — raccords, ombres,
   animation, densité, éclairage, tri en profondeur. Ces systèmes manquants,
   même du très bon art a l'air pauvre ;
2. **le chemin de substitution.** `src/render/art.ts` est le seul module qui
   connaisse le format des images, et sa seule interface publique est
   `Sprite { canvas, width, height }`. Le remplacer par un chargeur d'atlas PNG
   ne demande de toucher à rien d'autre.

Le jour où de vrais dessins existent — commandés, achetés en pack, ou faits
soi-même — le moteur les accueille sans modification.

## Ce qui reste à faire pour vraiment y être

Par ordre d'impact :

- [ ] **De vrais dessins**, via un atlas, en remplacement du procédural
- [ ] **Beaucoup plus de shapes** : U7 en compte des milliers, ce dépôt une
      cinquantaine. La variété du mobilier et de la végétation fait à elle
      seule une grande partie de l'effet
- [ ] **Bâtiments de forme libre** — plans en L, appentis, étages, porches,
      lucarnes. Les quatre rectangles actuels limitent la silhouette du bourg
      bien plus que la qualité des tuiles
- [ ] **Objets multi-tuiles** : un tapis de 3×2 est un objet, pas trois tuiles
      côte à côte qui se lisent comme du carrelage
- [ ] **Tri en profondeur rigoureux** — la comparaison topologique d'Exult.
      La clé de tri actuelle suffit tant que les objets restent petits, mais
      plus l'art gagne en hauteur, plus ses défauts se voient : c'est un
      prérequis à une vraie montée en gamme, pas une finition
- [ ] **Décor animé** : moulins, roues à aubes, enseignes qui grincent, fumée
      sortant des cheminées
- [ ] **Transitions d'éclairage par pièce** plutôt qu'un halo global : une
      salle éclairée vue depuis la rue par une porte ouverte
- [ ] **Rotation de palette** pour les effets de lumière, plus fidèle à
      l'original que l'actuel voile en `multiply`

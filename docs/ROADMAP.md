# Feuille de route

L'ordre est celui des dépendances, pas celui de l'envie. Chaque étape suppose
la précédente.

## Fait — le socle (v0.1)

- [x] Boucle à pas fixe, horloge de jeu, aléatoire déterministe
- [x] Registre de shapes, objets avec poids / volume / conteneurs récursifs
- [x] Monde en chunks, requêtes spatiales, franchissabilité
- [x] Rendu : terrain, tri du peintre, décalage diagonal de la hauteur, toits
      escamotables
- [x] Pathfinding A\* avec tolérance et gestion des portes
- [x] Emplois du temps et IA de PNJ
- [x] Usecode par closures avec repli sur les drapeaux de shape
- [x] Interface d'inventaire à manipulation directe, conteneurs imbriqués
- [x] Cycle jour/nuit et sources de lumière
- [x] Dialogues à sujets avec drapeaux partagés

## Fait — la persistance (v0.3)

La sauvegarde était l'étape structurante : elle force à rendre l'état
sérialisable, ce qui révèle où cet état se cache. Verdict, détaillé dans
ARCHITECTURE.md : le modèle d'objet a tenu sans rien démêler.

- [x] Sérialisation de l'arbre d'objets (identifiants stables, lien parent
      reconstruit à la lecture)
- [x] Acteurs, horloge, drapeaux de conversation, régions
- [x] Terrain compressé par plages
- [x] Numéro de version, avec point d'accroche pour les migrations
- [x] Sauvegarde automatique, reprise au lancement, `F5` / `F9` / `F8`
- [x] Empreinte de la carte de départ, calculée sur le monde neuf : une partie
      issue d'une carte différente est refusée au lieu d'être reprise dans un
      monde périmé
- [ ] Reste ouvert : un état explicite pour les scripts d'usecode non
      atomiques, le jour où il faudra sauvegarder au milieu d'une cinématique

## Fait — le chemin vers de vrais dessins (v0.4)

- [x] Tuiles portées de 16 à 32 px, sans redessiner l'existant : les sprites
      procéduraux gardent un repère de 16 px et sont agrandis au plus proche
      voisin
- [x] Chargeur d'atlas : découpage d'une grille, recadrage sur le contenu réel,
      détourage du fond magenta, mise à l'échelle en tuiles
- [x] Remplacement progressif et tolérant — une planche manquante n'empêche pas
      de jouer
- [x] Déclaration des neuf planches : 45 cellules affectées à des shapes
- [x] Les neuf planches d'objets, détourées et posées
- [x] Personnages : cadre commun entre frames (`group`), miroir du profil
      (`mirror`), portraits de dialogue (`portrait`), portrait cherché au nom
      du personnage avant celui de son espèce
- [x] Portraits des neuf visages, et les six habitants dessinés, marche
      comprise — 104 sprites peints en tout

## Fait — la première quête jouable (v0.5)

Le socle savait déjà tenir des drapeaux partagés ; il lui manquait de quoi
boucler. Une quête complète demande trois choses qu'aucun dialogue ne fournit :
une condition sur ce que le joueur **porte**, un effet qui **déplace un objet**
d'un inventaire à l'autre, et une **réaction du monde** qui ne soit pas une
ligne de texte.

- [x] Condition `carries` sur un sujet : elle interroge l'inventaire à chaque
      affichage, et fouille les conteneurs imbriqués
- [x] Effets de quête dans un module pur, sans dépendance au rendu — c'est ce
      qui rend une quête traversable en test
- [x] Journal de quêtes (`J`), déduit des drapeaux et non d'un état parallèle
- [x] Réaction du monde : un PNJ qui travaille avec un luth chante au lieu
      d'annoncer qu'il se met à l'ouvrage
- [x] Traversée de bout en bout en test, plus un contrôle d'intégrité sur tous
      les arbres de dialogue

Deux blocages réels sont sortis de cette traversée, invisibles jusque-là : le
sujet qui démarrait la quête était inatteignable, et les PNJ n'annonçaient
jamais leur arrivée à leur poste.

## Fait — le combat (v0.6)

Temps réel avec pause, comme l'original : les coups tombent pendant que le
monde continue, et la pause sert à reprendre la main. La résolution vit dans
`src/sim/combat.ts`, module pur — ni rendu, ni horloge, ni monde — donc
entièrement vérifiable à graine fixée.

- [x] Camps portés par la shape (`faction`, `combatant`, `attack`, `defense`) :
      un brigand est hostile par espèce, la sauvegarde n'a rien de plus à retenir
- [x] Arme choisie dans l'inventaire, conteneurs imbriqués compris
- [x] Poursuite, cadence, coup fatal, butin qui tombe au sol
- [x] Pause (`P`) : les commandes restent lues, le monde est figé
- [x] Jauge de vie et mention « arme au clair »
- [x] Un campement de brigands au sud-ouest

Deux réglages sont sortis de l'essai en jeu, pas de la théorie : l'Avatar
partait sans arme et frappait pour deux points, ce qui rendait le premier
combat perdu d'avance — d'où la dague de départ, qui réemploie une case
jusque-là inutilisée de la planche d'armes. Et les brigands, campés à trois
tuiles les uns des autres avec une vigilance de sept, chargeaient toujours en
bloc : c'est le **nombre d'adversaires simultanés**, et non les dégâts, qui
décide d'un combat en temps réel.

## Fait — le groupe (v0.7)

Le combat rendait la chose nécessaire : un homme seul contre trois n'a aucune
chance, quel que soit le réglage des dégâts. Deux compagnons au maximum — ce
n'est pas une limite technique mais une limite de contenu, au-delà il n'y a
plus assez d'habitants nommés pour que recruter veuille dire quelque chose.

- [x] Recrutement et congé par le dialogue, avec une raison chacun : Jehan
      accompagne qui va au campement, Basile suit qui lui a rendu son luth
- [x] Formation qui tourne avec le meneur, les compagnons dans son dos — un
      compagnon qui marche devant bloque le passage, les acteurs étant solides
- [x] Le groupe dégaine et rengaine avec le meneur ; un barde reste désarmé
- [x] Jauge de vie par compagnon
- [x] Menu tactile (sauver, charger, recommencer) : sans lui, une partie
      bloquée l'était définitivement au doigt, faute de F5, F9 et F8
- [x] Appartenance au groupe sauvegardée — un groupe qui se disperserait au
      rechargement obligerait à refaire toutes les conversations

Mesuré en jeu : à deux, un brigand tombe en cinq secondes contre dix-huit en
solo, et l'Avatar y laisse seize points de vie au lieu de vingt-quatre.

Deux manques signalés à l'usage et comblés ensuite : le campement n'était
mentionné dans aucune quête — le journal restait muet alors que Jehan en
parlait — et rien ne menait à lui. Il a donc fallu une quête complète, un
sentier qui parte de la route, et un feu de camp qui serve de repère la nuit.

## Fait — le commerce (v0.8)

Le troisième verbe du jeu, après marcher et parler. Il tient dans un module pur
(`src/script/commerce.ts`) : ce qu'un marchand accepte, à quel prix il l'achète
et le revend, et ce que la bourse permet.

- [x] Prix dérivés de `shape.value`, avec une marge : on revend moins cher
      qu'on n'achète, sinon l'aller-retour est une machine à or
- [x] Bourse du marchand : il ne peut pas acheter au-delà de ce qu'il a
- [x] Panneau d'échange, au doigt comme à la souris
- [x] Le marchand refuse ce qu'il ne peut pas porter

Deux défauts sortis de l'essai, pas de la théorie : `Actor.canAccept` répondait
toujours oui, un marchand acceptait donc une charrette entière ; et le panneau
laissait les clics le traverser jusqu'au monde, si bien qu'acheter faisait
marcher l'Avatar. Un panneau modal doit **consommer** ce qu'il reçoit.

## Fait — ramasser et piller (v0.9)

- [x] Ramassage en un geste : « utiliser » un objet transportable posé au sol le
      range directement, au lieu du prendre-en-main / ouvrir-le-sac / déposer
      d'origine — trois gestes pour une pièce d'or, et rien d'équivalent au
      doigt
- [x] Rangement qui choisit sa place : un tas de même nature d'abord, un
      conteneur qui a la place ensuite, l'inventaire nu en dernier
- [x] Butin au campement des brigands — la caisse, le sac et le tonneau y
      étaient posés en décor et vides, ce qui faisait défendre par trois hommes
      un endroit où il n'y avait rien
- [x] Un test refuse tout conteneur vide à moins de six tuiles du feu

## Fait — de quoi peupler une ville (v1.0)

Trois travaux qui n'en font qu'un : le pathfinding empêchait de peupler, les
habitants génériques donnent la profondeur, le quartier d'habitation leur donne
un chez-soi.

- [x] **Pathfinding**, mesuré sur le pire tick — celui où tous les habitants se
      remettent en route en même temps :

      |            | 8 hab. | 40 hab. | 120 hab. |
      |------------|--------|---------|----------|
      | avant      | 125 ms | 752 ms  | 2125 ms  |
      | après      |  20 ms |  21 ms  |   21 ms  |

      Tas binaire (20 % seulement — mon diagnostic était faux), memo par
      recherche sur les cases infranchissables (le gros du gain), et un budget
      de deux chemins par image qui rend la dépense **indépendante du nombre
      d'habitants**. C'est cette dernière propriété qui débloque tout le reste.
- [x] **Habitants quelconques** : dix métiers, un fonds de rumeurs conditionné
      par les drapeaux de quête. La profondeur vient de ce que les gens
      *savent*, pas du nombre de répliques
- [x] **Quartier d'habitation** : huit maisons, seize lits, une rue. Le nombre
      d'habitants n'est plus une constante mais une conséquence de la carte —
      loger plus de monde demande de bâtir
- [x] **Se soigner** : manger rend peu et tout de suite, dormir rend tout et
      consomme la nuit. Sans quoi le combat n'avait pas de seconde moitié
- [x] **Format de carte** : les plans quittent le code pour `data/plans.ts`, la
      légende devient une table plutôt qu'un `switch`, et `validerPlans` refuse
      une carte dont deux bâtiments se chevauchent, dont une ligne est trop
      courte, dont un symbole est inconnu ou dont un bâtiment n'a pas de porte.
      C'est le chevauchement qui comptait : à cinq bâtiments posés à la main il
      se voit, à soixante le second écrase le premier en silence
- [ ] Reste ouvert : les habitants n'ont pas de portrait propre, et le quartier
      est fait de huit maisons identiques

## Étape suivante — la boucle de jeu
- [ ] **Faim et fatigue** — les valeurs `food` existent déjà sur les shapes
- [ ] **Magie** : réactifs, grimoire, sorts comme usecode
- [ ] **Serrures** : les clefs ont déjà une `quality`, rien ne s'en sert

## Puis — l'échelle

Tout ce qui précède tient sur une carte de 96×96. Passer à la taille d'Ultima
VII (3072×3072) demande :

- [ ] Streaming réel des chunks : charger et décharger selon la position
- [ ] Format de carte sur disque plutôt que des plans ASCII compilés
- [ ] Tas binaire pour A\*, et graphe de navigation hiérarchique
- [ ] Découpage des PNJ en actifs / dormants selon la distance
- [ ] Reprise du tri en profondeur, vers la comparaison topologique d'Exult

## Enfin — l'outillage et la finition

- [ ] Éditeur de cartes (Exult a le sien, tout projet sérieux finit par en
      avoir besoin)
- [ ] Éditeur de dialogues et d'emplois du temps
- [x] Chargement de sprites depuis un atlas, en remplacement de l'art
      procédural — sans toucher au moteur, seule l'interface `Sprite` compte.
      Prompts et méthode conservés dans [PLANCHES.md](PLANCHES.md)
- [ ] Son et musique
- [x] Sauvegarde automatique
- [ ] Options, remappage des touches

## Non prévu

Lire les fichiers de données d'Ultima VII. C'est le domaine d'Exult, qui le
fait bien, et cela ferait de ce dépôt un projet entièrement différent — avec
les contraintes juridiques qui vont avec.

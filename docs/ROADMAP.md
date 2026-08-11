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
- [ ] Les planches elles-mêmes

## Étape suivante — la boucle de jeu

- [ ] **Combat** en temps réel avec pause, comme l'original : dégâts depuis
      `shape.damage`, portée, mode de combat par acteur
- [ ] **Groupe** : compagnons recrutables, formation, IA de suivi
- [ ] **Faim et fatigue** — les valeurs `food` existent déjà sur les shapes
- [ ] **Commerce** : achat/vente à partir de `shape.value`, bourse des PNJ
- [ ] **Magie** : réactifs, grimoire, sorts comme usecode

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
- [ ] Chargement de sprites depuis un atlas, en remplacement de l'art
      procédural — sans toucher au moteur, seule l'interface `Sprite` compte
- [ ] Son et musique
- [ ] Sauvegarde automatique, options, remappage des touches

## Non prévu

Lire les fichiers de données d'Ultima VII. C'est le domaine d'Exult, qui le
fait bien, et cela ferait de ce dépôt un projet entièrement différent — avec
les contraintes juridiques qui vont avec.

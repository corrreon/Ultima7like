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

## Étape suivante — rendre le monde persistant

**La sauvegarde d'abord.** Elle est structurante : elle force à rendre l'état du
jeu sérialisable, ce qui révèle immédiatement les endroits où l'état est caché
dans des closures ou des références circulaires. La repousser coûte cher.

- [ ] Sérialisation de l'arbre d'objets (parents / contenus, identifiants
      stables)
- [ ] Sauvegarde des acteurs, de l'horloge et des drapeaux de conversation
- [ ] Chargement, avec numéro de version et migration
- [ ] Conséquence probable : remplacer les closures d'usecode par un état
      explicite pour les scripts non atomiques (voir ARCHITECTURE.md)

## Ensuite — la boucle de jeu

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

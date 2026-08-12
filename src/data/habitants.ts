import { Actor } from '../objects/actor';
import { GameObject } from '../objects/gameobject';
import type { Rng } from '../core/rng';
import type { ScheduleEntry } from '../sim/schedule';
import { defineConversation, type Topic } from '../script/conversation';

/**
 * Les habitants quelconques.
 *
 * Le bourg comptait quatre personnes, toutes nommees, toutes porteuses d'une
 * quete. C'est ce qui fait qu'il ressemble a un decor de theatre : dans une
 * ville, l'immense majorite des gens ne sont pas des personnages.
 *
 * **C'est aussi la lecon d'Ultima VII, et elle est economique.** Ses villes
 * paraissent peuplees parce que la plupart de leurs habitants coutent presque
 * rien : un nom, un metier, un emploi du temps, trois repliques. Ecrire
 * quarante arbres de dialogue est impossible ; en generer quarante a partir de
 * dix metiers et d'un fonds de rumeurs ne coute rien et suffit.
 *
 * La profondeur ne vient pas du nombre de repliques mais de **ce que les gens
 * savent**. Un passant qui mentionne les brigands, le luth perdu ou le prix du
 * fer transforme une liste de figurants en une ville qui se tient. D'ou le
 * fonds de rumeurs partage, conditionne par les memes drapeaux que les quetes :
 * ce qu'on entend dans la rue change a mesure qu'on avance.
 */

/** Prenoms possibles, feminins et masculins separes pour choisir le sprite. */
const PRENOMS_F = [
  'Aude', 'Berthe', 'Colette', 'Eloise', 'Guenievre', 'Isabeau', 'Jeanne',
  'Mahaut', 'Perrine', 'Sibylle', 'Yvette', 'Alix',
];
const PRENOMS_H = [
  'Anselme', 'Bertrand', 'Colin', 'Enguerrand', 'Firmin', 'Gautier', 'Hugues',
  'Lambert', 'Mathis', 'Renaud', 'Thibaut', 'Ancel',
];

/** Surnoms : dans un bourg, on se distingue par un trait, pas par un patronyme. */
const SURNOMS = [
  'le Grand', 'le Roux', 'la Boiteuse', 'le Cadet', 'la Sage', 'le Borgne',
  'la Rousse', 'le Vieux', 'la Jeune', 'le Taciturne',
];

interface Metier {
  id: string;
  /** Ce que la personne repond quand on lui demande ce qu'elle fait. */
  travail: string;
  /** Sa replique de metier, celle qui la distingue d'un figurant. */
  replique: string;
  /** Ou elle passe sa journee, en decalage par rapport a la place centrale. */
  poste: { dx: number; dy: number; radius: number };
}

/**
 * Les metiers.
 *
 * Chacun donne un lieu de travail et une replique. Dix suffisent pour que
 * quarante habitants ne se repetent pas de facon visible — d'autant que le
 * prenom, le surnom et la rumeur varient independamment.
 */
const METIERS: Metier[] = [
  {
    id: 'marchand',
    travail: 'Je tiens l\'etal du marche, quand j\'ai de quoi le garnir.',
    replique: 'Le sel a double depuis l\'automne. On m\'accuse, mais je ne fais que repasser le prix.',
    poste: { dx: 2, dy: -1, radius: 2 },
  },
  {
    id: 'meunier',
    travail: 'Je porte le grain a la halle, et j\'en rapporte la farine.',
    replique: 'Trois sacs par jour, et le dos qui va avec. Mon pere en portait cinq, dit-il.',
    poste: { dx: -20, dy: 8, radius: 3 },
  },
  {
    id: 'tisserande',
    travail: 'Je file et je tisse. Tout ce que vous voyez sur les epaules d\'ici est passe par mes mains.',
    replique: 'La laine de la vallee est rude, mais elle tient trente ans. Celle du sud est douce et se troue en deux hivers.',
    poste: { dx: -3, dy: 2, radius: 2 },
  },
  {
    id: 'charpentier',
    travail: 'Je taille les poutres et je repare les toits.',
    replique: 'Le toit de la forge a bouge cet hiver. Aldric dit que non. Aldric n\'est pas monte dessus.',
    poste: { dx: 12, dy: -4, radius: 3 },
  },
  {
    id: 'jardiniere',
    travail: 'Je tiens le potager derriere la halle, et je vends le surplus.',
    replique: 'Les choux ont pris, les feves non. C\'est toujours l\'un ou l\'autre, jamais les deux.',
    poste: { dx: -22, dy: 10, radius: 3 },
  },
  {
    id: 'pecheur',
    travail: 'Je pose des nasses dans l\'etang. Il y a de la carpe, si on est patient.',
    replique: 'L\'etang est bas cette annee. Quand il baisse, on voit les pierres d\'un vieux mur au fond. Personne ne sait de quoi.',
    poste: { dx: 28, dy: 18, radius: 3 },
  },
  {
    id: 'bucheron',
    travail: 'Je coupe au sud et je rentre le bois avant la nuit.',
    replique: 'Je ne descends plus seul vers le sud-ouest. On y entend des voix qui ne sont pas d\'ici.',
    poste: { dx: -8, dy: 14, radius: 3 },
  },
  {
    id: 'colporteur',
    travail: 'Je vais d\'un bourg a l\'autre avec ce que je peux porter.',
    replique: 'La route de l\'ouest etait sure il y a deux ans. Aujourd\'hui je fais le tour par le nord, et cela me coute deux jours.',
    poste: { dx: 0, dy: -3, radius: 4 },
  },
  {
    id: 'servante',
    travail: 'Je donne un coup de main a l\'auberge quand la salle se remplit.',
    replique: 'Mireille paie mal mais nourrit bien. A tout prendre, je prefere.',
    poste: { dx: -12, dy: -11, radius: 2 },
  },
  {
    id: 'palefrenier',
    travail: 'Je m\'occupe des betes qu\'on laisse ici en passant.',
    replique: 'Un cheval sait avant vous si la route est mauvaise. Celui d\'hier refusait d\'aller vers l\'ouest.',
    poste: { dx: 10, dy: 3, radius: 2 },
  },
];

/**
 * Le fonds de rumeurs.
 *
 * C'est lui qui fait la difference entre quarante figurants et une ville. Une
 * rumeur peut exiger un drapeau (`requires`) ou au contraire disparaitre une
 * fois la chose faite (`tant_que`) : ce qu'on entend dans la rue suit donc
 * l'avancement de la partie, sans qu'aucune quete n'ait a le savoir.
 */
interface Rumeur {
  texte: string;
  requires?: string[];
  /** La rumeur ne se dit plus une fois ce drapeau pose. */
  tant_que?: string;
}

const RUMEURS: Rumeur[] = [
  {
    texte: 'On dit qu\'une bande s\'est installee au sud-ouest, sous les arbres. Le garde en parle a qui veut l\'entendre.',
    tant_que: 'camp_nettoye',
  },
  {
    texte: 'Le sentier du sud-ouest ne menait nulle part il y a deux ans. Maintenant il est battu. Battu par qui ?',
    tant_que: 'camp_nettoye',
  },
  {
    texte: 'Il parait que le sud-ouest est redevenu sur. Ce n\'est pas trop tot.',
    requires: ['camp_nettoye'],
  },
  {
    texte: 'Basile a encore perdu son luth. C\'est la troisieme fois cette annee. La troisieme.',
    tant_que: 'luth_rendu',
  },
  {
    texte: 'Basile a retrouve son luth, alors la salle sera pleine ce soir. Venez tot si vous voulez un banc.',
    requires: ['luth_rendu'],
  },
  { texte: 'Aldric a refuse une commande la semaine derniere. Aldric ne refuse jamais rien. Cela m\'a donne a penser.' },
  { texte: 'Le puits de la place a un gout de fer depuis le degel. On le boit quand meme.' },
  { texte: 'Mireille tient les comptes de la moitie du bourg dans sa tete. Personne n\'a jamais pu la prendre en defaut.' },
  { texte: 'On a vu de la lumiere sur la colline la nuit derniere. Sans doute un feu de berger. Sans doute.' },
  { texte: 'Le prix du fer monte. Quand le fer monte, c\'est qu\'on se bat quelque part.' },
];

/**
 * Emploi du temps d'un habitant quelconque.
 *
 * La journee suit celle du bourg : on travaille, on mange, on flane le soir, on
 * dort. Les heures sont decalees d'un habitant a l'autre — un bourg dont tout
 * le monde se leve a la meme minute se lit comme une horloge, pas comme une
 * ville.
 */
function emploiDuTemps(
  metier: Metier,
  place: { tx: number; ty: number },
  taverne: { tx: number; ty: number },
  logis: { tx: number; ty: number },
  rng: Rng,
): ScheduleEntry[] {
  const decalage = rng.int(0, 1);
  const poste = {
    tx: place.tx + metier.poste.dx,
    ty: place.ty + metier.poste.dy,
  };
  return [
    { hour: 6 + decalage, activity: 'work', ...poste, radius: metier.poste.radius },
    { hour: 12, activity: 'eat', tx: taverne.tx, ty: taverne.ty },
    { hour: 13 + decalage, activity: 'work', ...poste, radius: metier.poste.radius },
    { hour: 19, activity: 'wander', tx: place.tx, ty: place.ty, radius: 4 },
    { hour: 22 + decalage, activity: 'sleep', tx: logis.tx, ty: logis.ty },
  ];
}

/** Construit l'arbre de dialogue d'un habitant quelconque. */
function conversation(id: string, nom: string, metier: Metier, rumeur: Rumeur): void {
  const topics: Topic[] = [
    {
      id: 'nom',
      label: 'Votre nom',
      text: `${nom}. Je ne suis personne d'important, si c'est ce que vous cherchez.`,
      once: true,
    },
    { id: 'travail', label: 'Votre metier', text: metier.travail, reveals: ['metier_detail'] },
    { id: 'metier_detail', label: 'Parlez-m\'en', text: metier.replique, once: true },
    {
      id: 'rumeur',
      label: 'Les nouvelles',
      text: rumeur.texte,
      ...(rumeur.requires ? { requires: rumeur.requires } : {}),
    },
    // `ends` ferme le panneau. Sans lui, « Au revoir » repond poliment et
    // laisse la conversation ouverte : plus aucun moyen d'en sortir par le
    // dialogue. Le texte reste vide, la phrase d'adieu etant celle de la
    // conversation.
    { id: 'adieu', label: 'Prendre conge', text: '', ends: true },
  ];

  // La rumeur perimee est remplacee par une phrase neutre plutot que retiree :
  // un sujet qui disparait de la liste se remarque, une reponse plate non.
  if (rumeur.tant_que) {
    topics.push({
      id: 'rumeur_apres',
      label: 'Les nouvelles',
      text: 'Rien de neuf depuis la derniere fois.',
      requires: [rumeur.tant_que],
    });
  }

  defineConversation({
    id,
    greeting: `${rng_bonjour(nom)}`,
    farewell: 'Portez-vous bien.',
    initial: rumeur.tant_que
      ? ['nom', 'travail', 'rumeur', 'rumeur_apres', 'adieu']
      : ['nom', 'travail', 'rumeur', 'adieu'],
    topics,
  });
}

/** Salutation, variee sur le nom pour ne pas entendre la meme partout. */
function rng_bonjour(nom: string): string {
  const debut = nom.charCodeAt(0) % 4;
  if (debut === 0) return 'Bonjour a vous.';
  if (debut === 1) return 'Vous n\'etes pas d\'ici, vous.';
  if (debut === 2) return 'Oui ? Je vous ecoute.';
  return 'Bien le bonjour.';
}

export interface LieuxDuBourg {
  place: { tx: number; ty: number };
  taverne: { tx: number; ty: number };
  /**
   * Les lits du quartier d'habitation, dans l'ordre.
   *
   * Ils viennent de la carte et non d'une liste tenue en double : deplacer une
   * maison ne demande rien d'autre. S'il en manque, les derniers habitants
   * dorment dehors — ce qui se verra, et c'est preferable a un plantage.
   */
  lits: Array<{ tx: number; ty: number }>;
}

/**
 * Peuple le bourg d'habitants quelconques.
 *
 * Ils sont crees mais **pas ajoutes au monde** : c'est a l'appelant de le
 * faire, comme pour les personnages nommes, ce qui garde cette fonction
 * verifiable sans monde complet.
 */
export function habitantsQuelconques(
  combien: number,
  lieux: LieuxDuBourg,
  rng: Rng,
): Actor[] {
  const habitants: Actor[] = [];

  for (let i = 0; i < combien; i++) {
    const metier = METIERS[i % METIERS.length]!;
    const femme = rng.chance(0.5);
    const prenoms = femme ? PRENOMS_F : PRENOMS_H;
    const prenom = prenoms[(i * 7 + rng.int(0, prenoms.length - 1)) % prenoms.length]!;
    // Un surnom sur deux : tout le monde n'en a pas, et c'est ce qui fait que
    // ceux qui en ont un se remarquent.
    const nom = rng.chance(0.5) ? `${prenom} ${SURNOMS[rng.int(0, SURNOMS.length - 1)]!}` : prenom;

    const id = `habitant_${i}`;
    const rumeur = RUMEURS[rng.int(0, RUMEURS.length - 1)]!;
    conversation(id, nom, metier, rumeur);

    // Chacun son lit, pris dans le quartier d'habitation. C'est ce qui fait la
    // difference entre des figurants qui s'eteignent le soir et des gens qui
    // rentrent chez eux : a vingt-deux heures, la rue se vide et les fenetres
    // s'allument dans les maisons, pas au milieu d'un champ.
    const lit = lieux.lits[i % Math.max(1, lieux.lits.length)];
    const logis = lit ?? {
      tx: lieux.place.tx + rng.int(-14, 14),
      ty: lieux.place.ty + rng.int(-10, 10),
    };

    const emploi = emploiDuTemps(metier, lieux.place, lieux.taverne, logis, rng);
    const depart = emploi[0]!;

    const habitant = new Actor({
      shape: femme ? 'townswoman' : 'townsman',
      displayName: nom,
      tx: depart.tx,
      ty: depart.ty,
      conversationId: id,
      speed: 2.2 + rng.next() * 0.6,
      schedule: emploi,
    });
    // Une bourse, pour qu'ils puissent acheter et se faire voler comme les
    // autres. Un habitant sans un sou n'est pas un habitant.
    habitant.add(new GameObject({ shape: 'gold', quantity: rng.int(2, 18) }));
    habitants.push(habitant);
  }

  return habitants;
}

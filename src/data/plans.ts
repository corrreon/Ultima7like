/**
 * Les plans des batiments, et la legende qui les lit.
 *
 * Un plan est une grille de caracteres : `#` un mur, `D` une porte, `=` du
 * plancher nu, une lettre un meuble, l'espace « hors du batiment ». C'est la
 * forme intermediaire naturelle entre le code en dur et un vrai editeur de
 * cartes — lisible, modifiable sans rien recompiler mentalement, et surtout
 * **verifiable**.
 *
 * Deux choses ont motive de sortir ces plans du code, et aucune des deux n'est
 * cosmetique.
 *
 * **La legende etait un `switch`.** Ajouter un meuble demandait donc de
 * modifier le poseur de batiments. Ici c'est une table : un symbole est une
 * donnee, comme le plan qui l'emploie.
 *
 * **Rien ne verifiait les plans.** A cinq batiments places a la main, une
 * origine mal calculee se voit ; a soixante, deux batiments se chevauchent et
 * le second ecrase silencieusement le premier — on obtient une piece sans
 * porte, ou un lit dans un mur, sans le moindre message. `validerPlans` refuse
 * ces cartes-la en disant lequel et ou.
 */

/** Un batiment : sa grille de caracteres et l'origine ou la poser. */
export interface Plan {
  name: string;
  ox: number;
  oy: number;
  rows: string[];
}

/** Ce que pose un caractere de plan. */
export interface Symbole {
  shape: string;
  /**
   * Frame a employer, calculee depuis la position de la case.
   *
   * Elle depend des coordonnees et non d'un tirage : deux generations de la
   * meme carte doivent donner exactement le meme monde, ce dont l'empreinte de
   * sauvegarde depend.
   */
  frame?: (tx: number, ty: number) => number;
}

/** Plancher nu : la case appartient au batiment mais ne porte rien. */
export const SOL = '=';
/** Hors du batiment : c'est ce qui permet les plans en L. */
export const DEHORS = ' ';

export const LEGENDE: Readonly<Record<string, Symbole>> = {
  '#': {
    shape: 'wall',
    // Trois variantes reparties de facon deterministe : panneau nu, croix de
    // Saint-Andre, fenetre a meneaux. Une facade dont chaque tuile est
    // identique se lit comme une texture repetee, pas comme un batiment.
    frame: (tx, ty) => {
      const hash = (tx * 7 + ty * 13) % 11;
      return hash === 0 ? 2 : hash === 4 || hash === 8 ? 1 : 0;
    },
  },
  D: { shape: 'door' },
  t: { shape: 'table' },
  c: { shape: 'chair' },
  b: { shape: 'bed' },
  C: { shape: 'chest' },
  B: { shape: 'barrel' },
  a: { shape: 'anvil' },
  h: { shape: 'hearth' },
  p: { shape: 'pot' },
  o: { shape: 'stool' },
  k: {
    shape: 'bookshelf',
    // Les meubles d'une meme rangee sont espaces de deux tuiles : une parite
    // sur `tx + ty` leur donne a tous la meme frame et l'alternance n'alterne
    // jamais. D'ou la division par deux.
    frame: (tx, ty) => ((tx >> 1) + ty) % 2,
  },
};

/**
 * Prefixe des regions du quartier d'habitation.
 *
 * Les habitants quelconques y trouvent leur lit. On les reconnait par leur nom
 * plutot que par une liste de coordonnees tenue en double : la carte reste la
 * seule source de verite, et deplacer une maison ne demande rien d'autre.
 */
export const LOGIS_PREFIX = 'Logis';

/** Les lieux publics : les batiments ecrits a la main, un par usage. */
export const BATIMENTS_PUBLICS: Plan[] = [
  {
    name: 'Taverne du Chat Endormi',
    ox: 26,
    oy: 24,
    rows: [
      '#############',
      '#===k=k=k===#',
      '#=b=======b=#',
      '#=t=c===t=c=#',
      '#===========#',
      '#=C===h===B=#',
      '#=o=====p=o=#',
      '#=t=c=====t=#',
      '#####D#######',
    ],
  },
  {
    name: 'Forge d\'Aldric',
    ox: 52,
    oy: 26,
    rows: [
      '###########',
      '#=========#',
      '#=b=====C=#',
      '#=========#',
      '#=a===h===#',
      '#=========#',
      '#=B=====t=#',
      '#=====o===#',
      '#####D#####',
    ],
  },
  {
    name: 'Maison de Basile',
    ox: 30,
    oy: 48,
    rows: [
      '####D#####',
      '#=====k==#',
      '#=b====t=#',
      '#========#',
      '#=C====c=#',
      '#=p====o=#',
      '#=t====B=#',
      '##########',
    ],
  },
  {
    name: 'Corps de garde',
    ox: 54,
    oy: 48,
    rows: [
      '####D####',
      '#=======#',
      '#=b===C=#',
      '#=======#',
      '#=t===c=#',
      '#=o===p=#',
      '#########',
    ],
  },
  {
    // Plan en L. Une case blanche n'appartient pas au batiment : c'est ce qui
    // libere la silhouette du bourg des quatre rectangles de depart. La
    // toiture s'adapte toute seule, chaque colonne ayant son propre faitage.
    name: 'Halle au grain',
    ox: 14,
    oy: 44,
    rows: [
      '#######     ',
      '#=====#     ',
      '#=k=t=#     ',
      '#=====######',
      '#=C========#',
      '#=========o#',
      '#=B=====t==#',
      '######D#####',
    ],
  },
];

/**
 * Le quartier d'habitation.
 *
 * Les batiments publics sont des lieux de travail ; personne n'habitait nulle
 * part. Seize habitants qui rentrent le soir dans un champ, ce n'est pas un
 * bourg, c'est un campement.
 *
 * Huit maisons identiques, deux rangees de part et d'autre d'une rue. Elles se
 * ressemblent, et c'est voulu : dans un bourg, les maisons ordinaires se
 * ressemblent. Ce qui les distingue est ce que le mobilier procedural y pose,
 * et surtout qui y dort.
 *
 * Deux lits chacune, soit seize places — le compte exact des habitants
 * quelconques. Loger davantage de monde demande donc de batir, ce qui est la
 * bonne contrainte : une ville se peuple en construisant.
 */
export function quartierResidentiel(): Plan[] {
  // Porte au sud pour la rangee du nord, au nord pour celle du sud : toutes
  // donnent sur la rue, comme des maisons qui bordent une voie.
  const versLeSud = [
    '#######',
    '#=====#',
    '#=b=b=#',
    '#=====#',
    '#=t=c=#',
    '#=o===#',
    '###D###',
  ];
  const versLeNord = [
    '###D###',
    '#=====#',
    '#=b=b=#',
    '#=====#',
    '#=t=c=#',
    '#=o===#',
    '#######',
  ];

  const maisons: Plan[] = [];
  const colonnes = [10, 18, 26, 34];
  for (const [rangee, oy] of [[0, 6], [1, 16]] as const) {
    for (const [index, ox] of colonnes.entries()) {
      maisons.push({
        name: `${LOGIS_PREFIX} ${rangee * colonnes.length + index + 1}`,
        ox,
        oy,
        rows: rangee === 0 ? versLeSud : versLeNord,
      });
    }
  }
  return maisons;
}

/** Tous les plans de la carte, dans l'ordre de pose. */
export function tousLesPlans(): Plan[] {
  return [...BATIMENTS_PUBLICS, ...quartierResidentiel()];
}

/**
 * Verifie un jeu de plans. Retourne la liste des problemes, vide si tout va
 * bien.
 *
 * On ne se contente pas de lever a la premiere erreur : quand on vient de
 * deplacer un quartier, on veut voir d'un coup tout ce qui casse.
 */
export function validerPlans(plans: readonly Plan[], tailleCarte: number): string[] {
  const problemes: string[] = [];
  /** Tuile -> nom du batiment qui l'occupe deja. */
  const occupees = new Map<number, string>();

  for (const plan of plans) {
    if (plan.rows.length === 0) {
      problemes.push(`${plan.name} : plan vide`);
      continue;
    }

    const largeur = plan.rows[0]!.length;
    let porte = false;

    for (const [row, texte] of plan.rows.entries()) {
      if (texte.length !== largeur) {
        problemes.push(
          `${plan.name} : la ligne ${row} fait ${texte.length} caracteres au lieu de ${largeur}`,
        );
      }

      for (const [col, char] of [...texte].entries()) {
        if (char === DEHORS) continue;
        if (char === 'D') porte = true;
        if (char !== SOL && !(char in LEGENDE)) {
          problemes.push(`${plan.name} : symbole inconnu « ${char} » en ligne ${row}, colonne ${col}`);
          continue;
        }

        const tx = plan.ox + col;
        const ty = plan.oy + row;
        if (tx < 0 || ty < 0 || tx >= tailleCarte || ty >= tailleCarte) {
          problemes.push(`${plan.name} : deborde de la carte en ${tx},${ty}`);
          continue;
        }

        // Le chevauchement est le defaut qui ne se voit pas : le second
        // batiment ecrase le premier sans rien dire, et on obtient une piece
        // sans porte ou un lit dans un mur.
        const clef = ty * tailleCarte + tx;
        const deja = occupees.get(clef);
        if (deja !== undefined) {
          problemes.push(`${plan.name} : chevauche ${deja} en ${tx},${ty}`);
        } else {
          occupees.set(clef, plan.name);
        }
      }
    }

    if (!porte) problemes.push(`${plan.name} : aucune porte, le batiment est inaccessible`);
  }

  return problemes;
}

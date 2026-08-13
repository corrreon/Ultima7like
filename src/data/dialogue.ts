import { defineConversation } from '../script/conversation';

/**
 * Dialogues des habitants.
 *
 * Deux principes hérités d'Ultima VII : les PNJ savent des choses differentes
 * sur le meme sujet (poser la meme question a deux personnes doit valoir le
 * detour), et parler quelque part debloque un sujet ailleurs — c'est le role
 * des drapeaux partages.
 */

defineConversation({
  id: 'mireille',
  greeting: 'Bienvenue au Chat Endormi ! Vous avez la mine de quelqu\'un qui a marche longtemps.',
  farewell: 'Revenez quand la nuit tombera, il y a toujours du feu ici.',
  initial: ['nom', 'auberge', 'reserve', 'vivres', 'livrer_pain', 'bourg', 'musique', 'acheter', 'adieu'],
  topics: [
    {
      id: 'reserve',
      label: 'La reserve',
      text: 'Fermee, et la clef partie avec ceux qui m\'ont detroussee sur la route. Ouvrez-la comme vous voudrez : ce qu\'il y a dedans est a vous.',
      sets: ['sait_reserve'],
      once: true,
    },
    {
      id: 'vivres',
      label: 'La halle au grain',
      text: 'Elle manque de pain pour la semaine. Trois miches portees la-bas, et je vous en donne trente pieces.',
      sets: ['sait_vivres'],
      once: true,
    },
    {
      id: 'livrer_pain',
      label: 'J\'ai vos trois miches',
      text: 'Parfait. La halle tiendra la semaine.',
      requires: ['sait_vivres'],
      carries: 'bread',
      effect: 'livrer:bread:3:30:vivres_livres',
      once: true,
    },
    {
      id: 'nom',
      label: 'Votre nom',
      text: 'Mireille. Je tiens cette auberge depuis onze ans, depuis que mon pere s\'est retire.',
      once: true,
      reveals: ['pere'],
    },
    {
      id: 'pere',
      label: 'Votre pere',
      text: 'Il vit sur la cote a present. Il pretend que le bruit du bourg l\'empechait de dormir. A Valmoret ! Le bourg le plus calme du royaume.',
      once: true,
    },
    {
      id: 'auberge',
      label: 'L\'auberge',
      text: 'Une chope coute trois pieces, le lit huit. Le tonneau derriere vous n\'est pas verrouille — mais je compte les chopes.',
      reveals: ['coffre'],
    },
    {
      id: 'coffre',
      label: 'Le coffre',
      text: 'Ma reserve. La clef qui s\'y trouve ouvre la remise. Servez-vous si vous en avez l\'usage, je vous fais confiance.',
      once: true,
      sets: ['sait_clef'],
    },
    {
      id: 'bourg',
      label: 'Le bourg',
      text: 'Valmoret vit de sa forge. Aldric ferre les chevaux de toute la vallee. Le soir, Basile vient jouer ici — quand il n\'a pas oublie son luth.',
      sets: ['connait_basile'],
      reveals: ['aldric', 'basile'],
    },
    {
      id: 'aldric',
      label: 'Aldric',
      text: 'Bourru, mais honnete. Il travaille de huit heures a la nuit, et il mange ici midi et soir. Ne le derangez pas devant son enclume.',
      once: true,
    },
    {
      id: 'basile',
      label: 'Basile',
      text: 'Notre barde. Il dort tard, flane sur la place, et joue le soir. Il a perdu son luth trois fois cette annee.',
      once: true,
      sets: ['connait_luth'],
    },
    {
      id: 'musique',
      label: 'La musique de ce soir',
      text: 'Vous lui avez rendu son luth ? Alors la salle sera pleine. Votre chope est offerte, c\'est la moindre des choses.',
      requires: ['luth_rendu'],
      once: true,
    },
    {
      id: 'acheter',
      label: 'Acheter a boire ou a manger',
      text: 'Servez-vous, je note tout. Le pain sort du four, la biere est d\'avant-hier — c\'est la meilleure.',
      effect: 'commercer',
    },
    { id: 'adieu', label: 'Prendre conge', text: '', ends: true },
  ],
});

defineConversation({
  id: 'aldric',
  greeting: 'Hm. Vous tombez mal, le metal refroidit. Parlez vite.',
  farewell: 'C\'est cela. Laissez-moi travailler.',
  // « luth » est present des le depart mais reste invisible tant que le
  // drapeau correspondant n'est pas pose : c'est le mecanisme qui fait qu'un
  // PNJ « sait » quelque chose seulement apres qu'on l'a appris ailleurs.
  initial: ['nom', 'forge', 'marteau_vole', 'rendre_marteau', 'luth', 'acheter', 'adieu'],
  topics: [
    {
      id: 'marteau_vole',
      label: 'Votre marteau vole',
      text: 'On me l\'a pris sur la route de l\'ouest, avec le reste. Un marteau de forge, ca ne se remplace pas en une semaine. Trente-cinq pieces a qui me le rapporte.',
      sets: ['sait_marteau'],
      once: true,
    },
    {
      id: 'rendre_marteau',
      label: 'Voici votre marteau',
      text: 'C\'est bien lui. Je n\'avais rien perdu, notez : on me l\'avait pris.',
      requires: ['sait_marteau'],
      carries: 'hammer',
      effect: 'livrer:hammer:1:35:marteau_rendu',
      once: true,
    },
    {
      id: 'nom',
      label: 'Votre nom',
      text: 'Aldric. Forgeron, comme mon pere et le sien. Vous n\'aviez pas devine a l\'enseigne ?',
      once: true,
    },
    {
      id: 'forge',
      label: 'La forge',
      text: 'Vingt ans que ce feu ne s\'eteint pas. Il y a une epee dans mon coffre — pas a vendre, c\'est une commande.',
      reveals: ['epee', 'marteau'],
    },
    {
      id: 'epee',
      label: 'L\'epee',
      text: 'Pour le capitaine de la garde. Il la reclame depuis deux mois et ne l\'a toujours pas payee. Alors elle reste ou elle est.',
      once: true,
      sets: ['sait_epee'],
    },
    {
      id: 'marteau',
      label: 'Le marteau',
      text: 'Prenez celui de la table si vous voulez taper. Frapper l\'enclume sans savoir, ca ne casse rien — sauf votre poignet.',
      once: true,
    },
    {
      id: 'luth',
      label: 'Le luth de Basile',
      text: 'Encore perdu ? Il l\'a laisse chez lui, dans son coffre, comme les deux fois precedentes. Ce garcon oublierait sa tete.',
      requires: ['connait_luth'],
      once: true,
      sets: ['sait_ou_est_luth'],
    },
    {
      id: 'acheter',
      label: 'Voir sa marchandise',
      text: 'Ce qui est sur l\'etabli est a vendre. Ce qui est dans le coffre ne l\'est pas, je vous l\'ai dit.',
      effect: 'commercer',
    },
    { id: 'adieu', label: 'Prendre conge', text: '', ends: true },
  ],
});

defineConversation({
  id: 'basile',
  greeting: 'Ah, un visage neuf ! Restez donc, j\'ai justement besoin d\'une oreille.',
  farewell: 'Passez ce soir a la taverne, je jouerai quelque chose pour vous.',
  // Tout sujet qui doit survivre au fait de sortir et de revenir appartient a
  // `initial`, avec une condition — jamais a `reveals`. Une revelation ne dure
  // que le temps d'une conversation, alors qu'un drapeau est definitif : le
  // sujet « luth » etait revele par « chanson » tout en exigeant un drapeau
  // qu'on ne peut obtenir qu'en allant voir Aldric, donc en sortant. Il etait
  // proprement inatteignable, et la quete impossible a terminer.
  //
  // « rendre » ne s'affiche que si le joueur a vraiment le luth sur lui :
  // condition sur le monde, pas sur ce qui a ete dit. Elle disparait a la
  // seconde ou l'objet change de mains.
  initial: ['nom', 'chanson', 'luth', 'rendre', 'ce_soir', 'soif', 'chope', 'suivre', 'rester', 'nuit', 'adieu'],
  topics: [
    {
      id: 'soif',
      label: 'Vous avez soif ?',
      text: 'Toujours, et surtout avant de chanter. Une chope, et vous aurez la meilleure place.',
      requires: ['luth_rendu'],
      once: true,
    },
    {
      id: 'chope',
      label: 'Voici une chope',
      text: 'A votre sante. Ecoutez bien le troisieme couplet, il est de moi.',
      requires: ['luth_rendu'],
      carries: 'ale',
      effect: 'livrer:ale:1:25:chanson_payee',
      once: true,
    },
    {
      id: 'nom',
      label: 'Votre nom',
      text: 'Basile, pour vous servir. Barde, poete, et accessoirement le plus mauvais joueur de des du bourg.',
      once: true,
    },
    {
      id: 'chanson',
      label: 'Une chanson',
      text: 'Volontiers... si j\'avais mon luth. Je l\'ai encore egare. Il finit toujours par revenir, mais rarement de lui-meme.',
      sets: ['connait_luth'],
    },
    {
      id: 'luth',
      label: 'Votre luth',
      text: 'Range dans mon coffre ? Vous croyez ? ... Vous avez sans doute raison. Aldric me le dit chaque fois.',
      requires: ['sait_ou_est_luth'],
      once: true,
      effect: 'quete_luth',
    },
    {
      id: 'rendre',
      label: 'Lui rendre son luth',
      text: 'Vous l\'avez ! ... Vraiment, vous etes alle le chercher. Tenez, prenez cela, et venez ce soir : je vous dois une chanson.',
      carries: 'lute',
      effect: 'rendre_luth',
    },
    {
      id: 'ce_soir',
      label: 'Ce soir',
      text: 'Des dix-neuf heures, au coin de l\'atre du Chat Endormi. Mireille garde toujours la meilleure place pour la musique.',
      requires: ['luth_rendu'],
      once: true,
    },
    {
      id: 'suivre',
      label: 'M\'accompagner',
      text: 'Vous voulez de moi sur les routes ? Je ne vaux pas grand-chose une epee a la main, mais je connais toutes les chansons. Allons-y.',
      requires: ['luth_rendu'],
      effect: 'recruter',
    },
    {
      id: 'rester',
      label: 'Rester ici',
      text: 'Comme vous voudrez. Je retourne a mes cordes.',
      requires: ['compagnon_basile'],
      effect: 'congedier',
    },
    {
      id: 'nuit',
      label: 'La nuit',
      text: 'Prenez une torche si vous sortez apres le couvre-feu. Les reverberes ne vont pas jusqu\'a l\'etang, et l\'eau est froide.',
      once: true,
    },
    { id: 'adieu', label: 'Prendre conge', text: '', ends: true },
  ],
});

defineConversation({
  id: 'jehan',
  greeting: 'Halte. ... Non, rien. Circulez, ou parlez, mais decidez-vous.',
  farewell: 'Bonne route. Et pas de tapage apres la nuit tombee.',
  initial: ['nom', 'garde', 'epee', 'brigands', 'suivre', 'rester', 'prime', 'adieu'],
  topics: [
    {
      id: 'nom',
      label: 'Votre nom',
      text: 'Jehan. Je tiens le poste, ce qui veut dire que je tiens surtout la porte pendant que les autres dorment.',
      once: true,
    },
    {
      id: 'garde',
      label: 'Votre charge',
      text: 'Je patrouille la place le jour et les routes la nuit. En dix ans, trois vols et un mouton egare. Le mouton m\'a donne le plus de mal.',
      reveals: ['vols'],
    },
    {
      id: 'vols',
      label: 'Les vols',
      text: 'Rien de grave. Ici on laisse les coffres ouverts. Prenez ce dont vous avez besoin, mais qu\'on vous voie le prendre.',
      once: true,
    },
    {
      id: 'epee',
      label: 'Votre epee',
      text: 'Commandee, oui. Payee... moins clairement. Ne repetez pas cela a Aldric, il a la rancune longue et le bras court.',
      requires: ['sait_epee'],
      once: true,
    },
    {
      id: 'brigands',
      label: 'Les brigands',
      text: 'Trois. Prenez la route du sud, et au bout, la ou elle s\'arrete, un sentier part vers le sud-ouest — suivez-le jusqu\'a voir leur feu. Ils detroussent les colporteurs. A un contre trois je n\'y vais pas ; a deux, c\'est autre chose.',
      once: true,
      sets: ['sait_brigands'],
    },
    {
      id: 'suivre',
      label: 'Venir avec moi',
      text: 'Le poste tiendra sans moi une journee. Passez devant, je surveille vos arrieres.',
      requires: ['sait_brigands'],
      effect: 'recruter',
    },
    {
      id: 'rester',
      label: 'Reprendre votre poste',
      text: 'Ce n\'est pas trop tot. La porte ne se garde pas toute seule.',
      requires: ['compagnon_jehan'],
      effect: 'congedier',
    },
    {
      id: 'prime',
      label: 'Le campement est vide',
      text: 'Plus personne sous ces arbres ? Alors la route est libre pour la premiere fois depuis l\'automne. Tenez — la caisse du poste prevoit une prime, autant qu\'elle serve.',
      requires: ['camp_nettoye'],
      once: true,
      effect: 'prime_brigands',
    },
    { id: 'adieu', label: 'Prendre conge', text: '', ends: true },
  ],
});

/**
 * Ysoire, l'herboriste.
 *
 * Elle existe pour une raison mecanique autant que narrative : la magie
 * consomme des reactifs, et sans quelqu'un qui en vende et en demande, les
 * reactifs ne sont qu'une ligne d'inventaire. Elle donne deux quetes, dont une
 * qui n'aboutit qu'une fois le campement nettoye.
 */
defineConversation({
  id: 'ysoire',
  greeting: 'Vous sentez le soufre et la route. Vous lancez, ou vous transportez ?',
  farewell: 'Que vos racines soient seches.',
  initial: ['nom', 'herbes', 'livrer_herbes', 'perle', 'rendre_perle', 'acheter', 'adieu'],
  topics: [
    {
      id: 'nom',
      label: 'Votre nom',
      text: 'Ysoire. Je tiens l\'echoppe d\'herbes, et je suis la seule du bourg a savoir a quoi elles servent.',
      once: true,
    },
    {
      id: 'herbes',
      label: 'Vos herbes',
      text: 'Je manque de ginseng. Trois racines, et je vous en donne quarante pieces — j\'en ai besoin avant l\'hiver.',
      sets: ['sait_herbes'],
      once: true,
    },
    {
      id: 'livrer_herbes',
      label: 'Voici votre ginseng',
      text: 'Trois racines, comme convenu. Vous savez ou me trouver, desormais.',
      requires: ['sait_herbes'],
      carries: 'ginseng',
      effect: 'livrer:ginseng:3:40:herbes_livrees',
      once: true,
    },
    {
      id: 'perle',
      label: 'Une perle noire',
      text: 'On m\'a pris une perle noire sur la route de l\'ouest. Le chef de cette bande la porte, j\'en mettrais ma main au feu.',
      requires: ['sait_brigands'],
      sets: ['sait_perle'],
      once: true,
    },
    {
      id: 'rendre_perle',
      label: 'J\'ai votre perle',
      text: 'C\'est bien elle. Cinquante pieces, et ma reconnaissance — qui vaut plus cher.',
      requires: ['sait_perle'],
      carries: 'perle',
      effect: 'livrer:perle:1:50:perle_rendue',
      once: true,
    },
    { id: 'acheter', label: 'Marchander', text: 'Voyons ce que j\'ai.', effect: 'commercer' },
    { id: 'adieu', label: 'Prendre conge', text: '', ends: true },
  ],
});

/**
 * Garin, capitaine des portes.
 *
 * Le rempart a change la ville : il a des portes, donc quelqu'un qui en
 * repond. Ses deux quetes servent a faire parcourir l'enceinte — une ville
 * fortifiee qu'on ne longe jamais n'est qu'un decor de fond.
 */
defineConversation({
  id: 'garin',
  greeting: 'Capitaine Garin. Les portes tiennent, et j\'entends que cela dure.',
  farewell: 'Restez du bon cote des murs a la nuit.',
  initial: ['nom', 'rondes', 'rapport', 'lanternes', 'livrer_torches', 'adieu'],
  topics: [
    {
      id: 'nom',
      label: 'Votre nom',
      text: 'Garin. Je commande les deux portes, ce qui veut dire que je commande deux hommes.',
      once: true,
    },
    {
      id: 'rondes',
      label: 'Les portes',
      text: 'Faites-en le tour, sud et est, et dites-moi si les battants tiennent. Je paie ceux qui marchent a ma place.',
      sets: ['sait_rondes'],
      once: true,
    },
    {
      id: 'rapport',
      label: 'La ronde est faite',
      text: 'Les deux debout ? Voila qui me repose. Trente pieces.',
      requires: ['porte_sud_vue', 'porte_est_vue'],
      effect: 'payer:30:rondes_faites',
      once: true,
    },
    {
      id: 'lanternes',
      label: 'Vos guetteurs',
      text: 'Ils veillent sans lumiere. Deux torches, et je vous en donne trente pieces.',
      sets: ['sait_lanternes'],
      once: true,
    },
    {
      id: 'livrer_torches',
      label: 'Voici deux torches',
      text: 'Mes hommes verront enfin qui frappe a la porte.',
      requires: ['sait_lanternes'],
      carries: 'torch',
      effect: 'livrer:torch:2:30:lanternes_faites',
      once: true,
    },
    { id: 'adieu', label: 'Prendre conge', text: '', ends: true },
  ],
});

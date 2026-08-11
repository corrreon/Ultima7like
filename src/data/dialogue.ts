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
  initial: ['nom', 'auberge', 'bourg', 'musique', 'adieu'],
  topics: [
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
  initial: ['nom', 'forge', 'luth', 'adieu'],
  topics: [
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
  initial: ['nom', 'chanson', 'luth', 'rendre', 'ce_soir', 'nuit', 'adieu'],
  topics: [
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
  initial: ['nom', 'garde', 'epee', 'adieu'],
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
    { id: 'adieu', label: 'Prendre conge', text: '', ends: true },
  ],
});

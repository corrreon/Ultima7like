import { describe, expect, it } from 'vitest';
import { Actor } from '../src/objects/actor';
import { GameObject } from '../src/objects/gameobject';
import { buildTown } from '../src/data/town';
import { populate } from '../src/data/npcs';
import {
  DECOTE,
  ETAL,
  MARGE,
  acheter,
  bourse,
  crediter,
  estMarchand,
  etal,
  negociable,
  payer,
  prixAchat,
  prixVente,
  vendables,
  vendre,
} from '../src/script/commerce';

function marchand(or: number, marchandises: string[]): Actor {
  const a = new Actor({ shape: 'townswoman', displayName: 'Marchande' });
  a.add(new GameObject({ shape: 'gold', quantity: or }));
  const stock = new GameObject({ shape: 'bag', name: ETAL });
  a.add(stock);
  for (const shape of marchandises) stock.add(new GameObject({ shape }));
  return a;
}

function client(or: number): Actor {
  const a = new Actor({ shape: 'avatar', displayName: 'Avatar' });
  if (or > 0) a.add(new GameObject({ shape: 'gold', quantity: or }));
  return a;
}

describe('bourse', () => {
  it('compte les pieces a n\'importe quelle profondeur', () => {
    const a = client(10);
    const sac = new GameObject({ shape: 'bag' });
    a.add(sac);
    sac.add(new GameObject({ shape: 'gold', quantity: 15 }));
    expect(bourse(a)).toBe(25);
  });

  it('paie en vidant les tas, et vide le tas epuise', () => {
    const a = client(10);
    const sac = new GameObject({ shape: 'bag' });
    a.add(sac);
    sac.add(new GameObject({ shape: 'gold', quantity: 5 }));

    expect(payer(a, 12)).toBe(true);
    expect(bourse(a)).toBe(3);
    // Le premier tas a ete consomme entierement et retire.
    expect(a.contents.filter((o) => o.shapeId === 'gold')).toHaveLength(0);
  });

  it('refuse un paiement impossible sans rien toucher', () => {
    // Une transaction a moitie faite est pire qu'une transaction refusee.
    const a = client(7);
    expect(payer(a, 8)).toBe(false);
    expect(bourse(a)).toBe(7);
  });

  it('cumule sur un tas existant plutot que d\'en creer un', () => {
    const a = client(4);
    crediter(a, 6);
    expect(bourse(a)).toBe(10);
    expect(a.contents.filter((o) => o.shapeId === 'gold')).toHaveLength(1);

    const vide = client(0);
    crediter(vide, 3);
    expect(bourse(vide)).toBe(3);
  });
});

describe('prix', () => {
  it('laisse une marge au marchand', () => {
    const epee = new GameObject({ shape: 'sword' }); // valeur 60
    expect(prixAchat(epee)).toBe(Math.round(60 * MARGE));
    expect(prixVente(epee)).toBe(Math.round(60 * DECOTE));
    // Sans cet ecart, acheter et revendre en boucle fabriquerait de l'or.
    expect(prixVente(epee)).toBeLessThan(prixAchat(epee));
  });

  it('ne descend jamais a zero', () => {
    const caillou = new GameObject({ shape: 'flower' }); // valeur 1
    expect(prixVente(caillou)).toBeGreaterThanOrEqual(1);
  });

  it('exclut l\'or et ce qui ne vaut rien', () => {
    expect(negociable(new GameObject({ shape: 'gold', quantity: 5 }))).toBe(false);
    expect(negociable(new GameObject({ shape: 'pebble' }))).toBe(false);
    expect(negociable(new GameObject({ shape: 'sword' }))).toBe(true);
  });
});

describe('transactions', () => {
  it('deplace le bien et l\'or dans les deux sens', () => {
    const m = marchand(100, ['sword']);
    const a = client(200);
    const epee = etal(m)!.contents[0]!;

    const achat = acheter(a, m, epee);
    expect(achat.ok && achat.prix).toBe(90);
    expect(a.findDeep((o) => o === epee)).toBe(epee);
    expect(bourse(a)).toBe(110);
    expect(bourse(m)).toBe(190);

    const revente = vendre(a, m, epee);
    expect(revente.ok && revente.prix).toBe(30);
    expect(a.findDeep((o) => o === epee)).toBeNull();
    expect(etal(m)!.contents).toContain(epee);
    // Le client est perdant sur l'aller-retour : c'est le principe.
    expect(bourse(a)).toBe(140);
  });

  it('refuse en donnant sa raison', () => {
    const m = marchand(2, ['sword']);
    const pauvre = client(3);
    const epee = etal(m)!.contents[0]!;

    const achat = acheter(pauvre, m, epee);
    expect(achat).toEqual({ ok: false, raison: 'pas_assez_d_or' });
    // Et rien n'a bouge.
    expect(etal(m)!.contents).toContain(epee);
    expect(bourse(pauvre)).toBe(3);

    const riche = client(500);
    const sien = new GameObject({ shape: 'sword' });
    riche.add(sien);
    expect(vendre(riche, m, sien)).toEqual({ ok: false, raison: 'marchand_sans_or' });
    expect(riche.contents).toContain(sien);
  });

  it('refuse un achat qui surchargerait le client', () => {
    // `Actor.canAccept` accepte tout — la contrainte d'un acteur est le poids,
    // pas le volume. C'est donc la surcharge qu'il faut regarder, et ce test
    // le verifie avec des poids reels plutot que sous condition.
    // L'or pese : une piece vaut un dixieme de stone, et cent pieces comptent
    // autant que dix miches. La bourse fait donc partie de la charge.
    const m = marchand(500, ['sack']); // sac de grain : 120, soit 12 stones
    const a = client(100);
    for (let i = 0; i < 5; i++) a.add(new GameObject({ shape: 'sack' }));

    const porte = a.carriedWeight;
    const sac = etal(m)!.contents[0]!;
    expect(porte).toBeLessThanOrEqual(a.maxWeight);
    expect(porte + sac.totalWeight).toBeGreaterThan(a.maxWeight);

    expect(acheter(a, m, sac)).toEqual({ ok: false, raison: 'trop_lourd' });
    // Et rien n'a bouge : ni le bien, ni l'or.
    expect(etal(m)!.contents).toContain(sac);
    expect(bourse(a)).toBe(100);
  });

  it('n\'achete pas ce qui n\'est pas a l\'etal', () => {
    const m = marchand(100, ['sword']);
    const a = client(500);
    // Un objet de son inventaire personnel, hors etal, n'est pas a vendre.
    const prive = new GameObject({ shape: 'lute' });
    m.add(prive);
    expect(acheter(a, m, prive)).toEqual({ ok: false, raison: 'pas_marchand' });
  });

  it('ne vend pas de l\'or contre de l\'or', () => {
    const m = marchand(100, []);
    const a = client(50);
    const pieces = a.contents.find((o) => o.shapeId === 'gold')!;
    expect(vendre(a, m, pieces)).toEqual({ ok: false, raison: 'sans_valeur' });
    expect(bourse(a)).toBe(50);
  });
});

describe('les marchands du bourg', () => {
  const world = buildTown();
  const { avatar, npcs } = populate(world);
  const par = (nom: string) => npcs.find((n) => n.displayName === nom)!;

  it('sont ceux qui tiennent un etal, et eux seuls', () => {
    expect(estMarchand(par('Mireille'))).toBe(true);
    expect(estMarchand(par('Aldric'))).toBe(true);
    expect(estMarchand(par('Basile'))).toBe(false);
    expect(estMarchand(par('Jehan'))).toBe(false);
  });

  it('ont de quoi payer ce qu\'ils achetent', () => {
    for (const nom of ['Mireille', 'Aldric']) {
      expect(bourse(par(nom)), `${nom} sans bourse`).toBeGreaterThan(0);
      expect(etal(par(nom))!.contents.length, `${nom} sans stock`).toBeGreaterThan(0);
    }
  });

  it('laissent a l\'Avatar de quoi commencer a commercer', () => {
    expect(bourse(avatar)).toBeGreaterThan(0);
    // Il a de quoi vendre : le pain et la pomme de son sac, sa dague, sa torche.
    expect(vendables(avatar).length).toBeGreaterThan(2);
  });

  it('gardent leur etal hors de ce que l\'Avatar peut vendre', () => {
    // `vendables` ne parcourt que le client : l'etal du marchand n'y figure pas.
    const noms = vendables(avatar).map((o) => o.name);
    expect(noms).not.toContain(ETAL);
  });
});

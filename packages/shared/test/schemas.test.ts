import { describe, expect, it } from 'vitest';
import {
  CardIdSchema,
  CardSchema,
  CardVariantSchema,
  DeckSchema,
  officialImageUrl,
  proxiedImageUrl,
  VariantIdSchema,
  type Card,
  type CardVariant,
  type Deck,
} from '../src/index.js';

const zoro: Card = {
  id: 'OP01-025',
  name: 'Roronoa Zoro',
  category: 'CHARACTER',
  colors: ['Red'],
  cost: 3,
  power: 5000,
  counter: null,
  life: null,
  attribute: ['Slash'],
  types: ['Supernovas', 'Straw Hat Crew'],
  effectText: '[DON!! x1] [When Attacking] This Character gains +1000 power during this battle.',
  triggerText: null,
  effect: null,
  setCode: 'OP01',
};

const zoroParallel: CardVariant = {
  id: 'OP01-025_p1',
  cardId: 'OP01-025',
  variantType: 'PARALLEL',
  rarity: 'SR',
  setCode: 'OP01',
  imageUrl: 'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-025_p1.png',
  imageProxyUrl: '/img/OP01-025_p1.png',
  illustrator: null,
};

describe('CardSchema', () => {
  it('accepte une carte valide', () => {
    expect(CardSchema.parse(zoro)).toEqual(zoro);
  });

  it('rejette une couleur inconnue', () => {
    expect(CardSchema.safeParse({ ...zoro, colors: ['Pink'] }).success).toBe(false);
  });

  it('rejette un id de carte malformé', () => {
    expect(CardSchema.safeParse({ ...zoro, id: 'XX99_001' }).success).toBe(false);
  });
});

describe('CardIdSchema / VariantIdSchema', () => {
  it.each(['OP01-001', 'ST01-006', 'EB01-001', 'PRB01-001', 'P-001'])('accepte %s', (id) => {
    expect(CardIdSchema.safeParse(id).success).toBe(true);
  });

  it("rejette un suffixe de variante dans un id d'identité", () => {
    expect(CardIdSchema.safeParse('OP01-006_p1').success).toBe(false);
  });

  it('accepte les suffixes de variante', () => {
    expect(VariantIdSchema.safeParse('OP01-006_p1').success).toBe(true);
    expect(VariantIdSchema.safeParse('OP01-006_r1').success).toBe(true);
    expect(VariantIdSchema.safeParse('OP01-006').success).toBe(true);
  });
});

describe('CardVariantSchema', () => {
  it('accepte une variante parallèle valide', () => {
    expect(CardVariantSchema.parse(zoroParallel)).toEqual(zoroParallel);
  });

  it('rejette un variantType inconnu', () => {
    expect(CardVariantSchema.safeParse({ ...zoroParallel, variantType: 'GOLD' }).success).toBe(
      false,
    );
  });
});

describe('DeckSchema', () => {
  const deck: Deck = {
    id: 'deck-1',
    ownerId: null,
    name: 'Red Zoro Aggro',
    leaderVariantId: 'OP01-001',
    cards: [{ cardId: 'OP01-025', variantId: 'OP01-025_p1', quantity: 4 }],
    isPublic: false,
    createdAt: '2026-07-07T10:00:00Z',
    updatedAt: '2026-07-07T10:00:00Z',
  };

  it('accepte un deck structurellement valide', () => {
    expect(DeckSchema.parse(deck)).toEqual(deck);
  });

  it('rejette une quantité supérieure à 4', () => {
    const bad = { ...deck, cards: [{ cardId: 'OP01-025', variantId: 'OP01-025', quantity: 5 }] };
    expect(DeckSchema.safeParse(bad).success).toBe(false);
  });
});

describe('images (point de passage unique)', () => {
  it("construit l'URL officielle", () => {
    expect(officialImageUrl('OP01-006_p1')).toBe(
      'https://en.onepiece-cardgame.com/images/cardlist/card/OP01-006_p1.png',
    );
  });

  it('passe par le proxy quand il est configuré', () => {
    expect(proxiedImageUrl('OP01-001', 'https://img.example.dev/')).toBe(
      'https://img.example.dev/OP01-001.png',
    );
  });

  it('kill-switch : retombe sur le CDN officiel sans proxy', () => {
    expect(proxiedImageUrl('OP01-001', undefined)).toBe(officialImageUrl('OP01-001'));
  });
});

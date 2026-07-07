import { describe, expect, it } from 'vitest';
import { validateDeck, type Card, type CardLookup, type DeckCardEntry } from '../src/index.js';

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    name: `Carte ${id}`,
    category: 'CHARACTER',
    colors: ['Red'],
    cost: 3,
    power: 5000,
    counter: 1000,
    life: null,
    attribute: ['Slash'],
    types: [],
    effectText: '',
    triggerText: null,
    effect: null,
    setCode: id.split('-')[0] ?? 'OP01',
    ...overrides,
  };
}

// Base de cartes de test : 1 leader rouge, 1 leader vert/bleu, 13 personnages rouges,
// 1 événement vert, 1 stage rouge/vert, 1 DON.
const DB = new Map<string, Card>();
DB.set('OP01-001', makeCard('OP01-001', { category: 'LEADER', colors: ['Red'], life: 5 }));
DB.set(
  'OP01-002',
  makeCard('OP01-002', { category: 'LEADER', colors: ['Green', 'Blue'], life: 4 }),
);
for (let i = 10; i <= 22; i++) {
  DB.set(`OP01-0${i}`, makeCard(`OP01-0${i}`, { colors: ['Red'] }));
}
DB.set('OP01-030', makeCard('OP01-030', { category: 'EVENT', colors: ['Green'] }));
DB.set('OP01-031', makeCard('OP01-031', { category: 'STAGE', colors: ['Red', 'Green'] }));
DB.set('OP01-099', makeCard('OP01-099', { category: 'DON', colors: ['Red'] }));

const getCard: CardLookup = (id) => DB.get(id);

/** 12 personnages rouges x4 + 1 x2 = 50 cartes légales pour le leader rouge. */
function legalCards(): DeckCardEntry[] {
  const entries: DeckCardEntry[] = [];
  for (let i = 10; i <= 21; i++) {
    entries.push({ cardId: `OP01-0${i}`, variantId: `OP01-0${i}`, quantity: 4 });
  }
  entries.push({ cardId: 'OP01-022', variantId: 'OP01-022', quantity: 2 });
  return entries;
}

describe('validateDeck', () => {
  it('accepte un deck légal (et le choix d’alt-art ne change rien)', () => {
    const cards = legalCards();
    cards[0] = { ...cards[0]!, variantId: `${cards[0]!.cardId}_p1` };
    const result = validateDeck({ leaderVariantId: 'OP01-001_p1', cards }, getCard);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('refuse un deck qui n’a pas exactement 50 cartes', () => {
    const cards = legalCards();
    cards[12] = { ...cards[12]!, quantity: 1 }; // 49
    const result = validateDeck({ leaderVariantId: 'OP01-001', cards }, getCard);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'DECK_SIZE', expected: 50, actual: 49 }),
    ]);
  });

  it('refuse plus de 4 exemplaires, toutes variantes confondues', () => {
    const cards = legalCards();
    cards[12] = { cardId: 'OP01-010', variantId: 'OP01-010_p1', quantity: 2 }; // 4 base + 2 p1
    const result = validateDeck({ leaderVariantId: 'OP01-001', cards }, getCard);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'TOO_MANY_COPIES', cardId: 'OP01-010', quantity: 6 }),
    ]);
  });

  it('refuse une carte sans couleur commune avec le leader', () => {
    const cards = legalCards();
    cards[12] = { cardId: 'OP01-030', variantId: 'OP01-030', quantity: 2 }; // EVENT vert, leader rouge
    const result = validateDeck({ leaderVariantId: 'OP01-001', cards }, getCard);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'COLOR_MISMATCH', cardId: 'OP01-030' }),
    ]);
  });

  it('une carte multicolore passe si elle partage UNE couleur (leader bicolore inclus)', () => {
    const cards = legalCards();
    cards[12] = { cardId: 'OP01-031', variantId: 'OP01-031', quantity: 2 }; // STAGE rouge/vert
    expect(validateDeck({ leaderVariantId: 'OP01-001', cards }, getCard).valid).toBe(true);

    // Leader vert/bleu : l'événement vert passe, les personnages rouges non.
    const greenDeck = validateDeck(
      {
        leaderVariantId: 'OP01-002',
        cards: [{ cardId: 'OP01-030', variantId: 'OP01-030', quantity: 2 }],
      },
      getCard,
    );
    expect(greenDeck.errors.some((e) => e.code === 'COLOR_MISMATCH')).toBe(false);
  });

  it('signale un leader manquant, inconnu ou de mauvaise catégorie', () => {
    const cards = legalCards();
    const unknown = validateDeck({ leaderVariantId: 'OP99-999', cards }, getCard);
    expect(unknown.errors.some((e) => e.code === 'LEADER_MISSING')).toBe(true);

    const notLeader = validateDeck({ leaderVariantId: 'OP01-010', cards }, getCard);
    expect(notLeader.errors.some((e) => e.code === 'LEADER_NOT_A_LEADER')).toBe(true);
  });

  it('refuse LEADER et DON dans le deck principal', () => {
    const cards = legalCards();
    cards[12] = { cardId: 'OP01-002', variantId: 'OP01-002', quantity: 1 };
    cards.push({ cardId: 'OP01-099', variantId: 'OP01-099', quantity: 1 });
    const result = validateDeck({ leaderVariantId: 'OP01-001', cards }, getCard);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain('INVALID_CATEGORY');
    expect(result.errors.filter((e) => e.code === 'INVALID_CATEGORY')).toHaveLength(2);
  });

  it('signale une carte inconnue', () => {
    const cards = legalCards();
    cards[12] = { cardId: 'OP01-777', variantId: 'OP01-777', quantity: 2 };
    const result = validateDeck({ leaderVariantId: 'OP01-001', cards }, getCard);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'UNKNOWN_CARD', cardId: 'OP01-777' }),
    ]);
  });

  it('signale une variante qui n’appartient pas à la carte déclarée', () => {
    const cards = legalCards();
    cards[12] = { cardId: 'OP01-022', variantId: 'OP01-021_p1', quantity: 2 };
    const result = validateDeck({ leaderVariantId: 'OP01-001', cards }, getCard);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'VARIANT_MISMATCH', variantId: 'OP01-021_p1' }),
    ]);
  });

  it('cumule plusieurs erreurs exploitables par l’UI', () => {
    const result = validateDeck(
      {
        leaderVariantId: 'OP01-010', // pas un leader
        cards: [
          { cardId: 'OP01-010', variantId: 'OP01-010', quantity: 4 },
          { cardId: 'OP01-010', variantId: 'OP01-010_p1', quantity: 4 }, // 8 copies
          { cardId: 'OP01-777', variantId: 'OP01-777', quantity: 1 }, // inconnue
        ],
      },
      getCard,
    );
    const codes = result.errors.map((e) => e.code).sort();
    expect(codes).toEqual(['DECK_SIZE', 'LEADER_NOT_A_LEADER', 'TOO_MANY_COPIES', 'UNKNOWN_CARD']);
    expect(result.valid).toBe(false);
  });
});

import type { CardWithVariants } from '@op/shared';
import { describe, expect, it } from 'vitest';
import {
  deckReducer,
  EMPTY_DECK,
  fromDeckFile,
  toDeckEntries,
  toDeckFile,
  totalCards,
  type BuilderState,
} from './deck';

function card(id: string, variants: string[] = [id]): CardWithVariants {
  return {
    id,
    name: `Carte ${id}`,
    category: 'CHARACTER',
    colors: ['Red'],
    cost: 3,
    power: 5000,
    counter: 1000,
    life: null,
    attribute: [],
    types: [],
    effectText: '',
    triggerText: null,
    effect: null,
    setCode: 'OP01',
    variants: variants.map((v) => ({
      id: v,
      cardId: id,
      variantType: v === id ? 'BASE' : 'PARALLEL',
      rarity: 'R',
      setCode: 'OP01',
      imageUrl: `https://example.com/${v}.png`,
      imageProxyUrl: `/img/${v}.png`,
      illustrator: null,
    })),
  };
}

describe('deckReducer', () => {
  it('ajoute puis plafonne à 4 exemplaires', () => {
    let state = EMPTY_DECK;
    for (let i = 0; i < 6; i++) {
      state = deckReducer(state, { type: 'add', cardId: 'OP01-016', defaultVariantId: 'OP01-016' });
    }
    expect(state.entries['OP01-016']?.quantity).toBe(4);
    expect(totalCards(state)).toBe(4);
  });

  it('refuse une nouvelle carte au-delà de 50 au total', () => {
    let state: BuilderState = { ...EMPTY_DECK, entries: {} };
    // 12 cartes x4 + 1 x2 = 50
    for (let i = 10; i <= 21; i++) {
      state = {
        ...state,
        entries: { ...state.entries, [`OP01-0${i}`]: { variantId: `OP01-0${i}`, quantity: 4 } },
      };
    }
    state = {
      ...state,
      entries: { ...state.entries, 'OP01-022': { variantId: 'OP01-022', quantity: 2 } },
    };
    expect(totalCards(state)).toBe(50);
    const after = deckReducer(state, {
      type: 'add',
      cardId: 'OP01-030',
      defaultVariantId: 'OP01-030',
    });
    expect(after).toBe(state); // nouvelle identité refusée à 50
  });

  it('retire et supprime l’entrée à zéro', () => {
    let state = deckReducer(EMPTY_DECK, { type: 'add', cardId: 'X', defaultVariantId: 'X' });
    state = deckReducer(state, { type: 'remove', cardId: 'X' });
    expect(state.entries['X']).toBeUndefined();
  });

  it('change la variante sans toucher à la quantité', () => {
    let state = deckReducer(EMPTY_DECK, {
      type: 'add',
      cardId: 'OP01-025',
      defaultVariantId: 'OP01-025',
    });
    state = deckReducer(state, { type: 'add', cardId: 'OP01-025', defaultVariantId: 'OP01-025' });
    state = deckReducer(state, {
      type: 'setVariant',
      cardId: 'OP01-025',
      variantId: 'OP01-025_p1',
    });
    expect(state.entries['OP01-025']).toEqual({ variantId: 'OP01-025_p1', quantity: 2 });
  });
});

describe('toDeckFile / fromDeckFile', () => {
  const catalog = new Map(
    [card('OP01-001'), card('OP01-016'), card('OP01-025', ['OP01-025', 'OP01-025_p1'])].map((c) => [
      c.id,
      c,
    ]),
  );

  it('fait l’aller-retour en conservant l’art', () => {
    const state: BuilderState = {
      name: 'Test',
      leaderVariantId: 'OP01-001',
      entries: {
        'OP01-016': { variantId: 'OP01-016', quantity: 4 },
        'OP01-025': { variantId: 'OP01-025_p1', quantity: 2 },
      },
    };
    const file = toDeckFile(state);
    expect(file.cards).toContainEqual({ id: 'OP01-025', qty: 2, art: 'p1' });

    const { state: restored, warnings } = fromDeckFile(file, catalog);
    expect(warnings).toEqual([]);
    expect(restored.entries['OP01-025']).toEqual({ variantId: 'OP01-025_p1', quantity: 2 });
    expect(toDeckEntries(restored)).toEqual(toDeckEntries(state));
  });

  it('retombe sur la variante de base si l’art est inconnu, avec avertissement', () => {
    const file = toDeckFile({
      name: 'X',
      leaderVariantId: 'OP01-001',
      entries: { 'OP01-016': { variantId: 'OP01-016_p9', quantity: 1 } },
    });
    const { state, warnings } = fromDeckFile(file, catalog);
    expect(state.entries['OP01-016']?.variantId).toBe('OP01-016');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('ignore les identités inconnues du catalogue en le signalant', () => {
    const { state, warnings } = fromDeckFile(
      {
        format: 'optcg-deck',
        version: 1,
        meta: { name: 'X' },
        leader: { id: 'OP01-001', art: 'base' },
        cards: [{ id: 'OP99-999', qty: 4, art: 'base' }],
      },
      catalog,
    );
    expect(state.entries['OP99-999']).toBeUndefined();
    expect(warnings.some((w) => w.includes('OP99-999'))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  cardIdFromVariantId,
  DeckFileSchema,
  splitVariantId,
  validateDeckFile,
  variantIdForArt,
  type DeckFile,
} from '../src/index.js';

// Exemple du cahier des charges (PROMPT-CODE-OPTCG-SIM)
const example = {
  format: 'optcg-deck',
  version: 1,
  meta: { name: 'Red Zoro Aggro', author: 'jami', region: 'EN', createdAt: '2026-07-07T10:00:00Z' },
  leader: { id: 'OP01-001', art: 'p1' },
  cards: [
    { id: 'OP01-016', qty: 4, art: 'base' },
    { id: 'OP01-025', qty: 2, art: 'p1' },
    { id: 'ST01-006', qty: 4, art: 'base' },
  ],
};

describe('DeckFileSchema', () => {
  it('accepte l’exemple du cahier des charges', () => {
    const parsed = DeckFileSchema.parse(example);
    expect(parsed.leader).toEqual({ id: 'OP01-001', art: 'p1' });
    expect(parsed.cards).toHaveLength(3);
  });

  it('applique art="base" par défaut', () => {
    const parsed = DeckFileSchema.parse({
      ...example,
      leader: { id: 'OP01-001' },
      cards: [{ id: 'OP01-016', qty: 4 }],
    });
    expect(parsed.leader.art).toBe('base');
    expect(parsed.cards[0]?.art).toBe('base');
  });

  it('rejette une version inconnue et un format inconnu', () => {
    expect(DeckFileSchema.safeParse({ ...example, version: 2 }).success).toBe(false);
    expect(DeckFileSchema.safeParse({ ...example, format: 'other' }).success).toBe(false);
  });

  it('rejette qty hors bornes et id malformé', () => {
    expect(
      DeckFileSchema.safeParse({ ...example, cards: [{ id: 'OP01-016', qty: 5 }] }).success,
    ).toBe(false);
    expect(DeckFileSchema.safeParse({ ...example, cards: [{ id: 'XX-01', qty: 1 }] }).success).toBe(
      false,
    );
  });
});

describe('variantIdForArt / splitVariantId', () => {
  it('fait l’aller-retour (base et parallèle)', () => {
    expect(variantIdForArt('OP01-006', 'base')).toBe('OP01-006');
    expect(variantIdForArt('OP01-006', 'p1')).toBe('OP01-006_p1');
    expect(splitVariantId('OP01-006_p1')).toEqual({ cardId: 'OP01-006', art: 'p1' });
    expect(splitVariantId('OP01-006')).toEqual({ cardId: 'OP01-006', art: 'base' });
    expect(cardIdFromVariantId('OP01-006_r1')).toBe('OP01-006');
  });
});

describe('validateDeckFile', () => {
  const base = DeckFileSchema.parse(example);

  it('signale une somme différente de 50', () => {
    const issues = validateDeckFile(base); // 4+2+4 = 10 cartes
    expect(issues.some((i) => i.code === 'DECK_SIZE' && i.actual === 10)).toBe(true);
  });

  it('accepte un deck de 50 exactement', () => {
    const cards = Array.from({ length: 12 }, (_, i) => ({
      id: `OP01-0${String(i + 10)}`,
      qty: 4,
      art: 'base',
    }));
    cards.push({ id: 'OP01-030', qty: 2, art: 'base' });
    const file: DeckFile = { ...base, cards };
    expect(validateDeckFile(file)).toEqual([]);
  });

  it('compte le max 4 toutes variantes confondues (base + p1)', () => {
    const cards = [
      { id: 'OP01-016', qty: 3, art: 'base' },
      { id: 'OP01-016', qty: 2, art: 'p1' },
    ];
    const issues = validateDeckFile({ ...base, cards });
    expect(issues.some((i) => i.code === 'TOO_MANY_COPIES' && i.cardId === 'OP01-016')).toBe(true);
  });
});

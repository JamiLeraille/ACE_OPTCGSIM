import { describe, expect, it } from 'vitest';
import { fromSimText, toSimText, type DeckFile } from '../src/index.js';

const LEADERS = new Set(['OP01-001', 'OP01-002']);
const isLeader = (id: string) => LEADERS.has(id);

const deck: DeckFile = {
  format: 'optcg-deck',
  version: 1,
  meta: { name: 'Red Zoro Aggro' },
  leader: { id: 'OP01-001', art: 'p1' },
  cards: [
    { id: 'OP01-016', qty: 4, art: 'base' },
    { id: 'OP01-025', qty: 2, art: 'p1' },
    { id: 'ST01-006', qty: 4, art: 'base' },
  ],
};

describe('toSimText', () => {
  it('émet le leader en première ligne et omet la variante visuelle', () => {
    expect(toSimText(deck)).toBe('1xOP01-001\n4xOP01-016\n2xOP01-025\n4xST01-006');
  });
});

describe('fromSimText', () => {
  it('parse un export propre (aller-retour, arts ramenés à "base")', () => {
    const { deck: parsed, issues } = fromSimText(toSimText(deck), isLeader);
    expect(issues).toEqual([]);
    expect(parsed?.leader).toEqual({ id: 'OP01-001', art: 'base' });
    expect(parsed?.cards).toEqual([
      { id: 'OP01-016', qty: 4, art: 'base' },
      { id: 'OP01-025', qty: 2, art: 'base' },
      { id: 'ST01-006', qty: 4, art: 'base' },
    ]);
  });

  it('tolère espaces, minuscules et lignes vides', () => {
    const text = '\n1x OP01-001\n4 x op01-016\n\n  2xOP01-025  \n';
    const { deck: parsed, issues } = fromSimText(text, isLeader);
    expect(issues).toEqual([]);
    expect(parsed?.cards.map((c) => c.id)).toEqual(['OP01-016', 'OP01-025']);
  });

  it('conserve un suffixe d’art optionnel', () => {
    const { deck: parsed } = fromSimText('1xOP01-001_p1\n2xOP01-025_p1', isLeader);
    expect(parsed?.leader).toEqual({ id: 'OP01-001', art: 'p1' });
    expect(parsed?.cards).toEqual([{ id: 'OP01-025', qty: 2, art: 'p1' }]);
  });

  it('identifie le leader via le prédicat, pas via la position', () => {
    const { deck: parsed, issues } = fromSimText('4xOP01-016\n1xOP01-001', isLeader);
    expect(issues).toEqual([]);
    expect(parsed?.leader.id).toBe('OP01-001');
    expect(parsed?.cards).toEqual([{ id: 'OP01-016', qty: 4, art: 'base' }]);
  });

  it('fusionne les doublons de même identité + art', () => {
    const { deck: parsed } = fromSimText('1xOP01-001\n2xOP01-016\n2xOP01-016', isLeader);
    expect(parsed?.cards).toEqual([{ id: 'OP01-016', qty: 4, art: 'base' }]);
  });

  it('signale les lignes illisibles avec leur numéro', () => {
    const { deck: parsed, issues } = fromSimText(
      '1xOP01-001\nn’importe quoi\n4xOP01-016',
      isLeader,
    );
    expect(parsed).not.toBeNull();
    expect(issues).toEqual([
      { line: 2, raw: 'n’importe quoi', reason: 'Ligne illisible (attendu : "4xOP01-016").' },
    ]);
  });

  it('retourne deck=null sans leader identifiable', () => {
    const { deck: parsed, issues } = fromSimText('4xOP01-016', isLeader);
    expect(parsed).toBeNull();
    expect(issues.some((i) => i.line === 0)).toBe(true);
  });

  it('signale un second leader et une quantité de leader ≠ 1', () => {
    const multi = fromSimText('1xOP01-001\n1xOP01-002\n4xOP01-016', isLeader);
    expect(multi.deck?.leader.id).toBe('OP01-001');
    expect(multi.issues).toHaveLength(1);

    const dupQty = fromSimText('2xOP01-001\n4xOP01-016', isLeader);
    expect(dupQty.deck?.leader).toEqual({ id: 'OP01-001', art: 'base' });
    expect(dupQty.issues).toHaveLength(1);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeBlocks } from '../src/normalize.js';
import { parseCardList } from '../src/parser.js';
import { assertNoAbnormalDrop } from '../src/upsert.js';

const op16 = readFileSync(join(__dirname, 'fixtures', 'series-569116-op16.html'), 'utf8');
const blocks = parseCardList(op16);
const result = normalizeBlocks(blocks);

describe('normalizeBlocks — fixture OP-16', () => {
  it('regroupe les visuels : moins de cartes que de variantes', () => {
    expect(result.variants).toHaveLength(155);
    expect(result.cards.length).toBeLessThan(155);
    const baseIds = new Set(blocks.map((b) => b.baseId));
    expect(result.cards).toHaveLength(baseIds.size);
  });

  it('OP16-001 : une identité, deux variantes (base + parallèle)', () => {
    const variants = result.variants.filter((v) => v.cardId === 'OP16-001');
    expect(variants.map((v) => v.id).sort()).toEqual(['OP16-001', 'OP16-001_p1']);
    expect(variants.find((v) => v.id === 'OP16-001')?.variantType).toBe('BASE');
    expect(variants.find((v) => v.id === 'OP16-001_p1')?.variantType).toBe('PARALLEL');
  });

  it('normalise le leader : life numérique, cost null, counter null', () => {
    const ace = result.cards.find((c) => c.card.id === 'OP16-001');
    expect(ace?.card).toMatchObject({
      name: 'Portgas.D.Ace',
      category: 'LEADER',
      colors: ['Red'],
      cost: null,
      life: 5,
      power: 5000,
      counter: null,
      attribute: ['Special'],
      setCode: 'OP16',
    });
    expect(ace?.needsReview).toBe(false);
    expect(ace?.raw).toContain('modalCol');
    expect(ace?.contentHash).toHaveLength(16);
  });

  it('normalise un personnage : cost numérique, life null', () => {
    const curiel = result.cards.find((c) => c.card.id === 'OP16-004');
    expect(curiel?.card).toMatchObject({ cost: 7, life: null, power: 8000, counter: 2000 });
  });

  it("construit l'URL d'image canonique (CDN officiel, sans query)", () => {
    const p1 = result.variants.find((v) => v.id === 'OP16-001_p1');
    expect(p1?.imageUrl).toBe(
      'https://en.onepiece-cardgame.com/images/cardlist/card/OP16-001_p1.png',
    );
  });

  it('aucune carte OP-16 ne nécessite de relecture', () => {
    expect(result.cards.filter((c) => c.needsReview)).toEqual([]);
  });

  it('l’ingestion est déterministe (mêmes hashes sur deux runs)', () => {
    const again = normalizeBlocks(blocks);
    const hashes = (r: typeof result) => r.cards.map((c) => `${c.card.id}:${c.contentHash}`);
    expect(hashes(again)).toEqual(hashes(result));
  });

  it('tague needsReview sur une couleur inconnue au lieu de perdre la carte', () => {
    const mutant = [{ ...blocks[0]!, colors: ['Pink'], variantId: 'OP16-001', baseId: 'OP16-001' }];
    const res = normalizeBlocks(mutant);
    expect(res.cards[0]?.needsReview).toBe(true);
    expect(res.issues.some((i) => i.reason.includes('Pink'))).toBe(true);
  });
});

describe('assertNoAbnormalDrop', () => {
  it('laisse passer une base vide ou en croissance', () => {
    expect(() => assertNoAbnormalDrop(155, 0)).not.toThrow();
    expect(() => assertNoAbnormalDrop(200, 155)).not.toThrow();
    expect(() => assertNoAbnormalDrop(155, 155)).not.toThrow();
  });

  it('bloque une chute anormale (> 10 %)', () => {
    expect(() => assertNoAbnormalDrop(100, 2000)).toThrow(/Chute anormale/);
  });
});

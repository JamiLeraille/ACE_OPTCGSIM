import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCardList, parseSeriesOptions } from '../src/parser.js';

// Tests de CONTRAT : fixtures HTML archivées depuis en.onepiece-cardgame.com
// (2026-07-07). Si Bandai change son markup, ces tests cassent — c'est le but.

const op16 = readFileSync(join(__dirname, 'fixtures', 'series-569116-op16.html'), 'utf8');
const st01 = readFileSync(join(__dirname, 'fixtures', 'series-569001-st01.html'), 'utf8');

describe('parseSeriesOptions', () => {
  const series = parseSeriesOptions(op16);

  it('découvre toutes les séries (53 au 2026-07-07)', () => {
    expect(series.length).toBeGreaterThanOrEqual(53);
  });

  it('ignore les options sans valeur ("ALL", "Recording")', () => {
    expect(series.every((s) => /^\d+$/.test(s.code))).toBe(true);
  });

  it('contient OP-01 (569101) et ST-01 (569001) avec un titre lisible', () => {
    const op01 = series.find((s) => s.code === '569101');
    expect(op01?.title).toContain('[OP-01]');
    expect(series.some((s) => s.code === '569001')).toBe(true);
  });
});

describe('parseCardList — fixture OP-16 (155 blocs)', () => {
  const blocks = parseCardList(op16);
  const byId = new Map(blocks.map((b) => [b.variantId, b]));

  it('extrait tous les blocs', () => {
    expect(blocks).toHaveLength(155);
  });

  it('parse un leader complet (OP16-001)', () => {
    const leader = byId.get('OP16-001');
    expect(leader).toMatchObject({
      variantId: 'OP16-001',
      baseId: 'OP16-001',
      rarity: 'L',
      category: 'LEADER',
      name: 'Portgas.D.Ace',
      costLabel: 'Life',
      costValue: '5',
      attributes: ['Special'],
      power: '5000',
      counter: '-',
      colors: ['Red'],
      types: ['Whitebeard Pirates'],
    });
    expect(leader?.effectText).toContain('[Activate: Main]');
    expect(leader?.triggerText).toBeNull();
    expect(leader?.imagePath).toContain('OP16-001.png');
    expect(leader?.rawHtml).toContain('modalCol');
  });

  it('parse un personnage avec coût et counter (OP16-004)', () => {
    expect(byId.get('OP16-004')).toMatchObject({
      category: 'CHARACTER',
      costLabel: 'Cost',
      costValue: '7',
      power: '8000',
      counter: '2000',
      attributes: ['Ranged'],
    });
  });

  it('distingue la parallèle : dl@id suffixé, infoCol = id de base, image suffixée', () => {
    const p1 = byId.get('OP16-001_p1');
    expect(p1?.baseId).toBe('OP16-001');
    expect(p1?.name).toBe('Portgas.D.Ace');
    expect(p1?.imagePath).toContain('OP16-001_p1.png');
  });

  it('parse les triggers quand ils existent', () => {
    const withTrigger = blocks.filter((b) => b.triggerText !== null);
    expect(withTrigger.length).toBeGreaterThan(0);
    expect(withTrigger.every((b) => b.triggerText?.includes('[Trigger]'))).toBe(true);
  });

  it('gère le multi-couleurs et le multi-attributs', () => {
    expect(blocks.some((b) => b.colors.length === 2)).toBe(true);
    expect(blocks.some((b) => b.attributes.length === 2)).toBe(true);
  });
});

describe('parseCardList — fixture ST-01 (petit set)', () => {
  it('extrait les 17 blocs', () => {
    expect(parseCardList(st01)).toHaveLength(17);
  });
});

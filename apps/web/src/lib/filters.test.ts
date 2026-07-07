import type { CardWithVariants } from '@op/shared';
import { describe, expect, it } from 'vitest';
import { applyFilters, catalogFacets, EMPTY_FILTERS } from './filters';

function card(overrides: Partial<CardWithVariants>): CardWithVariants {
  return {
    id: 'OP01-001',
    name: 'Test',
    category: 'CHARACTER',
    colors: ['Red'],
    cost: 3,
    power: 5000,
    counter: null,
    life: null,
    attribute: [],
    types: ['Straw Hat Crew'],
    effectText: '',
    triggerText: null,
    effect: null,
    setCode: 'OP01',
    variants: [
      {
        id: 'OP01-001',
        cardId: 'OP01-001',
        variantType: 'BASE',
        rarity: 'R',
        setCode: 'OP01',
        imageUrl: 'https://example.com/x.png',
        imageProxyUrl: '/img/x.png',
        illustrator: null,
      },
    ],
    ...overrides,
  };
}

const CATALOG = [
  card({ id: 'OP01-001', name: 'Roronoa Zoro', category: 'LEADER', cost: null, life: 5 }),
  card({ id: 'OP01-016', name: 'Nami', colors: ['Red'], cost: 1, effectText: '[Blocker]' }),
  card({
    id: 'OP02-030',
    name: 'Kouzuki Oden',
    colors: ['Green'],
    cost: 10,
    setCode: 'OP02',
    types: ['Land of Wano'],
  }),
  card({ id: 'OP03-055', name: 'Big Deal', colors: ['Blue'], cost: 12, setCode: 'OP03' }),
];

describe('applyFilters', () => {
  it('sans filtre : tout passe', () => {
    expect(applyFilters(CATALOG, EMPTY_FILTERS)).toHaveLength(4);
  });

  it('texte : nom (insensible à la casse) ou numéro', () => {
    expect(applyFilters(CATALOG, { ...EMPTY_FILTERS, text: 'zoro' })).toHaveLength(1);
    expect(applyFilters(CATALOG, { ...EMPTY_FILTERS, text: 'OP01-016' })).toHaveLength(1);
  });

  it('mot-clé dans l’effet', () => {
    const result = applyFilters(CATALOG, { ...EMPTY_FILTERS, keyword: '[blocker]' });
    expect(result.map((c) => c.id)).toEqual(['OP01-016']);
  });

  it('couleur, set, trait', () => {
    expect(applyFilters(CATALOG, { ...EMPTY_FILTERS, colors: ['Green'] })).toHaveLength(1);
    expect(applyFilters(CATALOG, { ...EMPTY_FILTERS, sets: ['OP02'] })).toHaveLength(1);
    expect(applyFilters(CATALOG, { ...EMPTY_FILTERS, trait: 'wano' })).toHaveLength(1);
  });

  it('coût : bucket 10+ regroupe 10 et plus, les leaders sont exclus', () => {
    const tenPlus = applyFilters(CATALOG, { ...EMPTY_FILTERS, costs: [10] });
    expect(tenPlus.map((c) => c.id).sort()).toEqual(['OP02-030', 'OP03-055']);
    expect(applyFilters(CATALOG, { ...EMPTY_FILTERS, costs: [1] })).toHaveLength(1);
  });

  it('catégorie', () => {
    expect(applyFilters(CATALOG, { ...EMPTY_FILTERS, categories: ['LEADER'] })).toHaveLength(1);
  });
});

describe('catalogFacets', () => {
  it('collecte sets, raretés et traits triés', () => {
    const facets = catalogFacets(CATALOG);
    expect(facets.sets).toEqual(['OP01', 'OP02', 'OP03']);
    expect(facets.rarities).toEqual(['R']);
    expect(facets.traits).toContain('Straw Hat Crew');
  });
});

import type { CardWithVariants, Category, Color } from '@op/shared';

// Filtrage du catalogue, entièrement côté client (le catalogue est chargé une fois).

export interface Filters {
  text: string; // nom de carte
  keyword: string; // mot-clé dans l'effet / trigger ([Blocker], [Rush]...)
  colors: Color[];
  costs: number[]; // 0..9, 10 = "10+"
  categories: Category[];
  sets: string[];
  rarities: string[];
  trait: string; // type/trait ("Straw Hat Crew")
}

export const EMPTY_FILTERS: Filters = {
  text: '',
  keyword: '',
  colors: [],
  costs: [],
  categories: [],
  sets: [],
  rarities: [],
  trait: '',
};

function norm(value: string): string {
  return value.toLowerCase().normalize('NFKD');
}

export function applyFilters(cards: CardWithVariants[], filters: Filters): CardWithVariants[] {
  const text = norm(filters.text.trim());
  const keyword = norm(filters.keyword.trim());
  const trait = norm(filters.trait.trim());

  return cards.filter((card) => {
    if (text && !norm(card.name).includes(text) && !norm(card.id).includes(text)) return false;
    if (
      keyword &&
      !norm(card.effectText).includes(keyword) &&
      !norm(card.triggerText ?? '').includes(keyword)
    )
      return false;
    if (filters.colors.length > 0 && !card.colors.some((c) => filters.colors.includes(c)))
      return false;
    if (filters.costs.length > 0) {
      const value = card.category === 'LEADER' ? null : card.cost;
      if (value === null) return false;
      const bucket = Math.min(value, 10);
      if (!filters.costs.includes(bucket)) return false;
    }
    if (filters.categories.length > 0 && !filters.categories.includes(card.category)) return false;
    if (filters.sets.length > 0 && !filters.sets.includes(card.setCode)) return false;
    if (
      filters.rarities.length > 0 &&
      !card.variants.some((v) => filters.rarities.includes(v.rarity))
    )
      return false;
    if (trait && !card.types.some((t) => norm(t).includes(trait))) return false;
    return true;
  });
}

/** Valeurs disponibles pour construire l'UI des filtres. */
export function catalogFacets(cards: CardWithVariants[]): {
  sets: string[];
  rarities: string[];
  traits: string[];
} {
  const sets = new Set<string>();
  const rarities = new Set<string>();
  const traits = new Set<string>();
  for (const card of cards) {
    sets.add(card.setCode);
    for (const v of card.variants) rarities.add(v.rarity);
    for (const t of card.types) traits.add(t);
  }
  return {
    sets: [...sets].sort(),
    rarities: [...rarities].sort(),
    traits: [...traits].sort(),
  };
}

import type { FastifyInstance } from 'fastify';
import { decodeAttributes, decodeColors, decodeTypes, getPrisma } from '@op/db';
import type { CardWithVariants, VariantType } from '@op/shared';

// GET /api/cards : catalogue complet (identités + variantes), consommé une fois
// par le deck-builder qui filtre ensuite côté client.

let cache: { payload: CardWithVariants[]; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60_000;

export async function loadCatalog(): Promise<CardWithVariants[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.payload;

  const prisma = getPrisma();
  const rows = await prisma.card.findMany({
    include: { variants: true },
    orderBy: { id: 'asc' },
  });

  const payload: CardWithVariants[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category as CardWithVariants['category'],
    colors: decodeColors(row.colors),
    cost: row.cost,
    power: row.power,
    counter: row.counter,
    life: row.life,
    attribute: decodeAttributes(row.attribute),
    types: decodeTypes(row.types),
    effectText: row.effectText,
    triggerText: row.triggerText,
    effect: null,
    setCode: row.setCode,
    variants: row.variants.map((v) => ({
      id: v.id,
      cardId: v.cardId,
      variantType: v.variantType as VariantType,
      rarity: v.rarity,
      setCode: v.setCode,
      imageUrl: v.imageUrl,
      imageProxyUrl: `/img/${v.id}.png`,
      illustrator: v.illustrator,
    })),
  }));

  cache = { payload, at: Date.now() };
  return payload;
}

export function registerCardRoutes(app: FastifyInstance): void {
  app.get('/api/cards', async () => {
    const cards = await loadCatalog();
    return { count: cards.length, cards };
  });
}

import { decodeAttributes, decodeColors, decodeTypes, getPrisma } from '@op/db';
import type { Card, CardWithVariants, VariantType } from '@op/shared';

// Catalogue chargé une fois depuis la base : sert à la validation SERVEUR des
// decks (légalité) et à retrouver la life du leader au setup.

let cache: Map<string, CardWithVariants> | null = null;

export async function loadCatalogById(): Promise<Map<string, CardWithVariants>> {
  if (cache) return cache;
  const prisma = getPrisma();
  const rows = await prisma.card.findMany({ include: { variants: true } });
  cache = new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        category: row.category as Card['category'],
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
      },
    ]),
  );
  return cache;
}

import { encodeJsonList, type PrismaClient } from '@op/db';
import type { IngestCard, IngestVariant } from './normalize.js';

// ---------------------------------------------------------------------------
// Upsert idempotent : rejouer l'ingestion sans changement de source ne modifie
// rien (comparaison par contentHash) ; un errata déclenche un update compté.
// ---------------------------------------------------------------------------

export interface DiffReport {
  cardsAdded: number;
  cardsUpdated: number; // errata détectés (contentHash différent)
  cardsUnchanged: number;
  variantsAdded: number;
  variantsUpdated: number;
  variantsUnchanged: number;
  needsReview: string[]; // ids de cartes taguées à relire
}

/**
 * Garde-fou : si la source renvoie nettement moins de cartes que ce que la base
 * connaît déjà (markup cassé, page vide...), on n'écrit RIEN.
 */
export function assertNoAbnormalDrop(parsedCount: number, existingCount: number): void {
  if (existingCount >= 20 && parsedCount < existingCount * 0.9) {
    throw new Error(
      `Chute anormale du nombre de cartes parsées (${parsedCount} contre ${existingCount} en base) : ingestion annulée, rien n'a été écrit.`,
    );
  }
}

export async function upsertAll(
  prisma: PrismaClient,
  cards: IngestCard[],
  variants: IngestVariant[],
): Promise<DiffReport> {
  const report: DiffReport = {
    cardsAdded: 0,
    cardsUpdated: 0,
    cardsUnchanged: 0,
    variantsAdded: 0,
    variantsUpdated: 0,
    variantsUnchanged: 0,
    needsReview: [],
  };

  for (const { card, contentHash, raw, needsReview } of cards) {
    if (needsReview) report.needsReview.push(card.id);
    const data = {
      name: card.name,
      category: card.category,
      colors: encodeJsonList(card.colors),
      cost: card.cost,
      power: card.power,
      counter: card.counter,
      life: card.life,
      attribute: encodeJsonList(card.attribute),
      types: encodeJsonList(card.types),
      effectText: card.effectText,
      triggerText: card.triggerText,
      effect: null,
      setCode: card.setCode,
      contentHash,
      raw,
      needsReview,
    };

    const existing = await prisma.card.findUnique({
      where: { id: card.id },
      select: { contentHash: true },
    });
    if (!existing) {
      await prisma.card.create({ data: { id: card.id, ...data } });
      report.cardsAdded++;
    } else if (existing.contentHash !== contentHash) {
      await prisma.card.update({ where: { id: card.id }, data });
      report.cardsUpdated++;
    } else {
      report.cardsUnchanged++;
    }
  }

  for (const variant of variants) {
    const data = {
      cardId: variant.cardId,
      variantType: variant.variantType,
      rarity: variant.rarity,
      setCode: variant.setCode,
      imageUrl: variant.imageUrl,
      illustrator: variant.illustrator,
      contentHash: variant.contentHash,
    };

    const existing = await prisma.cardVariant.findUnique({
      where: { id: variant.id },
      select: { contentHash: true },
    });
    if (!existing) {
      await prisma.cardVariant.create({ data: { id: variant.id, ...data } });
      report.variantsAdded++;
    } else if (existing.contentHash !== variant.contentHash) {
      await prisma.cardVariant.update({ where: { id: variant.id }, data });
      report.variantsUpdated++;
    } else {
      report.variantsUnchanged++;
    }
  }

  return report;
}

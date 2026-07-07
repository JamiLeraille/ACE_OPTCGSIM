import { createHash } from 'node:crypto';
import {
  ART_BASE,
  CardSchema,
  officialImageUrl,
  splitVariantId,
  type Attribute,
  type Card,
  type Color,
  type VariantType,
} from '@op/shared';
import type { RawCardBlock } from './parser.js';

// ---------------------------------------------------------------------------
// Normalisation RawCardBlock -> Card (identité, regroupe les visuels) +
// variante par impression. Tout bloc suspect est tagué needsReview au lieu
// d'être perdu silencieusement.
// ---------------------------------------------------------------------------

export interface IngestVariant {
  id: string;
  cardId: string;
  variantType: VariantType;
  rarity: string;
  setCode: string;
  imageUrl: string;
  illustrator: string | null; // non publié sur le site EN
  contentHash: string;
}

export interface IngestCard {
  card: Card;
  contentHash: string;
  raw: string; // HTML du bloc source (audit / re-parsing)
  needsReview: boolean;
}

export interface NormalizeIssue {
  variantId: string;
  reason: string;
}

export interface NormalizeResult {
  cards: IngestCard[];
  variants: IngestVariant[];
  issues: NormalizeIssue[];
}

const COLORS = new Set<Color>(['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow']);
const ATTRIBUTES = new Set<Attribute>(['Slash', 'Strike', 'Ranged', 'Special', 'Wisdom']);
const CATEGORIES = new Set(['LEADER', 'CHARACTER', 'EVENT', 'STAGE', 'DON']);

function toInt(value: string): number | null {
  const cleaned = value.replace(/[,\s]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isInteger(n) ? n : null;
}

function variantTypeFor(art: string, rarity: string, setCode: string): VariantType {
  if (art === ART_BASE) {
    if (rarity.toUpperCase().startsWith('SP')) return 'SP';
    if (setCode === 'P') return 'PROMO';
    return 'BASE';
  }
  if (art.startsWith('p')) return 'PARALLEL';
  if (art.startsWith('r')) return 'REPRINT';
  return 'ALT_ART';
}

function hashOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

export function normalizeBlocks(blocks: RawCardBlock[]): NormalizeResult {
  const issues: NormalizeIssue[] = [];
  const cardsById = new Map<string, IngestCard>();
  const cardsFromBaseArt = new Set<string>();
  const variantsById = new Map<string, IngestVariant>();

  for (const block of blocks) {
    const { cardId, art } = splitVariantId(block.variantId);
    if (!block.variantId || !cardId) {
      issues.push({ variantId: block.variantId, reason: 'Bloc sans id exploitable.' });
      continue;
    }
    if (block.baseId && block.baseId !== cardId) {
      issues.push({
        variantId: block.variantId,
        reason: `Id incohérent : dl@id=${block.variantId} mais infoCol=${block.baseId}.`,
      });
    }

    const setCode = cardId.split('-')[0] ?? '';
    let needsReview = false;

    // --- Champs de jeu ---
    const colors = block.colors.filter((c): c is Color => COLORS.has(c as Color));
    if (colors.length !== block.colors.length || colors.length === 0) {
      issues.push({
        variantId: block.variantId,
        reason: `Couleur(s) inconnue(s) : "${block.colors.join('/')}".`,
      });
      needsReview = true;
    }
    const attribute = block.attributes.filter((a): a is Attribute =>
      ATTRIBUTES.has(a as Attribute),
    );
    if (attribute.length !== block.attributes.length) {
      issues.push({
        variantId: block.variantId,
        reason: `Attribut(s) inconnu(s) : "${block.attributes.join('/')}".`,
      });
      needsReview = true;
    }
    if (!CATEGORIES.has(block.category)) {
      issues.push({
        variantId: block.variantId,
        reason: `Catégorie inconnue : "${block.category}".`,
      });
      needsReview = true;
    }

    const isLife = block.costLabel === 'Life';
    const card: Card = {
      id: cardId,
      name: block.name,
      category: block.category as Card['category'],
      colors,
      cost: isLife ? null : toInt(block.costValue),
      power: toInt(block.power),
      counter: toInt(block.counter),
      life: isLife ? toInt(block.costValue) : null,
      attribute,
      types: block.types,
      effectText: block.effectText === '-' ? '' : block.effectText,
      triggerText: block.triggerText === '-' ? null : block.triggerText,
      effect: null, // EffectScript : Phase 4
      setCode,
    };

    if (!CardSchema.safeParse(card).success) {
      needsReview = true;
    }

    // --- Identité : le bloc de base fait foi ; une parallèle ne sert que si
    // l'identité n'a encore été vue qu'à travers une autre parallèle ---
    if (!cardsById.has(cardId) || (art === ART_BASE && !cardsFromBaseArt.has(cardId))) {
      cardsById.set(cardId, {
        card,
        contentHash: hashOf(card),
        raw: block.rawHtml,
        needsReview,
      });
      if (art === ART_BASE) cardsFromBaseArt.add(cardId);
    }

    // --- Variante ---
    const expectedImage = `${block.variantId}.png`;
    const imageFile = block.imagePath.split('/').pop()?.split('?')[0] ?? '';
    if (imageFile !== expectedImage) {
      issues.push({
        variantId: block.variantId,
        reason: `Image inattendue : "${imageFile}" (attendu "${expectedImage}").`,
      });
    }
    if (!variantsById.has(block.variantId)) {
      const variant: Omit<IngestVariant, 'contentHash'> = {
        id: block.variantId,
        cardId,
        variantType: variantTypeFor(art, block.rarity, setCode),
        rarity: block.rarity,
        setCode,
        imageUrl: officialImageUrl(block.variantId),
        illustrator: null,
      };
      variantsById.set(block.variantId, { ...variant, contentHash: hashOf(variant) });
    }
  }

  return {
    cards: [...cardsById.values()],
    variants: [...variantsById.values()],
    issues,
  };
}

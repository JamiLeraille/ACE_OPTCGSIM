import { z } from 'zod';

// ---------------------------------------------------------------------------
// Identité de JEU vs variante VISUELLE : séparation stricte.
// Toutes les règles s'appuient sur `Card` (le numéro), jamais sur la variante.
// ---------------------------------------------------------------------------

export type Color = 'Red' | 'Green' | 'Blue' | 'Purple' | 'Black' | 'Yellow';
export type Category = 'LEADER' | 'CHARACTER' | 'EVENT' | 'STAGE' | 'DON';
export type Attribute = 'Slash' | 'Strike' | 'Ranged' | 'Special' | 'Wisdom';
export type VariantType = 'BASE' | 'PARALLEL' | 'ALT_ART' | 'PROMO' | 'MANGA' | 'SP' | 'REPRINT';

/** Identité de JEU. Clé = numéro sans suffixe de variante (ex. "OP01-001"). */
export interface Card {
  id: string; // "OP01-001"
  name: string;
  category: Category;
  colors: Color[];
  cost: number | null; // null pour Leader/DON
  power: number | null;
  counter: number | null;
  life: number | null; // Leaders uniquement
  attribute: Attribute[];
  types: string[]; // ex. ["Straw Hat Crew","Supernovas"]
  effectText: string;
  triggerText: string | null;
  effect: unknown | null; // EffectScript data-driven, null pour l'instant (Phase 4)
  setCode: string; // "OP01"
}

/** VISUEL. Plusieurs par Card. Aucun impact sur les règles. */
export interface CardVariant {
  id: string; // "OP01-001" (base) ou "OP01-006_p1" (parallèle)
  cardId: string; // FK -> Card.id (numéro de base, sans suffixe)
  variantType: VariantType;
  rarity: string; // C, UC, R, SR, SEC, L...
  setCode: string;
  imageUrl: string; // URL brute du CDN officiel Bandai
  imageProxyUrl: string; // URL passant par notre proxy de cache
  illustrator: string | null;
}

// ---------------------------------------------------------------------------
// Schémas Zod (validation runtime au bord des API et à l'import de deck)
// ---------------------------------------------------------------------------

export const ColorSchema = z.enum(['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow']);
export const CategorySchema = z.enum(['LEADER', 'CHARACTER', 'EVENT', 'STAGE', 'DON']);
export const AttributeSchema = z.enum(['Slash', 'Strike', 'Ranged', 'Special', 'Wisdom']);
export const VariantTypeSchema = z.enum([
  'BASE',
  'PARALLEL',
  'ALT_ART',
  'PROMO',
  'MANGA',
  'SP',
  'REPRINT',
]);

/** Numéro de carte sans suffixe de variante : OP01-001, ST01-006, EB01-001, PRB01-001, P-001. */
export const CARD_ID_REGEX = /^(OP|ST|EB|PRB|P)\d*-\d+$/;
export const CardIdSchema = z.string().regex(CARD_ID_REGEX, 'Numéro de carte invalide');

/** Id de variante = numéro de base + suffixe optionnel (_p1, _p2, _r1...). */
export const VARIANT_ID_REGEX = /^(OP|ST|EB|PRB|P)\d*-\d+(_[a-z]\d+)?$/;
export const VariantIdSchema = z.string().regex(VARIANT_ID_REGEX, 'Id de variante invalide');

export const CardSchema = z.object({
  id: CardIdSchema,
  name: z.string().min(1),
  category: CategorySchema,
  colors: z.array(ColorSchema).min(1),
  cost: z.number().int().min(0).nullable(),
  power: z.number().int().min(0).nullable(),
  counter: z.number().int().min(0).nullable(),
  life: z.number().int().min(0).nullable(),
  attribute: z.array(AttributeSchema),
  types: z.array(z.string()),
  effectText: z.string(),
  triggerText: z.string().nullable(),
  effect: z.unknown().nullable(),
  setCode: z.string().min(1),
});

export const CardVariantSchema = z.object({
  id: VariantIdSchema,
  cardId: CardIdSchema,
  variantType: VariantTypeSchema,
  rarity: z.string().min(1),
  setCode: z.string().min(1),
  imageUrl: z.string().url(),
  imageProxyUrl: z.string(),
  illustrator: z.string().nullable(),
});

/** Vue "catalogue" : une identité de jeu avec tous ses visuels (contrat API <-> web). */
export interface CardWithVariants extends Card {
  variants: CardVariant[];
}

import { z } from 'zod';
import { CardIdSchema } from './cards.js';
import { DECK_SIZE, MAX_COPIES_PER_CARD } from './decks.js';

// ---------------------------------------------------------------------------
// Format d'échange `optcg-deck` v1 : notre source de vérité, conserve la
// variante visuelle choisie (`art`) — ce que le texte OPTCG Sim ne sait pas faire.
// ---------------------------------------------------------------------------

/** Art "base" = l'impression de base (id de variante sans suffixe). */
export const ART_BASE = 'base';

/** "base" ou un suffixe d'impression : p1, p2, r1... */
export const ArtSchema = z
  .string()
  .regex(/^(base|[a-z]\d+)$/, 'Art invalide (attendu "base" ou un suffixe comme "p1")');

export interface DeckFileMeta {
  name: string;
  author?: string;
  region?: string;
  createdAt?: string;
}

export interface DeckFileCardEntry {
  id: string; // identité de jeu ("OP01-016")
  qty: number;
  art: string; // "base" | "p1" | ...
}

export interface DeckFile {
  format: 'optcg-deck';
  version: 1;
  meta: DeckFileMeta;
  leader: { id: string; art: string };
  cards: DeckFileCardEntry[];
}

export const DeckFileSchema = z.object({
  format: z.literal('optcg-deck'),
  version: z.literal(1),
  meta: z.object({
    name: z.string().min(1).max(120),
    author: z.string().max(80).optional(),
    region: z.string().max(8).optional(),
    createdAt: z.string().optional(),
  }),
  leader: z.object({
    id: CardIdSchema,
    art: ArtSchema.default(ART_BASE),
  }),
  cards: z.array(
    z.object({
      id: CardIdSchema,
      qty: z.number().int().min(1).max(MAX_COPIES_PER_CARD),
      art: ArtSchema.default(ART_BASE),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Correspondance (cardId, art) <-> id de variante
// ---------------------------------------------------------------------------

/** ("OP01-006", "p1") -> "OP01-006_p1" ; ("OP01-006", "base") -> "OP01-006". */
export function variantIdForArt(cardId: string, art: string): string {
  return art === ART_BASE ? cardId : `${cardId}_${art}`;
}

/** "OP01-006_p1" -> { cardId: "OP01-006", art: "p1" }. */
export function splitVariantId(variantId: string): { cardId: string; art: string } {
  const suffixStart = variantId.search(/_[a-z]\d+$/);
  if (suffixStart === -1) return { cardId: variantId, art: ART_BASE };
  return { cardId: variantId.slice(0, suffixStart), art: variantId.slice(suffixStart + 1) };
}

/** Identité de jeu d'un id de variante ("OP01-006_p1" -> "OP01-006"). */
export function cardIdFromVariantId(variantId: string): string {
  return splitVariantId(variantId).cardId;
}

// ---------------------------------------------------------------------------
// Validation structurelle du fichier (sans base de cartes) :
// somme des quantités = 50, max 4 par identité toutes entrées confondues.
// Les règles nécessitant la base (couleurs, catégories) sont dans deck-validation.ts.
// ---------------------------------------------------------------------------

export type DeckFileIssue =
  | { code: 'DECK_SIZE'; actual: number; message: string }
  | { code: 'TOO_MANY_COPIES'; cardId: string; quantity: number; message: string };

export function validateDeckFile(file: DeckFile): DeckFileIssue[] {
  const issues: DeckFileIssue[] = [];

  const total = file.cards.reduce((sum, entry) => sum + entry.qty, 0);
  if (total !== DECK_SIZE) {
    issues.push({
      code: 'DECK_SIZE',
      actual: total,
      message: `Le deck contient ${total} carte(s) au lieu de ${DECK_SIZE}.`,
    });
  }

  const byCardId = new Map<string, number>();
  for (const entry of file.cards) {
    byCardId.set(entry.id, (byCardId.get(entry.id) ?? 0) + entry.qty);
  }
  for (const [cardId, quantity] of byCardId) {
    if (quantity > MAX_COPIES_PER_CARD) {
      issues.push({
        code: 'TOO_MANY_COPIES',
        cardId,
        quantity,
        message: `${cardId} : ${quantity} exemplaires (maximum ${MAX_COPIES_PER_CARD}, toutes variantes confondues).`,
      });
    }
  }

  return issues;
}

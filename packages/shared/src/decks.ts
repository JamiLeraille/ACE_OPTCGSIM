import { z } from 'zod';
import { CardIdSchema, VariantIdSchema } from './cards.js';

// ---------------------------------------------------------------------------
// Deck : les règles de comptage portent sur `cardId` (identité de jeu),
// `variantId` ne porte que le visuel choisi.
// ---------------------------------------------------------------------------

export interface DeckCardEntry {
  cardId: string; // identité (compte pour "max 4 par id")
  variantId: string; // visuel choisi
  quantity: number;
}

export interface Deck {
  id: string;
  ownerId: string | null; // null = deck anonyme/local
  name: string;
  leaderVariantId: string; // leader + sa variante visuelle
  cards: DeckCardEntry[]; // 50 cartes hors leader
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  handle: string;
  email: string | null;
  passwordHash: string | null;
  createdAt: string;
  elo: number;
}

// Règles de construction (Comprehensive Rules v1.2.0) :
// 1 leader, 50 cartes exactement, max 4 par Card.id toutes variantes confondues,
// chaque carte partage au moins une couleur avec le leader.
export const DECK_SIZE = 50;
export const MAX_COPIES_PER_CARD = 4;

export const DeckCardEntrySchema = z.object({
  cardId: CardIdSchema,
  variantId: VariantIdSchema,
  quantity: z.number().int().min(1).max(MAX_COPIES_PER_CARD),
});

export const DeckSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().nullable(),
  name: z.string().min(1).max(120),
  leaderVariantId: VariantIdSchema,
  cards: z.array(DeckCardEntrySchema),
  isPublic: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const UserSchema = z.object({
  id: z.string().min(1),
  handle: z.string().min(1).max(40),
  email: z.string().email().nullable(),
  passwordHash: z.string().nullable(),
  createdAt: z.string(),
  elo: z.number().int(),
});

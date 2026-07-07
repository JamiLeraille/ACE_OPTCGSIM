import { PrismaClient } from '@prisma/client';
import type { Attribute, Color } from '@op/shared';

export { PrismaClient } from '@prisma/client';
export type { Card, CardVariant, Deck, DeckCard, User } from '@prisma/client';

let client: PrismaClient | undefined;

/** Client Prisma partagé (singleton par process). */
export function getPrisma(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}

// ---------------------------------------------------------------------------
// SQLite ne supporte pas les colonnes JSON natives : les listes du domaine
// sont stockées en String JSON-encodée. Ces helpers sont l'unique point de
// conversion entre lignes DB et types du domaine (@op/shared).
// ---------------------------------------------------------------------------

export function encodeJsonList(values: readonly string[]): string {
  return JSON.stringify(values);
}

export function decodeColors(raw: string): Color[] {
  return JSON.parse(raw) as Color[];
}

export function decodeAttributes(raw: string): Attribute[] {
  return JSON.parse(raw) as Attribute[];
}

export function decodeTypes(raw: string): string[] {
  return JSON.parse(raw) as string[];
}

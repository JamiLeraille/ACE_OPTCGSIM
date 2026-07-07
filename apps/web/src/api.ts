import type { CardWithVariants, DeckCardEntry } from '@op/shared';

// Client API minimal : mêmes types que le serveur via @op/shared.

export interface SharedDeck {
  id: string;
  name: string;
  leaderVariantId: string;
  cards: DeckCardEntry[];
  createdAt: string;
}

export async function fetchCatalog(): Promise<CardWithVariants[]> {
  const res = await fetch('/api/cards');
  if (!res.ok) throw new Error(`Catalogue indisponible (HTTP ${res.status})`);
  const body = (await res.json()) as { cards: CardWithVariants[] };
  return body.cards;
}

export async function shareDeck(input: {
  name: string;
  leaderVariantId: string;
  cards: DeckCardEntry[];
}): Promise<string> {
  const res = await fetch('/api/decks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Partage impossible (HTTP ${res.status})`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function fetchSharedDeck(id: string): Promise<SharedDeck> {
  const res = await fetch(`/api/decks/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Deck introuvable (HTTP ${res.status})`);
  return (await res.json()) as SharedDeck;
}

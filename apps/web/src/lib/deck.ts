import {
  ART_BASE,
  DECK_SIZE,
  MAX_COPIES_PER_CARD,
  splitVariantId,
  variantIdForArt,
  type CardWithVariants,
  type DeckCardEntry,
  type DeckFile,
} from '@op/shared';

// État du deck en construction + reducer pur (testé), persisté en localStorage.

export interface BuilderEntry {
  variantId: string;
  quantity: number;
}

export interface BuilderState {
  name: string;
  leaderVariantId: string | null;
  entries: Record<string, BuilderEntry>; // clé = cardId (identité)
}

export const EMPTY_DECK: BuilderState = {
  name: 'Nouveau deck',
  leaderVariantId: null,
  entries: {},
};

export type BuilderAction =
  | { type: 'setName'; name: string }
  | { type: 'setLeader'; variantId: string | null }
  | { type: 'add'; cardId: string; defaultVariantId: string }
  | { type: 'remove'; cardId: string }
  | { type: 'setVariant'; cardId: string; variantId: string }
  | { type: 'reset' }
  | { type: 'load'; state: BuilderState };

export function totalCards(state: BuilderState): number {
  return Object.values(state.entries).reduce((sum, e) => sum + e.quantity, 0);
}

export function deckReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'setName':
      return { ...state, name: action.name };
    case 'setLeader':
      return { ...state, leaderVariantId: action.variantId };
    case 'add': {
      const existing = state.entries[action.cardId];
      if (existing && existing.quantity >= MAX_COPIES_PER_CARD) return state;
      if (!existing && totalCards(state) >= DECK_SIZE) return state;
      const entry: BuilderEntry = existing
        ? { ...existing, quantity: existing.quantity + 1 }
        : { variantId: action.defaultVariantId, quantity: 1 };
      return { ...state, entries: { ...state.entries, [action.cardId]: entry } };
    }
    case 'remove': {
      const existing = state.entries[action.cardId];
      if (!existing) return state;
      const entries = { ...state.entries };
      if (existing.quantity <= 1) delete entries[action.cardId];
      else entries[action.cardId] = { ...existing, quantity: existing.quantity - 1 };
      return { ...state, entries };
    }
    case 'setVariant': {
      const existing = state.entries[action.cardId];
      if (!existing) return state;
      return {
        ...state,
        entries: {
          ...state.entries,
          [action.cardId]: { ...existing, variantId: action.variantId },
        },
      };
    }
    case 'reset':
      return EMPTY_DECK;
    case 'load':
      return action.state;
    default:
      return state;
  }
}

export function toDeckEntries(state: BuilderState): DeckCardEntry[] {
  return Object.entries(state.entries)
    .map(([cardId, e]) => ({ cardId, variantId: e.variantId, quantity: e.quantity }))
    .sort((a, b) => a.cardId.localeCompare(b.cardId));
}

export function toDeckFile(state: BuilderState): DeckFile {
  const leader = state.leaderVariantId
    ? splitVariantId(state.leaderVariantId)
    : { cardId: '', art: ART_BASE };
  return {
    format: 'optcg-deck',
    version: 1,
    meta: { name: state.name },
    leader: { id: leader.cardId, art: leader.art },
    cards: toDeckEntries(state).map((e) => ({
      id: e.cardId,
      qty: e.quantity,
      art: splitVariantId(e.variantId).art,
    })),
  };
}

/**
 * Charge un DeckFile dans le builder. Les arts inconnus du catalogue retombent
 * sur la variante de base ; les identités inconnues sont ignorées et remontées.
 */
export function fromDeckFile(
  file: DeckFile,
  byCardId: Map<string, CardWithVariants>,
): { state: BuilderState; warnings: string[] } {
  const warnings: string[] = [];

  const resolveVariant = (cardId: string, art: string): string | null => {
    const card = byCardId.get(cardId);
    if (!card) return null;
    const wanted = variantIdForArt(cardId, art);
    if (card.variants.some((v) => v.id === wanted)) return wanted;
    if (art !== ART_BASE) {
      warnings.push(`${cardId} : art "${art}" inconnu, variante de base utilisée.`);
      return cardId;
    }
    return cardId;
  };

  let leaderVariantId: string | null = null;
  if (file.leader.id) {
    leaderVariantId = resolveVariant(file.leader.id, file.leader.art);
    if (!leaderVariantId) warnings.push(`Leader ${file.leader.id} inconnu du catalogue.`);
  }

  const entries: Record<string, BuilderEntry> = {};
  for (const card of file.cards) {
    const variantId = resolveVariant(card.id, card.art);
    if (!variantId) {
      warnings.push(`${card.id} inconnu du catalogue : ignoré.`);
      continue;
    }
    const existing = entries[card.id];
    const quantity = Math.min((existing?.quantity ?? 0) + card.qty, MAX_COPIES_PER_CARD);
    entries[card.id] = { variantId: existing?.variantId ?? variantId, quantity };
  }

  return { state: { name: file.meta.name, leaderVariantId, entries }, warnings };
}

// --- Persistance locale (l'app est un vrai site web : localStorage OK) ---

const STORAGE_KEY = 'optcg:builder:v1';

export function loadLocalDeck(): BuilderState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BuilderState;
  } catch {
    return null;
  }
}

export function saveLocalDeck(state: BuilderState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // stockage plein ou indisponible : l'app reste utilisable sans persistance
  }
}

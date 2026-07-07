import type { Card } from './cards.js';
import { cardIdFromVariantId } from './deck-format.js';
import { DECK_SIZE, MAX_COPIES_PER_CARD, type Deck } from './decks.js';

// ---------------------------------------------------------------------------
// Règles de construction de deck (Comprehensive Rules v1.2.0) :
//   - exactement 1 leader (catégorie LEADER) ;
//   - deck principal de 50 cartes exactement (CHARACTER / EVENT / STAGE) ;
//   - max 4 exemplaires par NUMÉRO (Card.id), toutes variantes confondues ;
//   - chaque carte partage au moins une couleur avec le leader.
// Toutes les règles s'appuient sur `Card` (identité), jamais sur la variante.
// ---------------------------------------------------------------------------

export type DeckValidationError =
  | { code: 'LEADER_MISSING'; message: string }
  | { code: 'LEADER_NOT_A_LEADER'; cardId: string; category: Card['category']; message: string }
  | { code: 'UNKNOWN_CARD'; cardId: string; message: string }
  | { code: 'DECK_SIZE'; expected: number; actual: number; message: string }
  | { code: 'TOO_MANY_COPIES'; cardId: string; quantity: number; max: number; message: string }
  | {
      code: 'COLOR_MISMATCH';
      cardId: string;
      cardColors: Card['colors'];
      leaderColors: Card['colors'];
      message: string;
    }
  | { code: 'INVALID_CATEGORY'; cardId: string; category: Card['category']; message: string }
  | { code: 'VARIANT_MISMATCH'; cardId: string; variantId: string; message: string };

export interface DeckValidationResult {
  valid: boolean;
  errors: DeckValidationError[];
}

/** Résolution d'une identité de carte, branchée sur la base (ou un cache client). */
export type CardLookup = (cardId: string) => Card | undefined;

export function validateDeck(
  deck: Pick<Deck, 'leaderVariantId' | 'cards'>,
  getCard: CardLookup,
): DeckValidationResult {
  const errors: DeckValidationError[] = [];

  // --- Leader ---
  const leaderCardId = cardIdFromVariantId(deck.leaderVariantId);
  const leader = leaderCardId ? getCard(leaderCardId) : undefined;
  if (!leaderCardId || !leader) {
    errors.push({
      code: 'LEADER_MISSING',
      message: leaderCardId ? `Leader inconnu : ${leaderCardId}.` : 'Le deck doit avoir un leader.',
    });
  } else if (leader.category !== 'LEADER') {
    errors.push({
      code: 'LEADER_NOT_A_LEADER',
      cardId: leader.id,
      category: leader.category,
      message: `${leader.id} (${leader.name}) est de catégorie ${leader.category}, pas LEADER.`,
    });
  }

  // --- Taille du deck principal ---
  const total = deck.cards.reduce((sum, entry) => sum + entry.quantity, 0);
  if (total !== DECK_SIZE) {
    errors.push({
      code: 'DECK_SIZE',
      expected: DECK_SIZE,
      actual: total,
      message: `Le deck contient ${total} carte(s) au lieu de ${DECK_SIZE} (leader non compris).`,
    });
  }

  // --- Agrégat par identité (les variantes d'un même numéro comptent ensemble) ---
  const byCardId = new Map<string, number>();
  for (const entry of deck.cards) {
    byCardId.set(entry.cardId, (byCardId.get(entry.cardId) ?? 0) + entry.quantity);

    if (cardIdFromVariantId(entry.variantId) !== entry.cardId) {
      errors.push({
        code: 'VARIANT_MISMATCH',
        cardId: entry.cardId,
        variantId: entry.variantId,
        message: `La variante ${entry.variantId} n'appartient pas à la carte ${entry.cardId}.`,
      });
    }
  }

  for (const [cardId, quantity] of byCardId) {
    if (quantity > MAX_COPIES_PER_CARD) {
      errors.push({
        code: 'TOO_MANY_COPIES',
        cardId,
        quantity,
        max: MAX_COPIES_PER_CARD,
        message: `${cardId} : ${quantity} exemplaires (maximum ${MAX_COPIES_PER_CARD}, toutes variantes confondues).`,
      });
    }

    const card = getCard(cardId);
    if (!card) {
      errors.push({
        code: 'UNKNOWN_CARD',
        cardId,
        message: `Carte inconnue : ${cardId}.`,
      });
      continue;
    }

    if (card.category === 'LEADER' || card.category === 'DON') {
      errors.push({
        code: 'INVALID_CATEGORY',
        cardId,
        category: card.category,
        message: `${cardId} (${card.name}) est de catégorie ${card.category} : interdit dans le deck principal.`,
      });
    }

    if (leader && leader.category === 'LEADER') {
      const sharesColor = card.colors.some((color) => leader.colors.includes(color));
      if (!sharesColor) {
        errors.push({
          code: 'COLOR_MISMATCH',
          cardId,
          cardColors: card.colors,
          leaderColors: leader.colors,
          message: `${cardId} (${card.name}, ${card.colors.join('/')}) ne partage aucune couleur avec le leader (${leader.colors.join('/')}).`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

import {
  fromSimText,
  validateDeck,
  variantIdForArt,
  type CardWithVariants,
  type PlayerSetup,
} from '@op/shared';

// Pont deck-builder / moteur : transforme une liste (texte OPTCG Sim) en
// PlayerSetup (50 variantIds développés + life du leader depuis le catalogue).

export interface SetupResult {
  setup: PlayerSetup | null;
  errors: string[];
  warnings: string[];
}

export function setupFromSimText(
  name: string,
  text: string,
  byCardId: Map<string, CardWithVariants>,
): SetupResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { deck, issues } = fromSimText(text, (id) => byCardId.get(id)?.category === 'LEADER');
  warnings.push(...issues.filter((i) => i.line > 0).map((i) => `Ligne ${i.line} : ${i.reason}`));
  if (!deck) {
    return { setup: null, errors: ['Aucun leader identifié dans la liste.'], warnings };
  }

  const leaderCard = byCardId.get(deck.leader.id);
  if (!leaderCard || leaderCard.life === null) {
    return {
      setup: null,
      errors: [`Leader ${deck.leader.id} introuvable au catalogue.`],
      warnings,
    };
  }

  const resolveVariant = (cardId: string, art: string): string => {
    const card = byCardId.get(cardId);
    const wanted = variantIdForArt(cardId, art);
    if (card?.variants.some((v) => v.id === wanted)) return wanted;
    return cardId;
  };

  const cards: string[] = [];
  for (const entry of deck.cards) {
    if (!byCardId.has(entry.id)) {
      errors.push(`${entry.id} inconnu du catalogue.`);
      continue;
    }
    const variantId = resolveVariant(entry.id, entry.art);
    for (let i = 0; i < entry.qty; i++) cards.push(variantId);
  }
  if (cards.length !== 50) {
    errors.push(`Le deck contient ${cards.length} carte(s) au lieu de 50.`);
  }

  // Légalité complète (couleurs, max 4…) : bloquant pour respecter les règles.
  const validation = validateDeck(
    {
      leaderVariantId: deck.leader.id,
      cards: deck.cards.map((c) => ({
        cardId: c.id,
        variantId: resolveVariant(c.id, c.art),
        quantity: c.qty,
      })),
    },
    (id) => byCardId.get(id),
  );
  errors.push(...validation.errors.map((e) => e.message));

  if (errors.length > 0) return { setup: null, errors: [...new Set(errors)], warnings };

  return {
    setup: {
      name: name.trim() === '' ? 'Joueur' : name.trim(),
      leaderVariantId: resolveVariant(deck.leader.id, deck.leader.art),
      leaderLife: leaderCard.life,
      cards,
    },
    errors: [],
    warnings,
  };
}

# @op/shared

Source de vérité unique du domaine, importée à l'identique par le deck-builder (`apps/web`),
l'API (`apps/api`), l'ingestion (`apps/ingest`) et — plus tard — le serveur de jeu et le
moteur `@op/engine`.

## Contenu

- `cards.ts` — `Card` (identité de jeu, clé = numéro sans suffixe) et `CardVariant`
  (visuel : base, parallèle, alt-art…). Séparation stricte : **les règles ne regardent
  jamais la variante**.
- `decks.ts` — `Deck`, `DeckCardEntry`, `User` + constantes de règles (`DECK_SIZE = 50`,
  `MAX_COPIES_PER_CARD = 4`).
- `deck-format.ts` — format d'échange **`optcg-deck` v1** (JSON riche qui conserve la
  variante visuelle), helpers `(cardId, art) <-> variantId`, validation structurelle
  (`validateDeckFile` : somme = 50, max 4 par identité).
- `deck-validation.ts` — `validateDeck(deck, getCard)` : règles complètes de construction
  (Comprehensive Rules v1.2.0 — leader unique, 50 cartes, max 4 par numéro toutes variantes
  confondues, contrainte de couleur). Retourne des erreurs **typées et exploitables par
  l'UI** (union discriminée `DeckValidationError`).
- `sim-text.ts` — compatibilité OPTCG Sim : `toSimText` (leader en première ligne, art
  omis volontairement) et `fromSimText(text, isLeader)` (tolérant : espaces, casse,
  suffixe d'art optionnel, doublons fusionnés, erreurs par ligne).
- `images.ts` — point de passage **unique** pour les URLs d'images (contrainte juridique :
  hot-link/proxy vers le CDN officiel Bandai, jamais de rehébergement, kill-switch).

Chaque type exporte son schéma Zod (`CardSchema`, `DeckSchema`, `DeckFileSchema`, …) pour
la validation runtime au bord des API et à l'import de deck.

## À venir (phases suivantes)

- Moteur déterministe `@op/engine` (Phases 2–4).

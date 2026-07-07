# @op/db

Schéma Prisma + client partagé. **SQLite en dev** (`file:./dev.db`), schéma pensé pour
**Postgres en prod** (les enums du domaine sont des `String` validées par Zod côté
`@op/shared`, les listes sont JSON-encodées — migrables vers JSONB sans changer le
modèle logique).

## Modèles

- `Card` — identité de jeu (clé = numéro sans suffixe). Porte aussi `contentHash`
  (détection d'errata), `raw` (HTML d'origine pour audit) et `needsReview`.
- `CardVariant` — visuels (base / parallèle / alt-art…), FK vers `Card`. `imageUrl`
  pointe vers le CDN officiel Bandai, jamais rehébergée.
- `User`, `Deck`, `DeckCard` — comptes et decks (quantité par identité, variante = visuel).

## Commandes

```bash
pnpm --filter @op/db db:generate   # génère le client (aussi en postinstall)
pnpm --filter @op/db db:migrate    # crée/applique les migrations (dev)
pnpm --filter @op/db db:studio     # explorer la base
```

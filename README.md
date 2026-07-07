# optcg-sim

Simulateur en ligne du One Piece Card Game — **fan-made, gratuit, non commercial, non
affilié à Bandai**. One Piece Card Game © Eiichiro Oda / Shueisha / Toei Animation / Bandai.

Construction par couches : deck-builder d'abord, puis plateau, multijoueur temps réel
(serveur autoritaire Colyseus) et moteur de règles automatisé progressif.

## Monorepo (pnpm workspaces + Turborepo)

| Package            | Rôle                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `apps/web`         | React + Vite + Tailwind — deck-builder (Phase 1), table de jeu ensuite |
| `apps/api`         | Fastify + Zod — comptes, decks, catalogue (Phase 1)                    |
| `apps/ingest`      | Scraper Bandai → normalisation → upsert idempotent (Phase 0)           |
| `apps/game-server` | Colyseus — serveur autoritaire multijoueur (rooms, spectateurs, chat)  |
| `packages/shared`  | Types du domaine + schémas Zod + moteur @op/engine — source de vérité  |
| `packages/db`      | Prisma (SQLite dev / Postgres prod)                                    |

## Démarrage

```bash
pnpm install          # installe + génère le client Prisma
pnpm --filter @op/db db:migrate   # crée la base SQLite de dev
pnpm dev              # lance web + api en watch
pnpm lint && pnpm typecheck && pnpm test
```

## Principes non négociables

- **Identité de jeu ≠ variante visuelle** : les règles s'appuient sur `Card` (numéro),
  jamais sur `CardVariant` (alt-art).
- **Images jamais rehébergées** : hot-link/proxy vers le CDN officiel, un seul point de
  passage dans le code (`@op/shared/images`), kill-switch par variable d'env.
- **Serveur autoritaire** (Phase 3) : le client envoie des intentions, jamais des états.
- Types et validation partagés partout via `@op/shared`.

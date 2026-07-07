# @op/ingest

Pipeline d'ingestion : scrape le site officiel Bandai (`en.onepiece-cardgame.com/cardlist`),
normalise vers `Card` + `CardVariant`, upsert idempotent, rapport de diff à chaque run.

```bash
pnpm --filter @op/ingest ingest                        # toutes les séries
pnpm --filter @op/ingest ingest -- --series=569116     # une ou plusieurs séries (codes)
pnpm --filter @op/ingest ingest -- --dry-run           # sans écrire en base
```

## Architecture

- `parser.ts` — parsing cheerio isolé (`parseSeriesOptions`, `parseCardList`).
  **Tests de contrat** contre les fixtures HTML archivées dans `test/fixtures/` :
  si Bandai change son markup, les tests cassent, pas la prod.
- `normalize.ts` — `RawCardBlock` → `Card` (identité, regroupe les visuels) +
  `IngestVariant` par impression. `contentHash` (errata), HTML brut conservé (audit),
  anomalies taguées `needsReview` au lieu d'être perdues.
- `fetch.ts` — throttling (1,2 s), retry exponentiel (x3), cookies de session +
  redirections (le site répond 302 à la première visite).
- `upsert.ts` — upsert idempotent (comparaison `contentHash`) + **garde-fou** :
  si le nombre de cartes parsées chute de plus de 10 % par rapport à la base,
  l'ingestion est annulée sans rien écrire.

## Particularités du markup Bandai (2026-07)

- `dl.modalCol@id` = id de variante (`OP16-001`, `OP16-001_p1`) ; l'`infoCol`
  affiche toujours l'id de base.
- Le champ `cost` porte un `<h3>` "Life" pour les leaders, "Cost" sinon.
- Couleurs, attributs et types sont séparés par `/` ; valeurs vides = `-`.
- Images en lazy-load : l'URL réelle est dans `data-src`.
- Une carte rééditée apparaît dans plusieurs pages de série : première vue gagne.

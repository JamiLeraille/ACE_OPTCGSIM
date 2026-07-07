# @op/ingest

Pipeline d'ingestion : scrape le site officiel Bandai (`en.onepiece-cardgame.com/cardlist`),
normalise vers `Card` + `CardVariant`, upsert idempotent avec `contentHash` (errata),
HTML brut conservé pour audit, rapport de diff à chaque run.

```bash
pnpm --filter @op/ingest ingest
```

Robustesse prévue : throttling + retry exponentiel, fixtures HTML archivées + tests de
contrat du parser, alerte (et aucun push en base) si le nombre de cartes chute anormalement.

État : squelette — le parser est la prochaine étape de la Phase 0.

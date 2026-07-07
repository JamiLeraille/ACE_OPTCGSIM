// Pipeline d'ingestion (Phase 0) : scrape du site officiel Bandai
// (en.onepiece-cardgame.com/cardlist) → normalisation Card/CardVariant → upsert idempotent.
//
// Étapes prévues :
//   1. Découvrir les séries (parser le <select> de série).
//   2. Requêter chaque série (User-Agent réaliste, throttling + retry exponentiel).
//   3. Normaliser : Card.id = numéro sans suffixe ; chaque impression → CardVariant.
//   4. Upsert idempotent + contentHash (errata) + raw (audit).
//   5. Rapport de diff (ajouts / variantes / errata / needsReview).
//
// Le parser sera isolé et testé contre des fixtures HTML archivées (tests de contrat).

async function main(): Promise<void> {
  console.log('[ingest] Pipeline non implémenté — prochaine étape de la Phase 0.');
  console.log('[ingest] Cible : https://en.onepiece-cardgame.com/cardlist');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { getPrisma } from '@op/db';
import { fetchCardlistPage, sleep, THROTTLE_MS } from './fetch.js';
import { normalizeBlocks, type NormalizeIssue } from './normalize.js';
import { parseCardList, parseSeriesOptions, type RawCardBlock } from './parser.js';
import { assertNoAbnormalDrop, upsertAll } from './upsert.js';

// ---------------------------------------------------------------------------
// Pipeline d'ingestion : découvre les séries -> télécharge chaque page (poliment)
// -> parse -> normalise -> upsert idempotent -> rapport de diff.
//
// Usage :
//   pnpm --filter @op/ingest ingest                 # toutes les séries
//   pnpm --filter @op/ingest ingest -- --series=569116,569001
//   pnpm --filter @op/ingest ingest -- --dry-run    # sans écrire en base
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { series: string[] | null; dryRun: boolean } {
  const seriesArg = argv.find((a) => a.startsWith('--series='));
  return {
    series: seriesArg ? seriesArg.slice('--series='.length).split(',') : null,
    dryRun: argv.includes('--dry-run'),
  };
}

async function main(): Promise<void> {
  const { series: seriesFilter, dryRun } = parseArgs(process.argv.slice(2));

  console.log('[ingest] Découverte des séries…');
  const firstPage = await fetchCardlistPage();
  const allSeries = parseSeriesOptions(firstPage);
  if (allSeries.length === 0) {
    throw new Error('Aucune série découverte : le markup du <select> a probablement changé.');
  }
  const series = seriesFilter ? allSeries.filter((s) => seriesFilter.includes(s.code)) : allSeries;
  console.log(`[ingest] ${allSeries.length} séries trouvées, ${series.length} à ingérer.`);

  const blocksByVariantId = new Map<string, RawCardBlock>();
  for (const [index, s] of series.entries()) {
    await sleep(THROTTLE_MS);
    const html = await fetchCardlistPage(s.code);
    const blocks = parseCardList(html);
    for (const block of blocks) {
      // Une carte rééditée apparaît dans plusieurs séries : première vue gagne.
      if (!blocksByVariantId.has(block.variantId)) {
        blocksByVariantId.set(block.variantId, block);
      }
    }
    console.log(
      `[ingest] (${index + 1}/${series.length}) ${s.title} : ${blocks.length} blocs, cumul ${blocksByVariantId.size} variantes.`,
    );
  }

  const { cards, variants, issues } = normalizeBlocks([...blocksByVariantId.values()]);
  console.log(`[ingest] Normalisé : ${cards.length} cartes, ${variants.length} variantes.`);
  reportIssues(issues);

  if (dryRun) {
    console.log('[ingest] --dry-run : rien n’est écrit en base.');
    return;
  }

  const prisma = getPrisma();
  if (!seriesFilter) {
    // Garde-fou réservé au run complet : un run filtré par --series parse
    // volontairement moins de cartes que la base n'en contient.
    const existingCount = await prisma.card.count();
    assertNoAbnormalDrop(cards.length, existingCount);
  }

  const report = await upsertAll(prisma, cards, variants);
  console.log('[ingest] ─── Rapport de diff ───');
  console.log(
    `  Cartes    : +${report.cardsAdded} ajoutées, ${report.cardsUpdated} errata, ${report.cardsUnchanged} inchangées`,
  );
  console.log(
    `  Variantes : +${report.variantsAdded} ajoutées, ${report.variantsUpdated} mises à jour, ${report.variantsUnchanged} inchangées`,
  );
  console.log(
    `  needsReview : ${report.needsReview.length ? report.needsReview.join(', ') : 'aucune'}`,
  );
  await prisma.$disconnect();
}

function reportIssues(issues: NormalizeIssue[]): void {
  if (issues.length === 0) return;
  console.log(`[ingest] ${issues.length} anomalie(s) de parsing :`);
  for (const issue of issues.slice(0, 20)) {
    console.log(`  - ${issue.variantId} : ${issue.reason}`);
  }
  if (issues.length > 20) console.log(`  … et ${issues.length - 20} autres.`);
}

main().catch((err) => {
  console.error('[ingest] ÉCHEC :', err instanceof Error ? err.message : err);
  process.exit(1);
});

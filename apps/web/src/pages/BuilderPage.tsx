import { cardIdFromVariantId, type CardWithVariants, type DeckFile } from '@op/shared';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { fetchCatalog, shareDeck } from '../api';
import { CardGrid } from '../components/CardGrid';
import { CardModal } from '../components/CardModal';
import { DeckPanel } from '../components/DeckPanel';
import { FilterBar } from '../components/FilterBar';
import { ImportExportModal } from '../components/ImportExportModal';
import {
  deckReducer,
  EMPTY_DECK,
  fromDeckFile,
  loadLocalDeck,
  saveLocalDeck,
  toDeckEntries,
  toDeckFile,
} from '../lib/deck';
import { applyFilters, catalogFacets, EMPTY_FILTERS, type Filters } from '../lib/filters';

export function BuilderPage() {
  const [catalog, setCatalog] = useState<CardWithVariants[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [deck, dispatch] = useReducer(deckReducer, EMPTY_DECK, () => loadLocalDeck() ?? EMPTY_DECK);
  const [inspected, setInspected] = useState<CardWithVariants | null>(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [shareState, setShareState] = useState<{ url?: string; error?: string; busy?: boolean }>(
    {},
  );
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog().then(setCatalog, (err: Error) => setLoadError(err.message));
  }, []);

  useEffect(() => saveLocalDeck(deck), [deck]);

  const byCardId = useMemo(() => new Map((catalog ?? []).map((c) => [c.id, c])), [catalog]);
  const facets = useMemo(() => catalogFacets(catalog ?? []), [catalog]);
  const filtered = useMemo(() => applyFilters(catalog ?? [], filters), [catalog, filters]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="rounded-xl border border-red-900 bg-red-950/40 p-6 text-sm text-red-300">
          {loadError} — l'API tourne-t-elle ? (<code>pnpm --filter @op/api dev</code>)
        </p>
      </div>
    );
  }
  if (!catalog) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Chargement du catalogue…
      </div>
    );
  }

  const inspectedEntry = inspected ? deck.entries[inspected.id] : undefined;
  const inspectedIsLeader =
    inspected && deck.leaderVariantId
      ? cardIdFromVariantId(deck.leaderVariantId) === inspected.id
      : false;

  function addCard(card: CardWithVariants) {
    if (card.category === 'LEADER') {
      dispatch({ type: 'setLeader', variantId: card.variants[0]?.id ?? card.id });
      return;
    }
    if (card.category === 'DON') return;
    dispatch({ type: 'add', cardId: card.id, defaultVariantId: card.variants[0]?.id ?? card.id });
  }

  function importFile(file: DeckFile, source: string) {
    const { state, warnings } = fromDeckFile(file, byCardId);
    dispatch({ type: 'load', state });
    setNotice(
      warnings.length > 0
        ? `Import ${source} : ${warnings.length} avertissement(s) — ${warnings[0]}`
        : `Deck importé depuis ${source}.`,
    );
  }

  async function onShare() {
    if (!deck.leaderVariantId) return;
    setShareState({ busy: true });
    try {
      const id = await shareDeck({
        name: deck.name,
        leaderVariantId: deck.leaderVariantId,
        cards: toDeckEntries(deck),
      });
      const url = `${location.origin}/deck/${id}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      setShareState({ url });
    } catch (err) {
      setShareState({ error: err instanceof Error ? err.message : 'Partage impossible.' });
    }
  }

  return (
    <div className="flex h-full min-h-0 gap-4">
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <FilterBar
          filters={filters}
          onChange={setFilters}
          facets={facets}
          resultCount={filtered.length}
        />
        {notice && (
          <p
            className="cursor-pointer rounded-lg bg-slate-800/80 px-3 py-2 text-xs text-slate-300"
            onClick={() => setNotice(null)}
          >
            {notice} <span className="text-slate-500">(cliquer pour fermer)</span>
          </p>
        )}
        <div className="min-h-0 flex-1">
          <CardGrid
            cards={filtered}
            onInspect={setInspected}
            onAdd={addCard}
            quantityOf={(id) => deck.entries[id]?.quantity ?? 0}
          />
        </div>
      </section>

      <div className="hidden w-80 shrink-0 lg:block xl:w-96">
        <DeckPanel
          state={deck}
          byCardId={byCardId}
          onName={(name) => dispatch({ type: 'setName', name })}
          onAdd={(cardId) => {
            const card = byCardId.get(cardId);
            if (card) addCard(card);
          }}
          onRemove={(cardId) => dispatch({ type: 'remove', cardId })}
          onInspect={setInspected}
          onClearLeader={() => dispatch({ type: 'setLeader', variantId: null })}
          onReset={() => dispatch({ type: 'reset' })}
          actions={
            <>
              <button
                onClick={() => setShowImportExport(true)}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                Import / Export
              </button>
              <button
                onClick={onShare}
                disabled={!deck.leaderVariantId || shareState.busy}
                className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
              >
                {shareState.busy ? 'Partage…' : 'Partager'}
              </button>
              {shareState.url && (
                <a
                  href={shareState.url}
                  className="self-center text-xs text-sky-400 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Lien copié ↗
                </a>
              )}
              {shareState.error && (
                <span className="self-center text-xs text-red-400">{shareState.error}</span>
              )}
            </>
          }
        />
      </div>

      {inspected && (
        <CardModal
          card={inspected}
          selectedVariantId={
            inspectedIsLeader && deck.leaderVariantId
              ? deck.leaderVariantId
              : (inspectedEntry?.variantId ?? inspected.variants[0]?.id ?? inspected.id)
          }
          onSelectVariant={(variantId) => {
            if (inspected.category === 'LEADER') {
              dispatch({ type: 'setLeader', variantId });
            } else if (inspectedEntry) {
              dispatch({ type: 'setVariant', cardId: inspected.id, variantId });
            } else {
              dispatch({ type: 'add', cardId: inspected.id, defaultVariantId: variantId });
            }
          }}
          onAdd={() => addCard(inspected)}
          onRemove={() => dispatch({ type: 'remove', cardId: inspected.id })}
          onSetLeader={() =>
            dispatch({ type: 'setLeader', variantId: inspected.variants[0]?.id ?? inspected.id })
          }
          quantity={inspectedEntry?.quantity ?? 0}
          onClose={() => setInspected(null)}
        />
      )}

      {showImportExport && (
        <ImportExportModal
          deckFile={toDeckFile(deck)}
          byCardId={byCardId}
          onImport={importFile}
          onClose={() => setShowImportExport(false)}
        />
      )}
    </div>
  );
}

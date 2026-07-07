import { cardIdFromVariantId, DECK_SIZE, validateDeck, type CardWithVariants } from '@op/shared';
import { toDeckEntries, totalCards, type BuilderState } from '../lib/deck';
import { CardImage } from './CardImage';
import { DeckStats } from './DeckStats';

// Panneau du deck en construction : leader, liste, compteur 0/50,
// VALIDATION EN DIRECT (mêmes règles que le serveur), stats.

export function DeckPanel({
  state,
  byCardId,
  onName,
  onAdd,
  onRemove,
  onInspect,
  onClearLeader,
  onReset,
  actions,
}: {
  state: BuilderState;
  byCardId: Map<string, CardWithVariants>;
  onName: (name: string) => void;
  onAdd: (cardId: string) => void;
  onRemove: (cardId: string) => void;
  onInspect: (card: CardWithVariants) => void;
  onClearLeader: () => void;
  onReset: () => void;
  actions: React.ReactNode;
}) {
  const total = totalCards(state);
  const leader = state.leaderVariantId
    ? byCardId.get(cardIdFromVariantId(state.leaderVariantId))
    : undefined;

  const validation = validateDeck(
    { leaderVariantId: state.leaderVariantId ?? '', cards: toDeckEntries(state) },
    (id) => byCardId.get(id),
  );

  const entries = toDeckEntries(state)
    .map((e) => ({ entry: e, card: byCardId.get(e.cardId) }))
    .filter((x): x is { entry: (typeof x)['entry']; card: CardWithVariants } => Boolean(x.card))
    .sort((a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0) || a.card.id.localeCompare(b.card.id));

  return (
    <aside className="flex h-full w-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={state.name}
          onChange={(e) => onName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-semibold outline-none focus:border-sky-600"
        />
        <span
          className={`rounded-lg px-2.5 py-1.5 text-sm font-bold ${
            total === DECK_SIZE ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'
          }`}
        >
          {total}/{DECK_SIZE}
        </span>
      </div>

      {leader && state.leaderVariantId ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-2">
          <CardImage
            variantId={state.leaderVariantId}
            alt={leader.name}
            className="w-14 shrink-0 aspect-[480/671]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-500">Leader</p>
            <button
              onClick={() => onInspect(leader)}
              className="truncate text-sm font-semibold text-white hover:underline"
            >
              {leader.name}
            </button>
            <p className="text-xs text-slate-500">
              {leader.id} · {leader.colors.join('/')} · Life {leader.life}
            </p>
          </div>
          <button
            onClick={onClearLeader}
            title="Retirer le leader"
            className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400 hover:bg-slate-700"
          >
            ✕
          </button>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-700 p-3 text-center text-sm text-slate-500">
          Choisis un leader (filtre LEADER, puis « Choisir comme leader »).
        </p>
      )}

      {validation.errors.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-xs text-red-300">
          {validation.errors.slice(0, 6).map((err, i) => (
            <li key={i}>• {err.message}</li>
          ))}
          {validation.errors.length > 6 && <li>… et {validation.errors.length - 6} autres.</li>}
        </ul>
      ) : (
        <p className="rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-2.5 text-center text-xs font-semibold text-emerald-300">
          ✓ Deck légal
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/60">
        {entries.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-500">Ajoute des cartes du catalogue.</p>
        ) : (
          <ul className="divide-y divide-slate-800/60">
            {entries.map(({ entry, card }) => (
              <li key={entry.cardId} className="flex items-center gap-2 px-2 py-1.5">
                <span className="w-6 text-center text-xs text-slate-500">{card.cost ?? '—'}</span>
                <button
                  onClick={() => onInspect(card)}
                  className="min-w-0 flex-1 truncate text-left text-sm text-slate-200 hover:underline"
                >
                  {card.name}
                  {entry.variantId !== entry.cardId && (
                    <span className="ml-1 rounded bg-violet-900/60 px-1 text-[10px] text-violet-300">
                      {entry.variantId.split('_')[1]}
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onRemove(entry.cardId)}
                    className="h-6 w-6 rounded bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-semibold text-white">
                    {entry.quantity}
                  </span>
                  <button
                    onClick={() => onAdd(entry.cardId)}
                    className="h-6 w-6 rounded bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DeckStats state={state} byCardId={byCardId} />

      <div className="flex flex-wrap gap-2">
        {actions}
        <button
          onClick={onReset}
          className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-red-900/60 hover:text-red-200"
        >
          Vider
        </button>
      </div>
    </aside>
  );
}

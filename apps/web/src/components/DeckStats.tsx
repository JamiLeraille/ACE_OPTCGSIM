import type { CardWithVariants } from '@op/shared';
import type { BuilderState } from '../lib/deck';

// Statistiques du deck : courbe de coût, répartition par couleur/catégorie, counters.

const COLOR_CLASSES: Record<string, string> = {
  Red: 'bg-red-500',
  Green: 'bg-green-500',
  Blue: 'bg-blue-500',
  Purple: 'bg-purple-500',
  Black: 'bg-zinc-500',
  Yellow: 'bg-yellow-400',
};

export function DeckStats({
  state,
  byCardId,
}: {
  state: BuilderState;
  byCardId: Map<string, CardWithVariants>;
}) {
  const costCurve = new Map<number, number>();
  const colorCount = new Map<string, number>();
  const categoryCount = new Map<string, number>();
  let counterCards = 0;
  let counterTotal = 0;

  for (const [cardId, entry] of Object.entries(state.entries)) {
    const card = byCardId.get(cardId);
    if (!card) continue;
    const cost = Math.min(card.cost ?? 0, 8);
    costCurve.set(cost, (costCurve.get(cost) ?? 0) + entry.quantity);
    for (const color of card.colors) {
      colorCount.set(color, (colorCount.get(color) ?? 0) + entry.quantity);
    }
    categoryCount.set(card.category, (categoryCount.get(card.category) ?? 0) + entry.quantity);
    if (card.counter) {
      counterCards += entry.quantity;
      counterTotal += card.counter * entry.quantity;
    }
  }

  const maxBar = Math.max(1, ...costCurve.values());

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
      <div>
        <p className="mb-1.5 font-semibold uppercase tracking-wide text-slate-500">
          Courbe de coût
        </p>
        <div className="flex h-16 items-end gap-1">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((cost) => {
            const count = costCurve.get(cost) ?? 0;
            return (
              <div key={cost} className="flex flex-1 flex-col items-center gap-0.5">
                <span className="text-[10px] text-slate-400">{count || ''}</span>
                <div
                  className="w-full rounded-sm bg-sky-600"
                  style={{ height: `${(count / maxBar) * 100}%` }}
                />
                <span className="text-[10px] text-slate-500">{cost === 8 ? '8+' : cost}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {[...colorCount.entries()].map(([color, count]) => (
          <span key={color} className="flex items-center gap-1 text-slate-300">
            <i className={`h-2.5 w-2.5 rounded-full ${COLOR_CLASSES[color] ?? 'bg-slate-500'}`} />
            {count}
          </span>
        ))}
        <span className="ml-auto text-slate-400">
          {[...categoryCount.entries()].map(([cat, n]) => `${n} ${cat.toLowerCase()}`).join(' · ')}
        </span>
      </div>

      <p className="text-slate-400">
        Counters : <span className="text-slate-200">{counterCards} cartes</span> ·{' '}
        <span className="text-slate-200">{counterTotal.toLocaleString('fr-FR')}</span> au total
      </p>
    </div>
  );
}

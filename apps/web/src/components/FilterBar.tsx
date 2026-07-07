import type { Category, Color } from '@op/shared';
import { EMPTY_FILTERS, type Filters } from '../lib/filters';

const COLORS: { value: Color; className: string }[] = [
  { value: 'Red', className: 'bg-red-500' },
  { value: 'Green', className: 'bg-green-500' },
  { value: 'Blue', className: 'bg-blue-500' },
  { value: 'Purple', className: 'bg-purple-500' },
  { value: 'Black', className: 'bg-zinc-600' },
  { value: 'Yellow', className: 'bg-yellow-400' },
];
const CATEGORIES: Category[] = ['LEADER', 'CHARACTER', 'EVENT', 'STAGE'];
const COSTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FilterBar({
  filters,
  onChange,
  facets,
  resultCount,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  facets: { sets: string[]; rarities: string[]; traits: string[] };
  resultCount: number;
}) {
  const isDefault = JSON.stringify(filters) === JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={filters.text}
          onChange={(e) => onChange({ ...filters, text: e.target.value })}
          placeholder="Nom ou numéro (Zoro, OP01-025…)"
          className="w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none placeholder:text-slate-600 focus:border-sky-600"
        />
        <input
          value={filters.keyword}
          onChange={(e) => onChange({ ...filters, keyword: e.target.value })}
          placeholder="Mot-clé d'effet ([Blocker], [Rush]…)"
          className="w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none placeholder:text-slate-600 focus:border-sky-600"
        />
        <input
          value={filters.trait}
          onChange={(e) => onChange({ ...filters, trait: e.target.value })}
          placeholder="Type / trait (Straw Hat Crew…)"
          list="traits"
          className="w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none placeholder:text-slate-600 focus:border-sky-600"
        />
        <datalist id="traits">
          {facets.traits.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <select
          value={filters.sets[0] ?? ''}
          onChange={(e) => onChange({ ...filters, sets: e.target.value ? [e.target.value] : [] })}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-sky-600"
        >
          <option value="">Tous les sets</option>
          {facets.sets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filters.rarities[0] ?? ''}
          onChange={(e) =>
            onChange({ ...filters, rarities: e.target.value ? [e.target.value] : [] })
          }
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-sky-600"
        >
          <option value="">Toutes raretés</option>
          {facets.rarities.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c.value}
              title={c.value}
              onClick={() => onChange({ ...filters, colors: toggle(filters.colors, c.value) })}
              className={`h-6 w-6 rounded-full ${c.className} transition-transform ${
                filters.colors.includes(c.value)
                  ? 'scale-110 ring-2 ring-white'
                  : 'opacity-40 hover:opacity-80'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => onChange({ ...filters, categories: toggle(filters.categories, cat) })}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                filters.categories.includes(cat)
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-slate-500">Coût</span>
          {COSTS.map((cost) => (
            <button
              key={cost}
              onClick={() => onChange({ ...filters, costs: toggle(filters.costs, cost) })}
              className={`h-6 w-6 rounded-md text-xs font-medium transition-colors ${
                filters.costs.includes(cost)
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {cost === 10 ? '10+' : cost}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>{resultCount} carte(s)</span>
          {!isDefault && (
            <button
              onClick={() => onChange(EMPTY_FILTERS)}
              className="rounded-md bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

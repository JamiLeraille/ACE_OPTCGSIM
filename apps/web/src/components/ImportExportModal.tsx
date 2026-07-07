import {
  DeckFileSchema,
  fromSimText,
  toSimText,
  type CardWithVariants,
  type DeckFile,
} from '@op/shared';
import { useState } from 'react';

// Import/export : texte OPTCG Sim (compatibilité maximale, art perdu) et
// JSON `optcg-deck` v1 (notre format riche, art conservé).

export function ImportExportModal({
  deckFile,
  byCardId,
  onImport,
  onClose,
}: {
  deckFile: DeckFile;
  byCardId: Map<string, CardWithVariants>;
  onImport: (file: DeckFile, source: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'sim' | 'json'>('sim');
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<string[]>([]);

  const exported = tab === 'sim' ? toSimText(deckFile) : JSON.stringify(deckFile, null, 2);

  function runImport() {
    setFeedback([]);
    if (tab === 'sim') {
      const { deck, issues } = fromSimText(input, (id) => byCardId.get(id)?.category === 'LEADER');
      if (!deck) {
        setFeedback(issues.map((i) => i.reason));
        return;
      }
      onImport(deck, 'texte OPTCG Sim');
      if (issues.length > 0) setFeedback(issues.map((i) => `Ligne ${i.line} : ${i.reason}`));
      else onClose();
    } else {
      try {
        const parsed = DeckFileSchema.safeParse(JSON.parse(input));
        if (!parsed.success) {
          setFeedback(
            parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
          );
          return;
        }
        onImport(parsed.data, 'JSON optcg-deck');
        onClose();
      } catch {
        setFeedback(['JSON illisible.']);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-1 rounded-lg bg-slate-950 p-1">
            {(['sim', 'json'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === t ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'sim' ? 'Texte OPTCG Sim' : 'JSON optcg-deck'}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="rounded-md bg-slate-800 px-2.5 py-1 text-sm text-slate-300 hover:bg-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Export {tab === 'sim' && '(l’art n’est pas transportable en texte Sim)'}
            </p>
            <textarea
              readOnly
              value={exported}
              rows={12}
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-300"
            />
            <button
              onClick={() => navigator.clipboard.writeText(exported)}
              className="mt-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              Copier
            </button>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Import
            </p>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                tab === 'sim' ? '1xOP01-001\n4xOP01-016\n…' : '{ "format": "optcg-deck", … }'
              }
              rows={12}
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-600"
            />
            <button
              onClick={runImport}
              disabled={input.trim() === ''}
              className="mt-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
            >
              Importer (remplace le deck)
            </button>
          </div>
        </div>

        {feedback.length > 0 && (
          <ul className="mt-3 space-y-0.5 rounded-lg bg-amber-950/40 p-2.5 text-xs text-amber-300">
            {feedback.map((f, i) => (
              <li key={i}>• {f}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

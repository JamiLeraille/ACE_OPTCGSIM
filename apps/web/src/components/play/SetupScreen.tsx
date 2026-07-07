import type { CardWithVariants, GameConfig } from '@op/shared';
import { useState } from 'react';
import { toSimText } from '@op/shared';
import { loadLocalDeck, toDeckFile } from '../../lib/deck';
import { setupFromSimText } from '../../lib/game';

// Écran de préparation hotseat : chaque joueur colle sa liste (texte OPTCG Sim)
// ou récupère le deck en cours du builder. Seed optionnelle (reproductibilité).

function PlayerForm({
  label,
  name,
  onName,
  text,
  onText,
  problems,
}: {
  label: string;
  name: string;
  onName: (v: string) => void;
  text: string;
  onText: (v: string) => void;
  problems: string[];
}) {
  return (
    <div className="flex-1 space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-sky-500">{label}</span>
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Nom"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-sky-600"
        />
        <button
          onClick={() => {
            const local = loadLocalDeck();
            if (local) onText(toSimText(toDeckFile(local)));
          }}
          className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
        >
          Deck du builder
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder={'Liste au format OPTCG Sim :\n1xOP01-001\n4xOP01-016\n…'}
        rows={9}
        className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-600"
      />
      {problems.length > 0 && (
        <ul className="space-y-0.5 rounded-lg bg-red-950/40 p-2 text-xs text-red-300">
          {problems.slice(0, 4).map((p, i) => (
            <li key={i}>• {p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SetupScreen({
  byCardId,
  onStart,
}: {
  byCardId: Map<string, CardWithVariants>;
  onStart: (config: GameConfig) => void;
}) {
  const [name1, setName1] = useState('Joueur 1');
  const [name2, setName2] = useState('Joueur 2');
  const [text1, setText1] = useState('');
  const [text2, setText2] = useState('');
  const [seed, setSeed] = useState('');
  const [problems, setProblems] = useState<{ p1: string[]; p2: string[] }>({ p1: [], p2: [] });

  function start() {
    const r1 = setupFromSimText(name1, text1, byCardId);
    const r2 = setupFromSimText(name2, text2, byCardId);
    setProblems({ p1: [...r1.errors, ...r1.warnings], p2: [...r2.errors, ...r2.warnings] });
    if (!r1.setup || !r2.setup) return;
    const seedValue = seed.trim() === '' ? Math.floor(Date.now() % 2 ** 31) : Number(seed);
    onStart({ seed: seedValue, p1: r1.setup, p2: r2.setup });
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col justify-center gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Partie locale (hotseat)</h1>
        <p className="text-sm text-slate-400">
          Relais manuel : le moteur gère les phases, les compteurs et la victoire ; les effets de
          cartes se jouent à la main, comme sur un tapis.
        </p>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        <PlayerForm
          label="J1"
          name={name1}
          onName={setName1}
          text={text1}
          onText={setText1}
          problems={problems.p1}
        />
        <PlayerForm
          label="J2"
          name={name2}
          onName={setName2}
          text={text2}
          onText={setText2}
          problems={problems.p2}
        />
      </div>
      <div className="flex items-center gap-3">
        <input
          value={seed}
          onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
          placeholder="Seed (optionnelle)"
          className="w-40 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-sky-600"
        />
        <button
          onClick={start}
          className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500"
        >
          Lancer la partie
        </button>
      </div>
    </div>
  );
}

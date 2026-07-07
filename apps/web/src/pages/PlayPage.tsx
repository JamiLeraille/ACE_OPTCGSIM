import {
  applyAction,
  createGame,
  EngineError,
  type CardWithVariants,
  type GameAction,
  type GameConfig,
  type GameState,
  type PlayerId,
} from '@op/shared';
import { useEffect, useMemo, useState } from 'react';
import { fetchCatalog } from '../api';
import { GameTable } from '../components/play/GameTable';
import { PlayCard } from '../components/play/PlayCard';
import { SetupScreen } from '../components/play/SetupScreen';

// Hotseat (Phase 2) : moteur local, les deux joueurs partagent l'appareil.
// Le plateau lui-même est le composant GameTable, partagé avec /online.

export function PlayPage() {
  const [catalog, setCatalog] = useState<CardWithVariants[] | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState(false);

  useEffect(() => {
    fetchCatalog().then(setCatalog, (e: Error) => setError(e.message));
  }, []);

  const byCardId = useMemo(() => new Map((catalog ?? []).map((c) => [c.id, c])), [catalog]);

  if (error && !game) return <p className="p-8 text-center text-sm text-red-300">{error}</p>;
  if (!catalog)
    return <p className="p-8 text-center text-sm text-stone-500">Chargement du catalogue…</p>;
  if (!game) {
    return (
      <SetupScreen byCardId={byCardId} onStart={(cfg: GameConfig) => setGame(createGame(cfg))} />
    );
  }

  const dispatch = (action: GameAction): boolean => {
    try {
      const next = applyAction(game, action);
      setGame(next);
      setError(null);
      if (action.type === 'endTurn' && next.status === 'PLAYING') setHandoff(true);
      return true;
    } catch (err) {
      setError(err instanceof EngineError ? err.message : String(err));
      return false;
    }
  };

  // --- Mulligan (séquentiel, mains privées) ---
  if (game.status === 'MULLIGAN') {
    const pid: PlayerId = game.players.p1.mulliganDecided ? 'p2' : 'p1';
    const board = game.players[pid];
    return (
      <div className="wood-deck mx-auto flex h-full flex-col items-center justify-center gap-4 rounded-2xl">
        <h2 className="text-xl font-semibold text-amber-100">{board.name} — garde ou mulligan ?</h2>
        <p className="text-xs text-stone-400">(L'autre joueur détourne le regard 👀)</p>
        <div className="flex gap-2">
          {board.hand.map((c) => (
            <PlayCard key={c.uid} card={c} width="w-24" />
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => dispatch({ type: 'mulligan', player: pid, mulligan: false })}
            className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Garder
          </button>
          <button
            onClick={() => dispatch({ type: 'mulligan', player: pid, mulligan: true })}
            className="rounded-lg bg-stone-800 px-5 py-2 text-sm font-semibold text-stone-200 hover:bg-stone-700"
          >
            Mulligan (5 nouvelles)
          </button>
        </div>
      </div>
    );
  }

  // --- Victoire ---
  if (game.status === 'FINISHED' && game.winner) {
    const winner = game.players[game.winner];
    return (
      <div className="wood-deck flex h-full flex-col items-center justify-center gap-4 rounded-2xl">
        <h1 className="text-4xl font-bold text-amber-300">🏴‍☠️ {winner.name} gagne !</h1>
        <p className="text-stone-200">{game.winReason}</p>
        <p className="text-xs text-stone-400">
          Tour {game.turn} · {game.log.length} actions au journal
        </p>
        <button
          onClick={() => setGame(null)}
          className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-500"
        >
          Nouvelle partie
        </button>
      </div>
    );
  }

  // --- Passage d'appareil ---
  if (handoff) {
    const board = game.players[game.activePlayer];
    return (
      <div className="wood-deck flex h-full flex-col items-center justify-center gap-4 rounded-2xl">
        <h2 className="text-2xl font-semibold text-amber-100">Passe l'appareil à {board.name}</h2>
        <button
          onClick={() => setHandoff(false)}
          className="rounded-lg bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-500"
        >
          C'est moi, {board.name} — voir ma main
        </button>
      </div>
    );
  }

  return (
    <GameTable
      view={game}
      me={game.activePlayer}
      byCardId={byCardId}
      onAction={dispatch}
      notice={error}
    />
  );
}

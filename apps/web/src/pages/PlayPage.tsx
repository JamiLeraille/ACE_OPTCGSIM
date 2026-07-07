import {
  applyAction,
  createGame,
  displayedPower,
  EngineError,
  type CardInstance,
  type CardWithVariants,
  type GameAction,
  type GameConfig,
  type GameState,
  type PlayerId,
} from '@op/shared';
import { useEffect, useMemo, useState } from 'react';
import { fetchCatalog } from '../api';
import { CardBack, PlayCard } from '../components/play/PlayCard';
import { SetupScreen } from '../components/play/SetupScreen';

// Plateau hotseat (Phase 2) : le moteur @op/engine tient l'état, l'UI n'envoie
// que des intentions. Les effets de cartes se jouent manuellement.

type Selection = { kind: 'hand'; uid: number } | { kind: 'board'; uid: number } | null;

interface Battle {
  attackerUid: number;
  attackerPlayer: PlayerId;
  targetUid: number | null; // uid du leader/personnage adverse
  attackBonus: number; // ajustements manuels (effets, counters…)
  defenseBonus: number;
}

export function PlayPage() {
  const [catalog, setCatalog] = useState<CardWithVariants[] | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [showTrash, setShowTrash] = useState<PlayerId | null>(null);

  useEffect(() => {
    fetchCatalog().then(setCatalog, (e: Error) => setError(e.message));
  }, []);

  const byCardId = useMemo(() => new Map((catalog ?? []).map((c) => [c.id, c])), [catalog]);

  if (error) {
    return <p className="p-8 text-center text-sm text-red-300">{error}</p>;
  }
  if (!catalog) {
    return <p className="p-8 text-center text-sm text-slate-500">Chargement du catalogue…</p>;
  }

  if (!game) {
    return (
      <SetupScreen byCardId={byCardId} onStart={(cfg: GameConfig) => setGame(createGame(cfg))} />
    );
  }

  const dispatch = (action: GameAction) => {
    try {
      const next = applyAction(game, action);
      setGame(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err instanceof EngineError ? err.message : String(err));
      return null;
    }
  };

  const me = game.activePlayer;
  const foe: PlayerId = me === 'p1' ? 'p2' : 'p1';
  const myBoard = game.players[me];
  const foeBoard = game.players[foe];
  const basePower = (card: CardInstance) => byCardId.get(card.cardId)?.power ?? null;
  const powerLabel = (card: CardInstance) => {
    const p = displayedPower(basePower(card), card);
    return p === null ? null : String(p);
  };

  // --- Mulligan (séquentiel, mains privées) ---
  if (game.status === 'MULLIGAN') {
    const pid: PlayerId = game.players.p1.mulliganDecided ? 'p2' : 'p1';
    const board = game.players[pid];
    return (
      <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold text-white">{board.name} — garde ou mulligan ?</h2>
        <p className="text-xs text-slate-500">(L'autre joueur détourne le regard 👀)</p>
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
            className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700"
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
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h1 className="text-4xl font-bold text-amber-300">🏆 {winner.name} gagne !</h1>
        <p className="text-slate-300">{game.winReason}</p>
        <p className="text-xs text-slate-500">
          Tour {game.turn} · {game.log.length} actions au journal
        </p>
        <button
          onClick={() => setGame(null)}
          className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500"
        >
          Nouvelle partie
        </button>
      </div>
    );
  }

  // --- Écran de passage d'appareil ---
  if (handoff) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <h2 className="text-2xl font-semibold text-white">Passe l'appareil à {myBoard.name}</h2>
        <button
          onClick={() => setHandoff(false)}
          className="rounded-lg bg-sky-600 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-500"
        >
          C'est moi, {myBoard.name} — voir ma main
        </button>
      </div>
    );
  }

  function endTurn() {
    setSelection(null);
    setBattle(null);
    if (dispatch({ type: 'endTurn' })) setHandoff(true);
  }

  function declareAttack(uid: number) {
    const attacker = [myBoard.leader, ...myBoard.characters].find((c) => c.uid === uid);
    if (!attacker) return;
    if (!attacker.rested) dispatch({ type: 'toggleRest', player: me, uid });
    setBattle({
      attackerUid: uid,
      attackerPlayer: me,
      targetUid: null,
      attackBonus: 0,
      defenseBonus: 0,
    });
    setSelection(null);
  }

  const attacker = battle
    ? [myBoard.leader, ...myBoard.characters].find((c) => c.uid === battle.attackerUid)
    : null;
  const target = battle?.targetUid
    ? [foeBoard.leader, ...foeBoard.characters].find((c) => c.uid === battle.targetUid)
    : null;

  const selectedHandCard =
    selection?.kind === 'hand' ? myBoard.hand.find((c) => c.uid === selection.uid) : null;
  const selectedBoardCard =
    selection?.kind === 'board'
      ? [myBoard.leader, myBoard.stage, ...myBoard.characters].find((c) => c?.uid === selection.uid)
      : null;

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* Bandeau de tour */}
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2">
          <p className="text-sm">
            <span className="font-bold text-sky-400">Tour {game.turn}</span>
            <span className="text-slate-400"> · {myBoard.name} · phase </span>
            <span className="font-semibold text-white">{game.phase}</span>
          </p>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-400">{error}</span>}
            <button
              onClick={() => dispatch({ type: 'concede', player: me })}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:bg-red-900/60 hover:text-red-200"
            >
              Concéder
            </button>
            <button
              onClick={endTurn}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
            >
              Fin de tour →
            </button>
          </div>
        </div>

        {/* Adversaire (miroir, main cachée) */}
        <PlayerHalf
          board={foeBoard}
          isOpponent
          powerLabel={powerLabel}
          onCardClick={(uid) => {
            if (battle && !battle.targetUid) {
              setBattle({ ...battle, targetUid: uid });
            }
          }}
          battleTargetUid={battle?.targetUid ?? null}
          onTrash={() => setShowTrash(foe)}
          onDamage={() => dispatch({ type: 'takeDamage', player: foe })}
          onDraw={() => undefined}
        />

        {/* Moi */}
        <PlayerHalf
          board={myBoard}
          powerLabel={powerLabel}
          onCardClick={(uid) => {
            setSelection({ kind: 'board', uid });
            setBattle(null);
          }}
          selectedUid={selection?.kind === 'board' ? selection.uid : null}
          onTrash={() => setShowTrash(me)}
          onDamage={() => dispatch({ type: 'takeDamage', player: me })}
          onDraw={() => dispatch({ type: 'draw', player: me })}
          donActions={{
            spend: () => dispatch({ type: 'spendDon', player: me, count: 1 }),
            ready: () => dispatch({ type: 'readyDon', player: me, count: 1 }),
          }}
        />

        {/* Ma main */}
        <div className="flex min-h-24 items-start gap-2 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 p-2">
          {myBoard.hand.length === 0 && <p className="p-3 text-xs text-slate-500">Main vide.</p>}
          {myBoard.hand.map((c) => (
            <PlayCard
              key={c.uid}
              card={c}
              width="w-20"
              selected={selection?.kind === 'hand' && selection.uid === c.uid}
              onClick={() => setSelection({ kind: 'hand', uid: c.uid })}
            />
          ))}
        </div>

        {/* Menus d'action contextuels */}
        {selectedHandCard && (
          <ActionBar
            title={selectedHandCard.cardId}
            actions={[
              {
                label: 'Jouer (personnage)',
                run: () =>
                  dispatch({
                    type: 'playFromHand',
                    player: me,
                    uid: selectedHandCard.uid,
                    to: 'characters',
                  }),
              },
              {
                label: 'Jouer (stage)',
                run: () =>
                  dispatch({
                    type: 'playFromHand',
                    player: me,
                    uid: selectedHandCard.uid,
                    to: 'stage',
                  }),
              },
              {
                label: 'Défausser',
                run: () =>
                  dispatch({
                    type: 'playFromHand',
                    player: me,
                    uid: selectedHandCard.uid,
                    to: 'trash',
                  }),
              },
            ]}
            onDone={() => setSelection(null)}
          />
        )}
        {selectedBoardCard && (
          <ActionBar
            title={selectedBoardCard.cardId}
            actions={[
              { label: 'Attaquer ⚔', run: () => declareAttack(selectedBoardCard.uid) },
              {
                label: selectedBoardCard.rested ? 'Redresser' : 'Reposer',
                run: () => dispatch({ type: 'toggleRest', player: me, uid: selectedBoardCard.uid }),
              },
              {
                label: 'Attacher 1 DON!!',
                run: () => dispatch({ type: 'attachDon', player: me, uid: selectedBoardCard.uid }),
              },
              {
                label: 'Détacher 1 DON!!',
                run: () => dispatch({ type: 'detachDon', player: me, uid: selectedBoardCard.uid }),
              },
              ...(myBoard.characters.some((c) => c.uid === selectedBoardCard.uid)
                ? [
                    {
                      label: 'KO',
                      run: () => dispatch({ type: 'ko', player: me, uid: selectedBoardCard.uid }),
                    },
                    {
                      label: 'Retour en main',
                      run: () =>
                        dispatch({ type: 'returnToHand', player: me, uid: selectedBoardCard.uid }),
                    },
                  ]
                : []),
            ]}
            onDone={() => setSelection(null)}
          />
        )}

        {/* Panneau de combat */}
        {battle && attacker && (
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="font-semibold text-amber-300">⚔ Combat</span>
              <Counter
                label={`${attacker.cardId} (attaque)`}
                value={(displayedPower(basePower(attacker), attacker) ?? 0) + battle.attackBonus}
                onAdd={(d) => setBattle({ ...battle, attackBonus: battle.attackBonus + d })}
              />
              {target ? (
                <Counter
                  label={`${target.cardId} (défense)`}
                  value={(displayedPower(basePower(target), target) ?? 0) + battle.defenseBonus}
                  onAdd={(d) => setBattle({ ...battle, defenseBonus: battle.defenseBonus + d })}
                />
              ) : (
                <span className="text-xs text-slate-400">
                  Clique une cible adverse (leader ou personnage reposé)…
                </span>
              )}
              {target && (
                <span className="text-xs font-bold">
                  {(displayedPower(basePower(attacker), attacker) ?? 0) + battle.attackBonus >=
                  (displayedPower(basePower(target), target) ?? 0) + battle.defenseBonus ? (
                    <span className="text-emerald-400">Touche ✓</span>
                  ) : (
                    <span className="text-red-400">Bloqué ✗</span>
                  )}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                {target && target.uid !== foeBoard.leader.uid && (
                  <button
                    onClick={() => {
                      dispatch({ type: 'ko', player: foe, uid: target.uid });
                      setBattle(null);
                    }}
                    className="rounded-lg bg-red-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    KO la cible
                  </button>
                )}
                {target && target.uid === foeBoard.leader.uid && (
                  <button
                    onClick={() => {
                      dispatch({ type: 'takeDamage', player: foe });
                      setBattle(null);
                    }}
                    className="rounded-lg bg-red-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    1 dégât au leader
                  </button>
                )}
                <button
                  onClick={() => setBattle(null)}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
                >
                  Terminer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Journal */}
      <aside className="hidden w-72 shrink-0 flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-3 lg:flex">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Journal</p>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-xs text-slate-400">
          {[...game.log].reverse().map((e) => (
            <li key={e.seq}>
              <span className="text-slate-600">T{e.turn}</span> {e.message}
            </li>
          ))}
        </ul>
      </aside>

      {/* Trash viewer */}
      {showTrash && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowTrash(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-semibold text-white">
              Trash de {game.players[showTrash].name} ({game.players[showTrash].trash.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {game.players[showTrash].trash.map((c) => (
                <div key={c.uid} className="w-20">
                  <PlayCard card={c} width="w-20" />
                  {showTrash === me && (
                    <button
                      onClick={() => dispatch({ type: 'trashToHand', player: me, uid: c.uid })}
                      className="mt-1 w-full rounded bg-slate-800 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
                    >
                      → main
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sous-composants ---

function PlayerHalf({
  board,
  isOpponent,
  powerLabel,
  onCardClick,
  selectedUid,
  battleTargetUid,
  onTrash,
  onDamage,
  onDraw,
  donActions,
}: {
  board: GameState['players']['p1'];
  isOpponent?: boolean;
  powerLabel: (card: CardInstance) => string | null;
  onCardClick: (uid: number) => void;
  selectedUid?: number | null;
  battleTargetUid?: number | null;
  onTrash: () => void;
  onDamage: () => void;
  onDraw: () => void;
  donActions?: { spend: () => void; ready: () => void };
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-2 ${
        isOpponent ? 'border-slate-800 bg-slate-900/40' : 'border-sky-900/60 bg-slate-900/70'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Leader + stage */}
        <PlayCard
          card={board.leader}
          width="w-16"
          powerLabel={powerLabel(board.leader)}
          selected={selectedUid === board.leader.uid || battleTargetUid === board.leader.uid}
          onClick={() => onCardClick(board.leader.uid)}
        />
        {board.stage ? (
          (() => {
            const stage = board.stage;
            return (
              <PlayCard
                card={stage}
                width="w-16"
                selected={selectedUid === stage.uid}
                onClick={() => onCardClick(stage.uid)}
              />
            );
          })()
        ) : (
          <div className="flex aspect-[480/671] w-16 items-center justify-center rounded-md border border-dashed border-slate-700 text-[9px] text-slate-600">
            stage
          </div>
        )}

        {/* Personnages */}
        <div className="flex min-h-24 flex-1 items-center gap-2 overflow-x-auto">
          {board.characters.map((c) => (
            <PlayCard
              key={c.uid}
              card={c}
              width="w-16"
              powerLabel={powerLabel(c)}
              selected={selectedUid === c.uid || battleTargetUid === c.uid}
              onClick={() => onCardClick(c.uid)}
            />
          ))}
          {board.characters.length === 0 && (
            <span className="px-2 text-[10px] text-slate-600">aucun personnage</span>
          )}
        </div>

        {/* Piles */}
        <div className="flex shrink-0 items-center gap-2 text-center text-[10px] text-slate-400">
          <div>
            <CardBack className="h-16 w-12" />
            <button
              onClick={onDraw}
              disabled={isOpponent}
              className="mt-0.5 hover:text-sky-400 disabled:cursor-default"
            >
              Deck {board.deck.length}
              {!isOpponent && ' ↧'}
            </button>
          </div>
          <div>
            <div className="relative">
              <CardBack className="h-16 w-12" />
              <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-rose-400">
                {board.life.length}
              </span>
            </div>
            <button onClick={onDamage} className="mt-0.5 hover:text-rose-400">
              Vie · dégât
            </button>
          </div>
          <div>
            <div className="flex h-16 w-12 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-sm font-bold text-slate-300">
              {board.trash.length}
            </div>
            <button onClick={onTrash} className="mt-0.5 hover:text-sky-400">
              Trash
            </button>
          </div>
        </div>
      </div>

      {/* Zone DON!! + main adverse */}
      <div className="flex items-center gap-4 text-xs">
        <span className="font-semibold text-violet-300">
          DON!! {board.don.active} actifs · {board.don.rested} reposés · deck {board.don.deck}
        </span>
        {donActions && (
          <span className="flex gap-1">
            <button
              onClick={donActions.spend}
              className="rounded bg-violet-900/60 px-2 py-0.5 text-violet-200 hover:bg-violet-800"
            >
              Dépenser 1
            </button>
            <button
              onClick={donActions.ready}
              className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-700"
            >
              Redresser 1
            </button>
          </span>
        )}
        {isOpponent && (
          <span className="ml-auto flex items-center gap-1 text-slate-500">
            Main : {board.hand.length}
            <span className="flex gap-0.5">
              {board.hand.slice(0, 8).map((c) => (
                <CardBack key={c.uid} className="h-6 w-4" />
              ))}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function ActionBar({
  title,
  actions,
  onDone,
}: {
  title: string;
  actions: { label: string; run: () => unknown }[];
  onDone: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-900/60 bg-sky-950/30 p-2">
      <span className="text-xs font-semibold text-sky-300">{title}</span>
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={() => {
            a.run();
            onDone();
          }}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-sky-700"
        >
          {a.label}
        </button>
      ))}
      <button
        onClick={onDone}
        className="ml-auto rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-700"
      >
        ✕
      </button>
    </div>
  );
}

function Counter({
  label,
  value,
  onAdd,
}: {
  label: string;
  value: number;
  onAdd: (delta: number) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <button
        onClick={() => onAdd(-1000)}
        className="h-6 w-6 rounded bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
      >
        −
      </button>
      <span className="w-14 text-center font-bold text-white">{value}</span>
      <button
        onClick={() => onAdd(1000)}
        className="h-6 w-6 rounded bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
      >
        +
      </button>
    </span>
  );
}

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
  type PlayerBoard,
  type PlayerId,
} from '@op/shared';
import { useEffect, useMemo, useState } from 'react';
import { fetchCatalog } from '../api';
import { CardZoomModal, type ZoomAction } from '../components/play/CardZoomModal';
import { CardBack, PlayCard } from '../components/play/PlayCard';
import { SetupScreen } from '../components/play/SetupScreen';

// Table de jeu hotseat (Phase 2), thème "pont de navire pirate".
// Cliquer une carte l'affiche en grand (visibilité selon le joueur actif) ;
// les actions sur la carte agrandie AUTOPAYENT le coût en DON!!.

interface Zoom {
  player: PlayerId;
  uid: number;
  zone: 'hand' | 'board';
}

interface Battle {
  attackerUid: number;
  targetUid: number | null;
  attackBonus: number;
  defenseBonus: number;
}

export function PlayPage() {
  const [catalog, setCatalog] = useState<CardWithVariants[] | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [handoff, setHandoff] = useState(false);
  const [showTrash, setShowTrash] = useState<PlayerId | null>(null);

  useEffect(() => {
    fetchCatalog().then(setCatalog, (e: Error) => setError(e.message));
  }, []);

  const byCardId = useMemo(() => new Map((catalog ?? []).map((c) => [c.id, c])), [catalog]);

  if (error && !game) {
    return <p className="p-8 text-center text-sm text-red-300">{error}</p>;
  }
  if (!catalog) {
    return <p className="p-8 text-center text-sm text-stone-500">Chargement du catalogue…</p>;
  }
  if (!game) {
    return (
      <SetupScreen byCardId={byCardId} onStart={(cfg: GameConfig) => setGame(createGame(cfg))} />
    );
  }

  /** Applique une séquence d'actions en tout-ou-rien (autopay = payer PUIS jouer). */
  const dispatchMany = (actions: GameAction[]) => {
    try {
      let next = game;
      for (const action of actions) next = applyAction(next, action);
      setGame(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err instanceof EngineError ? err.message : String(err));
      return null;
    }
  };
  const dispatch = (action: GameAction) => dispatchMany([action]);

  const me = game.activePlayer;
  const foe: PlayerId = me === 'p1' ? 'p2' : 'p1';
  const myBoard = game.players[me];
  const foeBoard = game.players[foe];

  const basePower = (card: CardInstance) => byCardId.get(card.cardId)?.power ?? null;
  const powerLabel = (card: CardInstance) => {
    const p = displayedPower(basePower(card), card);
    return p === null ? null : String(p);
  };

  // --- Mulligan ---
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
    return (
      <div className="wood-deck flex h-full flex-col items-center justify-center gap-4 rounded-2xl">
        <h2 className="text-2xl font-semibold text-amber-100">Passe l'appareil à {myBoard.name}</h2>
        <button
          onClick={() => setHandoff(false)}
          className="rounded-lg bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-500"
        >
          C'est moi, {myBoard.name} — voir ma main
        </button>
      </div>
    );
  }

  function endTurn() {
    setZoom(null);
    setBattle(null);
    if (dispatch({ type: 'endTurn' })) setHandoff(true);
  }

  function declareAttack(uid: number) {
    const attackerCard = [myBoard.leader, ...myBoard.characters].find((c) => c.uid === uid);
    if (!attackerCard) return;
    if (!attackerCard.rested) dispatch({ type: 'toggleRest', player: me, uid });
    setBattle({ attackerUid: uid, targetUid: null, attackBonus: 0, defenseBonus: 0 });
    setZoom(null);
  }

  const attacker = battle
    ? [myBoard.leader, ...myBoard.characters].find((c) => c.uid === battle.attackerUid)
    : null;
  const target = battle?.targetUid
    ? [foeBoard.leader, ...foeBoard.characters].find((c) => c.uid === battle.targetUid)
    : null;

  // --- Zoom : carte + visibilité + actions (autopay) ---
  function zoomContent(
    z: Zoom,
  ): { card: CardInstance; visible: boolean; actions: ZoomAction[] } | null {
    const board = game!.players[z.player];
    const mine = z.player === me;

    if (z.zone === 'hand') {
      const card = board.hand.find((c) => c.uid === z.uid);
      if (!card) return null;
      if (!mine) return { card, visible: false, actions: [] }; // main adverse : dos
      const info = byCardId.get(card.cardId);
      const cost = info?.cost ?? 0;
      const canPay = board.don.active >= cost;
      const pay: GameAction[] = cost > 0 ? [{ type: 'spendDon', player: me, count: cost }] : [];
      const playTo = (to: 'characters' | 'stage' | 'trash', label: string): ZoomAction => ({
        label: cost > 0 ? `${label} — payer ${cost} DON!!` : label,
        variant: 'primary',
        disabled: !canPay,
        hint: canPay ? undefined : `DON!! actifs insuffisants (${board.don.active}/${cost})`,
        run: () => {
          if (dispatchMany([...pay, { type: 'playFromHand', player: me, uid: card.uid, to }])) {
            setZoom(null);
          }
        },
      });
      const playNoPay = (to: 'characters' | 'stage' | 'trash'): ZoomAction => ({
        label: 'Jouer sans payer (correction)',
        variant: 'ghost',
        run: () => {
          if (dispatch({ type: 'playFromHand', player: me, uid: card.uid, to })) setZoom(null);
        },
      });

      const actions: ZoomAction[] = [];
      const category = info?.category;
      if (category === 'CHARACTER')
        actions.push(playTo('characters', 'Jouer le personnage'), playNoPay('characters'));
      else if (category === 'STAGE')
        actions.push(playTo('stage', 'Jouer le stage'), playNoPay('stage'));
      else if (category === 'EVENT')
        actions.push(playTo('trash', "Jouer l'event (→ trash)"), playNoPay('trash'));
      else {
        actions.push(
          playTo('characters', 'Jouer en personnage'),
          playTo('stage', 'Jouer en stage'),
        );
      }
      actions.push({
        label: 'Défausser',
        variant: 'danger',
        run: () => {
          if (dispatch({ type: 'playFromHand', player: me, uid: card.uid, to: 'trash' }))
            setZoom(null);
        },
      });
      return { card, visible: true, actions };
    }

    // Plateau : visible pour tout le monde
    const card = [board.leader, board.stage, ...board.characters].find((c) => c?.uid === z.uid);
    if (!card) return null;

    if (!mine) {
      const actions: ZoomAction[] = [];
      if (battle && !battle.targetUid && card.uid !== board.stage?.uid) {
        actions.push({
          label: '🎯 Choisir comme cible',
          variant: 'danger',
          run: () => {
            setBattle({ ...battle, targetUid: card.uid });
            setZoom(null);
          },
        });
      }
      return { card, visible: true, actions };
    }

    const isCharacter = board.characters.some((c) => c.uid === card.uid);
    const isStage = board.stage?.uid === card.uid;
    const actions: ZoomAction[] = [];
    if (!isStage)
      actions.push({ label: '⚔ Attaquer', variant: 'primary', run: () => declareAttack(card.uid) });
    actions.push(
      {
        label: card.rested ? 'Redresser' : 'Reposer',
        run: () => {
          if (dispatch({ type: 'toggleRest', player: me, uid: card.uid })) setZoom(null);
        },
      },
      {
        label: 'Attacher 1 DON!!',
        disabled: board.don.active < 1,
        run: () => dispatch({ type: 'attachDon', player: me, uid: card.uid }),
      },
    );
    if (card.attachedDon > 0) {
      actions.push({
        label: 'Détacher 1 DON!!',
        run: () => dispatch({ type: 'detachDon', player: me, uid: card.uid }),
      });
    }
    if (isCharacter || isStage) {
      actions.push(
        {
          label: 'KO / au trash',
          variant: 'danger',
          run: () => {
            const ok = isCharacter
              ? dispatch({ type: 'ko', player: me, uid: card.uid })
              : dispatch({ type: 'returnToHand', player: me, uid: card.uid });
            if (ok) setZoom(null);
          },
        },
        {
          label: 'Retour en main',
          run: () => {
            if (dispatch({ type: 'returnToHand', player: me, uid: card.uid })) setZoom(null);
          },
        },
      );
    }
    return { card, visible: true, actions };
  }

  const zoomData = zoom ? zoomContent(zoom) : null;

  /** Clic sur une carte du plateau adverse : cible de combat prioritaire, sinon zoom. */
  function onFoeBoardCard(uid: number) {
    if (battle && !battle.targetUid && uid !== foeBoard.stage?.uid) {
      setBattle({ ...battle, targetUid: uid });
      return;
    }
    setZoom({ player: foe, uid, zone: 'board' });
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="wood-deck flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl p-3">
        {/* Bandeau de tour */}
        <div className="plank flex items-center justify-between rounded-xl px-4 py-2">
          <p className="text-sm">
            <span className="font-bold text-amber-400">⚓ Tour {game.turn}</span>
            <span className="text-stone-400"> · {myBoard.name} · phase </span>
            <span className="font-semibold text-amber-100">{game.phase}</span>
          </p>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-300">{error}</span>}
            <button
              onClick={() => dispatch({ type: 'concede', player: me })}
              className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs text-stone-400 hover:bg-red-900/60 hover:text-red-200"
            >
              Concéder
            </button>
            <button
              onClick={endTurn}
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-500"
            >
              Fin de tour →
            </button>
          </div>
        </div>

        {/* Panneau de combat */}
        {battle && attacker && (
          <div className="plank rounded-xl border-amber-700/70 p-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="font-semibold text-amber-300">⚔ Combat</span>
              <BattleCounter
                label={`${attacker.cardId} (attaque)`}
                value={(displayedPower(basePower(attacker), attacker) ?? 0) + battle.attackBonus}
                onAdd={(d) => setBattle({ ...battle, attackBonus: battle.attackBonus + d })}
              />
              {target ? (
                <BattleCounter
                  label={`${target.cardId} (défense)`}
                  value={(displayedPower(basePower(target), target) ?? 0) + battle.defenseBonus}
                  onAdd={(d) => setBattle({ ...battle, defenseBonus: battle.defenseBonus + d })}
                />
              ) : (
                <span className="text-xs text-stone-400">Clique une cible adverse…</span>
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
                  className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs text-stone-300 hover:bg-stone-700"
                >
                  Terminer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Moitié adverse ─── */}
        <FieldHalf
          board={foeBoard}
          mirrored
          powerLabel={powerLabel}
          onBoardCard={onFoeBoardCard}
          highlightUid={battle?.targetUid ?? null}
          onTrash={() => setShowTrash(foe)}
          onDamage={() => dispatch({ type: 'takeDamage', player: foe })}
        />

        {/* Cordage central */}
        <div className="rope-divider" />

        {/* ─── Ma moitié ─── */}
        <FieldHalf
          board={myBoard}
          powerLabel={powerLabel}
          onBoardCard={(uid) => setZoom({ player: me, uid, zone: 'board' })}
          onTrash={() => setShowTrash(me)}
          onDamage={() => dispatch({ type: 'takeDamage', player: me })}
          onDraw={() => dispatch({ type: 'draw', player: me })}
          donActions={{
            spend: () => dispatch({ type: 'spendDon', player: me, count: 1 }),
            ready: () => dispatch({ type: 'readyDon', player: me, count: 1 }),
          }}
        />

        {/* Ma main (cale du navire) */}
        <div className="hold rounded-xl p-2">
          <p className="zone-label mb-1 px-1">Main — {myBoard.hand.length} carte(s)</p>
          <div className="flex min-h-24 items-start gap-2 overflow-x-auto">
            {myBoard.hand.length === 0 && <p className="p-3 text-xs text-stone-500">Main vide.</p>}
            {myBoard.hand.map((c) => (
              <PlayCard
                key={c.uid}
                card={c}
                width="w-20"
                onClick={() => setZoom({ player: me, uid: c.uid, zone: 'hand' })}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Journal */}
      <aside className="hold hidden w-72 shrink-0 flex-col rounded-xl p-3 lg:flex">
        <p className="zone-label mb-2">Journal de bord</p>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-xs text-stone-400">
          {[...game.log].reverse().map((e) => (
            <li key={e.seq}>
              <span className="text-stone-600">T{e.turn}</span> {e.message}
            </li>
          ))}
        </ul>
      </aside>

      {/* Zoom de carte */}
      {zoom && zoomData && (
        <CardZoomModal
          card={zoomData.card}
          visible={zoomData.visible}
          info={zoomData.visible ? byCardId.get(zoomData.card.cardId) : undefined}
          actions={zoomData.actions}
          onClose={() => setZoom(null)}
        />
      )}

      {/* Trash */}
      {showTrash && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowTrash(null)}
        >
          <div
            className="plank max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-semibold text-amber-100">
              Trash de {game.players[showTrash].name} ({game.players[showTrash].trash.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {game.players[showTrash].trash.map((c) => (
                <div key={c.uid} className="w-20">
                  <PlayCard card={c} width="w-20" />
                  {showTrash === me && (
                    <button
                      onClick={() => dispatch({ type: 'trashToHand', player: me, uid: c.uid })}
                      className="mt-1 w-full rounded bg-stone-800 py-0.5 text-[10px] text-stone-300 hover:bg-stone-700"
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

// ---------------------------------------------------------------------------
// Moitié de terrain : zones séparées LEADER / STAGE / ÉQUIPAGE + piles & DON.
// `mirrored` (adversaire) inverse l'ordre vertical pour que les leaders se
// fassent face de part et d'autre du cordage central.
// ---------------------------------------------------------------------------

function FieldHalf({
  board,
  mirrored,
  powerLabel,
  onBoardCard,
  highlightUid,
  onTrash,
  onDamage,
  onDraw,
  donActions,
}: {
  board: PlayerBoard;
  mirrored?: boolean;
  powerLabel: (card: CardInstance) => string | null;
  onBoardCard: (uid: number) => void;
  highlightUid?: number | null;
  onTrash: () => void;
  onDamage: () => void;
  onDraw?: () => void;
  donActions?: { spend: () => void; ready: () => void };
}) {
  const leaderStageRow = (
    <div className="flex items-stretch gap-2">
      <Zone label="Leader">
        <PlayCard
          card={board.leader}
          width="w-16"
          powerLabel={powerLabel(board.leader)}
          selected={highlightUid === board.leader.uid}
          onClick={() => onBoardCard(board.leader.uid)}
        />
      </Zone>
      <Zone label="Stage">
        {board.stage ? (
          (() => {
            const stage = board.stage;
            return <PlayCard card={stage} width="w-16" onClick={() => onBoardCard(stage.uid)} />;
          })()
        ) : (
          <div className="flex aspect-[480/671] w-16 items-center justify-center rounded-md border border-dashed border-amber-900/60 text-[9px] text-stone-600">
            vide
          </div>
        )}
      </Zone>
      <Zone label="Équipage" grow>
        <div className="flex min-h-full flex-1 items-center gap-2 overflow-x-auto">
          {board.characters.map((c) => (
            <PlayCard
              key={c.uid}
              card={c}
              width="w-16"
              powerLabel={powerLabel(c)}
              selected={highlightUid === c.uid}
              onClick={() => onBoardCard(c.uid)}
            />
          ))}
          {board.characters.length === 0 && (
            <span className="px-2 text-[10px] text-stone-600">aucun personnage</span>
          )}
        </div>
      </Zone>
    </div>
  );

  const pilesRow = (
    <div className="flex items-center gap-3">
      <div className="plank flex items-center gap-3 rounded-lg px-3 py-1.5 text-center text-[10px] text-stone-400">
        <div>
          <CardBack className="mx-auto h-12 w-9" />
          <button
            onClick={onDraw}
            disabled={!onDraw}
            className="mt-0.5 hover:text-amber-300 disabled:cursor-default"
          >
            Deck {board.deck.length}
            {onDraw && ' ↧'}
          </button>
        </div>
        <div>
          <div className="relative">
            <CardBack className="mx-auto h-12 w-9" />
            <span className="absolute inset-0 flex items-center justify-center text-base font-bold text-rose-400">
              {board.life.length}
            </span>
          </div>
          <button onClick={onDamage} className="mt-0.5 hover:text-rose-300">
            Vie · dégât
          </button>
        </div>
        <div>
          <div className="mx-auto flex h-12 w-9 items-center justify-center rounded-md border border-amber-900/50 bg-black/40 text-sm font-bold text-stone-300">
            {board.trash.length}
          </div>
          <button onClick={onTrash} className="mt-0.5 hover:text-amber-300">
            Trash
          </button>
        </div>
      </div>

      <div className="plank flex items-center gap-3 rounded-lg px-3 py-2 text-xs">
        <span className="font-semibold text-violet-300">
          DON!! {board.don.active} actifs · {board.don.rested} reposés · deck {board.don.deck}
        </span>
        {donActions && (
          <span className="flex gap-1">
            <button
              onClick={donActions.spend}
              className="rounded bg-violet-900/70 px-2 py-0.5 text-violet-200 hover:bg-violet-800"
            >
              Dépenser 1
            </button>
            <button
              onClick={donActions.ready}
              className="rounded bg-stone-800 px-2 py-0.5 text-stone-300 hover:bg-stone-700"
            >
              Redresser 1
            </button>
          </span>
        )}
        {mirrored && (
          <span className="flex items-center gap-1 text-stone-500">
            · Main : {board.hand.length}
            <span className="flex gap-0.5">
              {board.hand.slice(0, 8).map((c) => (
                <CardBack key={c.uid} className="h-6 w-4" />
              ))}
            </span>
          </span>
        )}
      </div>
      <span className="ml-auto pr-1 text-xs font-semibold text-amber-200/80">{board.name}</span>
    </div>
  );

  return (
    <div className={`flex flex-col gap-2 ${mirrored ? '' : ''}`}>
      {mirrored ? (
        <>
          {pilesRow}
          {leaderStageRow}
        </>
      ) : (
        <>
          {leaderStageRow}
          {pilesRow}
        </>
      )}
    </div>
  );
}

function Zone({
  label,
  children,
  grow,
}: {
  label: string;
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <div className={`plank rounded-xl p-2 ${grow ? 'min-w-0 flex-1' : 'shrink-0'}`}>
      <p className="zone-label mb-1">{label}</p>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

function BattleCounter({
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
      <span className="text-xs text-stone-400">{label}</span>
      <button
        onClick={() => onAdd(-1000)}
        className="h-6 w-6 rounded bg-stone-800 text-xs text-stone-300 hover:bg-stone-700"
      >
        −
      </button>
      <span className="w-14 text-center font-bold text-amber-100">{value}</span>
      <button
        onClick={() => onAdd(1000)}
        className="h-6 w-6 rounded bg-stone-800 text-xs text-stone-300 hover:bg-stone-700"
      >
        +
      </button>
    </span>
  );
}

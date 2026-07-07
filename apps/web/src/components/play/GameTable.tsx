import {
  displayedPower,
  type CardInstance,
  type CardWithVariants,
  type GameAction,
  type GameState,
  type PlayerBoard,
  type PlayerId,
} from '@op/shared';
import { useState } from 'react';
import { CardZoomModal, type ZoomAction } from './CardZoomModal';
import { CardBack, PlayCard } from './PlayCard';

// ---------------------------------------------------------------------------
// Table de jeu — partagée entre le hotseat (/play, état local complet) et le
// multijoueur (/online, vue filtrée par le serveur). `onAction` renvoie true
// si l'intention a été acceptée (localement) ou transmise (réseau).
// ---------------------------------------------------------------------------

interface Zoom {
  player: PlayerId;
  uid: number;
  zone: 'hand' | 'board';
}

interface QuickMenu extends Zoom {
  x: number;
  y: number;
}

interface Battle {
  attackerUid: number;
  targetUid: number | null;
  attackBonus: number;
  defenseBonus: number;
}

export interface ChatState {
  messages: { from: string; text: string }[];
  send: (text: string) => void;
}

export function GameTable({
  view,
  me,
  byCardId,
  onAction,
  notice,
  chat,
  spectator,
}: {
  view: GameState;
  me: PlayerId;
  byCardId: Map<string, CardWithVariants>;
  onAction: (action: GameAction) => boolean;
  notice?: string | null;
  chat?: ChatState;
  spectator?: boolean;
}) {
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [menu, setMenu] = useState<QuickMenu | null>(null);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [showTrash, setShowTrash] = useState<PlayerId | null>(null);
  const [chatInput, setChatInput] = useState('');

  const foe: PlayerId = me === 'p1' ? 'p2' : 'p1';
  const myBoard = view.players[me];
  const foeBoard = view.players[foe];

  const basePower = (card: CardInstance) => byCardId.get(card.cardId)?.power ?? null;
  const powerLabel = (card: CardInstance) => {
    const p = displayedPower(basePower(card), card);
    return p === null ? null : String(p);
  };

  const act = (action: GameAction): boolean => (spectator ? false : onAction(action));

  function endTurn() {
    setZoom(null);
    setBattle(null);
    act({ type: 'endTurn' });
  }

  function declareAttack(uid: number) {
    const attackerCard = [myBoard.leader, ...myBoard.characters].find((c) => c.uid === uid);
    if (!attackerCard) return;
    if (!attackerCard.rested) act({ type: 'toggleRest', player: me, uid });
    setBattle({ attackerUid: uid, targetUid: null, attackBonus: 0, defenseBonus: 0 });
    setZoom(null);
  }

  const attacker = battle
    ? [myBoard.leader, ...myBoard.characters].find((c) => c.uid === battle.attackerUid)
    : null;
  const target = battle?.targetUid
    ? [foeBoard.leader, ...foeBoard.characters].find((c) => c.uid === battle.targetUid)
    : null;

  // --- Zoom / menu : carte + visibilité + actions (autopay) ---
  function zoomContent(
    z: Zoom,
  ): { card: CardInstance; visible: boolean; actions: ZoomAction[] } | null {
    const board = view.players[z.player];
    const mine = z.player === me && !spectator;

    if (z.zone === 'hand') {
      const card = board.hand.find((c) => c.uid === z.uid);
      if (!card) return null;
      if (!mine || !card.faceUp) return { card, visible: card.faceUp, actions: [] };
      const info = byCardId.get(card.cardId);
      const cost = info?.cost ?? 0;
      const canPay = board.don.active >= cost;
      const playTo = (to: 'characters' | 'stage' | 'trash', label: string): ZoomAction => ({
        label: cost > 0 ? `${label} — payer ${cost} DON!!` : label,
        variant: 'primary',
        disabled: !canPay,
        hint: canPay ? undefined : `DON!! actifs insuffisants (${board.don.active}/${cost})`,
        run: () => {
          if (cost > 0 && !act({ type: 'spendDon', player: me, count: cost })) return;
          if (act({ type: 'playFromHand', player: me, uid: card.uid, to })) setZoom(null);
        },
      });
      const actions: ZoomAction[] = [];
      const category = info?.category;
      if (category === 'CHARACTER') actions.push(playTo('characters', 'Jouer le personnage'));
      else if (category === 'STAGE') actions.push(playTo('stage', 'Jouer le stage'));
      else if (category === 'EVENT') actions.push(playTo('trash', "Jouer l'event (→ trash)"));
      else
        actions.push(
          playTo('characters', 'Jouer en personnage'),
          playTo('stage', 'Jouer en stage'),
        );
      actions.push(
        {
          label: 'Jouer sans payer (correction)',
          variant: 'ghost',
          run: () => {
            const to =
              category === 'STAGE' ? 'stage' : category === 'EVENT' ? 'trash' : 'characters';
            if (act({ type: 'playFromHand', player: me, uid: card.uid, to })) setZoom(null);
          },
        },
        {
          label: 'Défausser',
          variant: 'danger',
          run: () => {
            if (act({ type: 'playFromHand', player: me, uid: card.uid, to: 'trash' }))
              setZoom(null);
          },
        },
      );
      return { card, visible: true, actions };
    }

    // Plateau : visible pour tout le monde
    const card = [board.leader, board.stage, ...board.characters].find((c) => c?.uid === z.uid);
    if (!card) return null;

    if (!mine) {
      const actions: ZoomAction[] = [];
      if (
        !spectator &&
        battle &&
        !battle.targetUid &&
        z.player === foe &&
        card.uid !== board.stage?.uid
      ) {
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
          if (act({ type: 'toggleRest', player: me, uid: card.uid })) setZoom(null);
        },
      },
      {
        label: 'Attacher 1 DON!!',
        disabled: myBoard.don.active < 1,
        run: () => act({ type: 'attachDon', player: me, uid: card.uid }),
      },
    );
    if (card.attachedDon > 0) {
      actions.push({
        label: 'Détacher 1 DON!!',
        run: () => act({ type: 'detachDon', player: me, uid: card.uid }),
      });
    }
    if (isCharacter || isStage) {
      actions.push(
        {
          label: 'KO / au trash',
          variant: 'danger',
          run: () => {
            const ok = isCharacter
              ? act({ type: 'ko', player: me, uid: card.uid })
              : act({ type: 'returnToHand', player: me, uid: card.uid });
            if (ok) setZoom(null);
          },
        },
        {
          label: 'Retour en main',
          run: () => {
            if (act({ type: 'returnToHand', player: me, uid: card.uid })) setZoom(null);
          },
        },
      );
    }
    return { card, visible: true, actions };
  }

  const zoomData = zoom ? zoomContent(zoom) : null;
  const menuData = menu ? zoomContent(menu) : null;

  function openMenu(e: React.MouseEvent, player: PlayerId, uid: number, zone: 'hand' | 'board') {
    e.preventDefault();
    setZoom(null);
    setMenu({
      player,
      uid,
      zone,
      x: Math.min(e.clientX, window.innerWidth - 250),
      y: Math.min(e.clientY, window.innerHeight - 320),
    });
  }

  function onFoeBoardCard(uid: number) {
    if (!spectator && battle && !battle.targetUid && uid !== foeBoard.stage?.uid) {
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
            <span className="font-bold text-amber-400">⚓ Tour {view.turn}</span>
            <span className="text-stone-400">
              {' '}
              · {view.players[view.activePlayer].name} joue · phase{' '}
            </span>
            <span className="font-semibold text-amber-100">{view.phase}</span>
            {spectator && <span className="ml-2 text-xs text-violet-300">👁 spectateur</span>}
          </p>
          <div className="flex items-center gap-2">
            {notice && <span className="max-w-72 truncate text-xs text-red-300">{notice}</span>}
            {!spectator && (
              <>
                <button
                  onClick={() => act({ type: 'concede', player: me })}
                  className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs text-stone-400 hover:bg-red-900/60 hover:text-red-200"
                >
                  Concéder
                </button>
                <button
                  onClick={endTurn}
                  disabled={view.activePlayer !== me}
                  className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-40"
                >
                  Fin de tour →
                </button>
              </>
            )}
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
                      act({ type: 'ko', player: foe, uid: target.uid });
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
                      act({ type: 'takeDamage', player: foe });
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
          onBoardCardMenu={(uid, e) => openMenu(e, foe, uid, 'board')}
          highlightUid={battle?.targetUid ?? null}
          onTrash={() => setShowTrash(foe)}
          onDamage={spectator ? undefined : () => act({ type: 'takeDamage', player: foe })}
        />

        <div className="rope-divider" />

        {/* ─── Ma moitié ─── */}
        <FieldHalf
          board={myBoard}
          powerLabel={powerLabel}
          onBoardCard={(uid) => setZoom({ player: me, uid, zone: 'board' })}
          onBoardCardMenu={(uid, e) => openMenu(e, me, uid, 'board')}
          onTrash={() => setShowTrash(me)}
          onDamage={spectator ? undefined : () => act({ type: 'takeDamage', player: me })}
          onDraw={spectator ? undefined : () => act({ type: 'draw', player: me })}
          donActions={
            spectator
              ? undefined
              : {
                  spend: () => act({ type: 'spendDon', player: me, count: 1 }),
                  ready: () => act({ type: 'readyDon', player: me, count: 1 }),
                }
          }
        />

        {/* Ma main */}
        <div className="hold rounded-xl p-2">
          <p className="zone-label mb-1 px-1">
            {spectator
              ? `Main de ${myBoard.name} (cachée)`
              : `Main — ${myBoard.hand.length} carte(s)`}
          </p>
          <div className="flex min-h-24 items-start gap-2 overflow-x-auto">
            {myBoard.hand.length === 0 && <p className="p-3 text-xs text-stone-500">Main vide.</p>}
            {myBoard.hand.map((c) => (
              <PlayCard
                key={c.uid}
                card={c}
                width="w-20"
                onClick={() => setZoom({ player: me, uid: c.uid, zone: 'hand' })}
                onContextMenu={(e) => openMenu(e, me, c.uid, 'hand')}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Journal + chat */}
      <aside className="hold hidden w-72 shrink-0 flex-col rounded-xl p-3 lg:flex">
        <p className="zone-label mb-2">Journal de bord</p>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto text-xs text-stone-400">
          {[...view.log].reverse().map((e) => (
            <li key={e.seq}>
              <span className="text-stone-600">T{e.turn}</span> {e.message}
            </li>
          ))}
        </ul>
        {chat && (
          <div className="mt-2 border-t border-stone-800 pt-2">
            <p className="zone-label mb-1">Chat</p>
            <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs">
              {chat.messages.slice(-30).map((m, i) => (
                <li key={i}>
                  <span className="font-semibold text-amber-300">{m.from} :</span>{' '}
                  <span className="text-stone-300">{m.text}</span>
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (chatInput.trim()) chat.send(chatInput.trim());
                setChatInput('');
              }}
              className="mt-1.5 flex gap-1"
            >
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message…"
                className="min-w-0 flex-1 rounded-lg border border-stone-700 bg-stone-950 px-2 py-1 text-xs outline-none placeholder:text-stone-600 focus:border-amber-600"
              />
              <button className="rounded-lg bg-amber-700 px-2.5 text-xs font-semibold text-white hover:bg-amber-600">
                ➤
              </button>
            </form>
          </div>
        )}
      </aside>

      {/* Zoom */}
      {zoom && zoomData && (
        <CardZoomModal
          card={zoomData.card}
          visible={zoomData.visible}
          info={zoomData.visible ? byCardId.get(zoomData.card.cardId) : undefined}
          actions={zoomData.actions}
          onClose={() => setZoom(null)}
        />
      )}

      {/* Menu contextuel */}
      {menu && menuData && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className="plank fixed z-[60] w-60 rounded-xl p-1.5 shadow-2xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <p className="zone-label px-2 py-1">
              {menuData.visible
                ? (byCardId.get(menuData.card.cardId)?.name ?? menuData.card.cardId)
                : 'Carte cachée'}
            </p>
            <button
              onClick={() => {
                setZoom({ player: menu.player, uid: menu.uid, zone: menu.zone });
                setMenu(null);
              }}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-stone-200 hover:bg-stone-800"
            >
              🔍 Voir en grand
            </button>
            {menuData.actions.map((a) => (
              <button
                key={a.label}
                disabled={a.disabled}
                onClick={() => {
                  a.run();
                  setMenu(null);
                }}
                title={a.hint}
                className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                  a.variant === 'danger'
                    ? 'text-red-300 hover:bg-red-950/60'
                    : a.variant === 'primary'
                      ? 'text-amber-300 hover:bg-amber-950/60'
                      : 'text-stone-200 hover:bg-stone-800'
                }`}
              >
                {a.label}
                {a.hint && <span className="block text-[10px] text-red-400">{a.hint}</span>}
              </button>
            ))}
          </div>
        </>
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
              Trash de {view.players[showTrash].name} ({view.players[showTrash].trash.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {view.players[showTrash].trash.map((c) => (
                <div key={c.uid} className="w-20">
                  <PlayCard card={c} width="w-20" />
                  {showTrash === me && !spectator && (
                    <button
                      onClick={() => act({ type: 'trashToHand', player: me, uid: c.uid })}
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

// --- Moitié de terrain : zones LEADER / STAGE / ÉQUIPAGE + piles & DON ---

function FieldHalf({
  board,
  mirrored,
  powerLabel,
  onBoardCard,
  onBoardCardMenu,
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
  onBoardCardMenu?: (uid: number, e: React.MouseEvent) => void;
  highlightUid?: number | null;
  onTrash: () => void;
  onDamage?: () => void;
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
          onContextMenu={(e) => onBoardCardMenu?.(board.leader.uid, e)}
        />
      </Zone>
      <Zone label="Stage">
        {board.stage ? (
          (() => {
            const stage = board.stage;
            return (
              <PlayCard
                card={stage}
                width="w-16"
                onClick={() => onBoardCard(stage.uid)}
                onContextMenu={(e) => onBoardCardMenu?.(stage.uid, e)}
              />
            );
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
              onContextMenu={(e) => onBoardCardMenu?.(c.uid, e)}
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
          <button onClick={onDamage} disabled={!onDamage} className="mt-0.5 hover:text-rose-300">
            Vie{onDamage ? ' · dégât' : ''}
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
    <div className="flex flex-col gap-2">
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

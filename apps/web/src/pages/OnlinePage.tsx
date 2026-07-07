import type { CardWithVariants, GameAction, GameState, PlayerId } from '@op/shared';
import { toSimText } from '@op/shared';
import { Client, type Room } from 'colyseus.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchCatalog } from '../api';
import { GameTable } from '../components/play/GameTable';
import { PlayCard } from '../components/play/PlayCard';
import { deckPayloadFromSimText } from '../lib/game';
import { loadLocalDeck, toDeckFile } from '../lib/deck';

// Multijoueur temps réel (Phase 3) : le serveur Colyseus est AUTORITAIRE.
// Cette page n'applique jamais le moteur localement : elle envoie des
// intentions et affiche la vue filtrée que le serveur renvoie.

const GAME_SERVER_URL =
  (import.meta.env.VITE_GAME_SERVER as string | undefined) ?? `ws://${location.hostname}:2567`;

type Mode = 'public' | 'create' | 'join' | 'spectate';

interface LobbyInfo {
  code: string;
  p1: string | null;
  p2: string | null;
  started: boolean;
  spectators: number;
}

function randomCode(): string {
  return Array.from(
    { length: 5 },
    () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)],
  ).join('');
}

export function OnlinePage() {
  const [catalog, setCatalog] = useState<CardWithVariants[] | null>(null);
  const [name, setName] = useState('Pirate');
  const [deckText, setDeckText] = useState('');
  const [mode, setMode] = useState<Mode>('public');
  const [codeInput, setCodeInput] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [you, setYou] = useState<PlayerId | 'spectator'>('spectator');
  const [view, setView] = useState<GameState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ from: string; text: string }[]>([]);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetchCatalog().then(setCatalog, (e: Error) => setProblems([e.message]));
  }, []);

  useEffect(() => {
    return () => {
      void roomRef.current?.leave();
    };
  }, []);

  const byCardId = useMemo(() => new Map((catalog ?? []).map((c) => [c.id, c])), [catalog]);

  function wireRoom(r: Room) {
    roomRef.current = r;
    r.onMessage('view', (payload: { you: PlayerId | 'spectator'; view: GameState }) => {
      setYou(payload.you);
      setView(payload.view);
    });
    r.onMessage('lobby', (payload: LobbyInfo) => setLobby(payload));
    r.onMessage('chat', (m: { from: string; text: string }) =>
      setChatMessages((prev) => [...prev.slice(-60), m]),
    );
    r.onMessage('presence', (p: { name: string; connected: boolean }) =>
      setNotice(p.connected ? `${p.name} est de retour ⚓` : `${p.name} a perdu la connexion…`),
    );
    r.onMessage('error', (e: { message: string }) => setNotice(e.message));
    r.onLeave((code) => {
      if (code > 1001 && roomRef.current) {
        // coupure inattendue : tentative de reconnexion (fenêtre serveur : 120 s)
        setNotice('Connexion perdue, tentative de reconnexion…');
        new Client(GAME_SERVER_URL)
          .reconnect(r.reconnectionToken)
          .then((again) => {
            wireRoom(again);
            setRoom(again);
            again.send('requestView');
            setNotice('Reconnecté ⚓');
          })
          .catch(() => {
            setNotice('Reconnexion impossible — partie perdue.');
            setRoom(null);
            setView(null);
            roomRef.current = null;
          });
      }
    });
    r.send('requestView');
  }

  async function connect() {
    if (!catalog) return;
    setProblems([]);
    setNotice(null);

    const options: Record<string, unknown> = { name: name.trim() || 'Pirate' };
    if (mode === 'spectate') {
      options.role = 'spectator';
      options.code = codeInput.trim().toUpperCase();
    } else {
      const { payload, errors } = deckPayloadFromSimText(deckText, byCardId);
      if (!payload) {
        setProblems(errors);
        return;
      }
      options.deck = payload;
      options.code =
        mode === 'public'
          ? 'PUBLIC'
          : mode === 'create'
            ? randomCode()
            : codeInput.trim().toUpperCase();
    }
    if (!options.code) {
      setProblems(['Code de salon requis.']);
      return;
    }

    setConnecting(true);
    try {
      const client = new Client(GAME_SERVER_URL);
      const r = await client.joinOrCreate('match', options);
      wireRoom(r);
      setRoom(r);
      setLobby({ code: String(options.code), p1: null, p2: null, started: false, spectators: 0 });
    } catch (err) {
      setProblems([err instanceof Error ? err.message : 'Connexion impossible.']);
    } finally {
      setConnecting(false);
    }
  }

  function sendAction(action: GameAction): boolean {
    if (!roomRef.current) return false;
    roomRef.current.send('action', action);
    return true; // le serveur répondra par une vue (ou une erreur affichée en notice)
  }

  if (!catalog) {
    return <p className="p-8 text-center text-sm text-stone-500">Chargement du catalogue…</p>;
  }

  // ─── Lobby (pas encore connecté) ───
  if (!room) {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Jouer en ligne</h1>
          <p className="text-sm text-slate-400">
            Serveur autoritaire : ta main reste chez toi, celle de l'adversaire chez lui.
          </p>
        </div>

        <div className="flex gap-2">
          {(
            [
              ['public', 'Partie publique'],
              ['create', 'Créer un salon'],
              ['join', 'Rejoindre un code'],
              ['spectate', 'Regarder'],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                mode === m
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ton nom"
            className="w-48 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-600"
          />
          {(mode === 'join' || mode === 'spectate') && (
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="CODE"
              className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold tracking-widest outline-none focus:border-sky-600"
            />
          )}
        </div>

        {mode !== 'spectate' && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ton deck (texte OPTCG Sim)
              </p>
              <button
                onClick={() => {
                  const local = loadLocalDeck();
                  if (local) setDeckText(toSimText(toDeckFile(local)));
                }}
                className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700"
              >
                Deck du builder
              </button>
            </div>
            <textarea
              value={deckText}
              onChange={(e) => setDeckText(e.target.value)}
              placeholder={'1xOP01-001\n4xOP01-016\n…'}
              rows={8}
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-600"
            />
          </div>
        )}

        {problems.length > 0 && (
          <ul className="space-y-0.5 rounded-lg bg-red-950/40 p-2.5 text-xs text-red-300">
            {problems.slice(0, 4).map((p, i) => (
              <li key={i}>• {p}</li>
            ))}
          </ul>
        )}

        <button
          onClick={connect}
          disabled={connecting}
          className="w-fit rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
        >
          {connecting ? 'Connexion…' : 'Embarquer ⚓'}
        </button>
      </div>
    );
  }

  // ─── En attente d'adversaire ───
  if (!view) {
    return (
      <div className="wood-deck flex h-full flex-col items-center justify-center gap-4 rounded-2xl">
        <h2 className="text-xl font-semibold text-amber-100">En attente d'un adversaire…</h2>
        {lobby && lobby.code !== 'PUBLIC' && (
          <p className="text-stone-300">
            Code du salon :{' '}
            <span className="rounded bg-black/40 px-3 py-1 font-mono text-2xl font-bold tracking-widest text-amber-300">
              {lobby.code}
            </span>
          </p>
        )}
        <p className="text-xs text-stone-400">
          {lobby?.p1 ?? '…'} vs {lobby?.p2 ?? '…'}
        </p>
        <button
          onClick={() => {
            void roomRef.current?.leave();
            roomRef.current = null;
            setRoom(null);
            setView(null);
          }}
          className="rounded-lg bg-stone-800 px-4 py-2 text-xs text-stone-300 hover:bg-stone-700"
        >
          Quitter
        </button>
      </div>
    );
  }

  const seat: PlayerId = you === 'spectator' ? 'p1' : you;

  // ─── Mulligan (mon siège uniquement) ───
  if (view.status === 'MULLIGAN' && you !== 'spectator' && !view.players[seat].mulliganDecided) {
    const board = view.players[seat];
    return (
      <div className="wood-deck mx-auto flex h-full flex-col items-center justify-center gap-4 rounded-2xl">
        <h2 className="text-xl font-semibold text-amber-100">Garde ou mulligan ?</h2>
        <div className="flex gap-2">
          {board.hand.map((c) => (
            <PlayCard key={c.uid} card={c} width="w-24" />
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => sendAction({ type: 'mulligan', player: seat, mulligan: false })}
            className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Garder
          </button>
          <button
            onClick={() => sendAction({ type: 'mulligan', player: seat, mulligan: true })}
            className="rounded-lg bg-stone-800 px-5 py-2 text-sm font-semibold text-stone-200 hover:bg-stone-700"
          >
            Mulligan (5 nouvelles)
          </button>
        </div>
      </div>
    );
  }

  if (view.status === 'MULLIGAN') {
    return (
      <div className="wood-deck flex h-full items-center justify-center rounded-2xl">
        <p className="text-sm text-stone-300">L'adversaire décide de son mulligan…</p>
      </div>
    );
  }

  // ─── Victoire ───
  if (view.status === 'FINISHED' && view.winner) {
    const winner = view.players[view.winner];
    return (
      <div className="wood-deck flex h-full flex-col items-center justify-center gap-4 rounded-2xl">
        <h1 className="text-4xl font-bold text-amber-300">🏴‍☠️ {winner.name} gagne !</h1>
        <p className="text-stone-200">{view.winReason}</p>
        <button
          onClick={() => {
            void roomRef.current?.leave();
            roomRef.current = null;
            setRoom(null);
            setView(null);
            setChatMessages([]);
          }}
          className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-500"
        >
          Retour au lobby
        </button>
      </div>
    );
  }

  return (
    <GameTable
      view={view}
      me={seat}
      byCardId={byCardId}
      onAction={sendAction}
      notice={notice}
      spectator={you === 'spectator'}
      chat={{
        messages: chatMessages,
        send: (text) => roomRef.current?.send('chat', { text }),
      }}
    />
  );
}

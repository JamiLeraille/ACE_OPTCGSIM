import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from 'colyseus.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '@op/shared';
import { MatchRoom } from '../src/rooms/MatchRoom.js';

// Test d'intégration multijoueur : deux vrais clients WebSocket contre un vrai
// serveur en mémoire. Nécessite la base SQLite PEUPLÉE (validation des decks) :
// absente en CI (dev.db est gitignorée) -> la suite est sautée proprement.

const DB_PATH = fileURLToPath(new URL('../../../packages/db/prisma/dev.db', import.meta.url));
// SKIP_DB_TESTS=1 simule la CI (base absente) sans toucher au fichier.
const dbReady = existsSync(DB_PATH) && process.env.SKIP_DB_TESTS !== '1';
if (!dbReady) {
  console.warn(
    '[match-room.test] dev.db absente : tests d’intégration sautés (lancer pnpm ingest).',
  );
}
const describeWithDb = describe.skipIf(!dbReady);

const PORT = 2599;
const WS_URL = `ws://127.0.0.1:${PORT}`;

// Deck rouge légal : leader OP01-001 + 12 cartes x4 + 1 x2 = 50.
function legalDeck() {
  const cards = [];
  for (let i = 4; i <= 15; i++) {
    const id = `OP01-${String(i).padStart(3, '0')}`;
    cards.push({ cardId: id, variantId: id, quantity: 4 });
  }
  cards.push({ cardId: 'OP01-016', variantId: 'OP01-016', quantity: 2 });
  return { leaderVariantId: 'OP01-001', cards };
}

/** Prochaine occurrence d'un message donné. */
function nextMessage<T = unknown>(room: Room, type: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout sur "${type}"`)), timeoutMs);
    room.onMessage(type, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

type ViewMessage = { you: string; view: GameState };

/** Collecteur à file : s'abonne UNE fois dès le join, aucun message perdu
 *  (les handlers réenregistrés a posteriori ratent les messages déjà livrés). */
function collect<T>(room: Room, type: string) {
  const queue: T[] = [];
  const waiters: ((value: T) => void)[] = [];
  room.onMessage(type, (payload: T) => {
    const waiter = waiters.shift();
    if (waiter) waiter(payload);
    else queue.push(payload);
  });
  return {
    next(timeoutMs = 5000): Promise<T> {
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout sur "${type}"`)), timeoutMs);
        waiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
    async until(predicate: (value: T) => boolean, tries = 25): Promise<T> {
      let value = await this.next();
      while (!predicate(value) && --tries > 0) value = await this.next();
      if (!predicate(value)) throw new Error(`condition jamais atteinte sur "${type}"`);
      return value;
    },
  };
}

let server: Server;

beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport({ server: createServer() }) });
  server.define('match', MatchRoom).filterBy(['code']);
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false).catch(() => undefined);
});

describeWithDb('MatchRoom — intégration 2 clients', () => {
  it('partie complète : join, vues filtrées, autorisation, tours, chat, concession', async () => {
    const c1 = new Client(WS_URL);
    const c2 = new Client(WS_URL);

    // --- Ann crée / rejoint la file publique de test ---
    const room1 = await c1.joinOrCreate('match', {
      name: 'Ann',
      code: 'TEST-INTEG',
      deck: legalDeck(),
    });
    const views1 = collect<ViewMessage>(room1, 'view');
    const errors1 = collect<{ message: string }>(room1, 'error');

    // --- Bob rejoint la même room -> la partie démarre ---
    const room2 = await c2.joinOrCreate('match', {
      name: 'Bob',
      code: 'TEST-INTEG',
      deck: legalDeck(),
    });
    const views2 = collect<ViewMessage>(room2, 'view');
    const errors2 = collect<{ message: string }>(room2, 'error');
    const chats2 = collect<{ from: string; text: string }>(room2, 'chat');
    room2.send('requestView');

    const v1 = await views1.next();
    const v2 = await views2.next();

    // Sièges distincts, partie en mulligan
    expect([v1.you, v2.you].sort()).toEqual(['p1', 'p2']);
    expect(v1.view.status).toBe('MULLIGAN');

    // --- AUCUNE FUITE : chacun voit sa main, jamais celle de l'autre ---
    const mine = v1.you as 'p1' | 'p2';
    const theirs = mine === 'p1' ? 'p2' : 'p1';
    expect(v1.view.players[mine].hand.every((c) => c.cardId.startsWith('OP01'))).toBe(true);
    expect(JSON.stringify(v1.view.players[theirs].hand)).not.toContain('OP01');
    expect(JSON.stringify(v1.view.players[mine].deck)).not.toContain('OP01');
    expect(v1.view.rng).toBe(0);

    // --- Autorisation : agir sur le siège adverse est refusé ---
    room1.send('action', { type: 'mulligan', player: theirs, mulligan: false });
    expect((await errors1.next()).message).toContain('siège');

    // --- Mulligan des deux côtés -> PLAYING ---
    room1.send('action', { type: 'mulligan', player: mine, mulligan: false });
    room2.send('action', { type: 'mulligan', player: theirs, mulligan: true });
    const latest = await views1.until((v) => v.view.status === 'PLAYING');
    expect(latest.view.turn).toBe(1);

    // --- endTurn hors de son tour : refusé ---
    const inactive = latest.view.activePlayer === mine ? room2 : room1;
    const inactiveErrors = latest.view.activePlayer === mine ? errors2 : errors1;
    inactive.send('action', { type: 'endTurn' });
    expect((await inactiveErrors.next()).message).toContain('tour');

    // --- endTurn du joueur actif : les DEUX clients reçoivent le tour 2 ---
    const active = latest.view.activePlayer === mine ? room1 : room2;
    active.send('action', { type: 'endTurn' });
    const [t1, t2] = await Promise.all([
      views1.until((v) => v.view.turn === 2),
      views2.until((v) => v.view.turn === 2),
    ]);
    expect(t1.view.turn).toBe(2);
    expect(t2.view.turn).toBe(2);
    // le nouveau joueur actif a pioché : 6 cartes, visibles pour lui seul
    const nowActive = t1.view.activePlayer;
    expect(t1.view.players[nowActive].hand).toHaveLength(6);
    const activeView = nowActive === t1.you ? t1 : t2;
    expect(activeView.view.players[nowActive].hand.every((c) => c.cardId !== '')).toBe(true);

    // --- Chat ---
    room1.send('chat', { text: 'Bien joué !' });
    expect(await chats2.next()).toMatchObject({ text: 'Bien joué !' });

    // --- Concession -> FINISHED diffusé ---
    room1.send('action', { type: 'concede', player: mine });
    const end = await views2.until((v) => v.view.status === 'FINISHED');
    expect(end.view.winner).toBe(theirs);

    await room1.leave();
    await room2.leave();
  }, 30_000);

  it('un spectateur voit la partie mais aucune main, et ne peut pas agir', async () => {
    const c1 = new Client(WS_URL);
    const c2 = new Client(WS_URL);
    const c3 = new Client(WS_URL);

    const room1 = await c1.joinOrCreate('match', {
      name: 'Ann',
      code: 'TEST-SPEC',
      deck: legalDeck(),
    });
    const room2 = await c2.joinOrCreate('match', {
      name: 'Bob',
      code: 'TEST-SPEC',
      deck: legalDeck(),
    });
    const room3 = await c3.joinOrCreate('match', {
      name: 'Zoé',
      code: 'TEST-SPEC',
      role: 'spectator',
    });

    const specView = nextMessage<ViewMessage>(room3, 'view');
    room3.send('requestView');
    const v = await specView;
    expect(v.you).toBe('spectator');
    expect(JSON.stringify(v.view.players.p1.hand)).not.toContain('OP01');
    expect(JSON.stringify(v.view.players.p2.hand)).not.toContain('OP01');
    expect(v.view.players.p1.leader.cardId).toBe('OP01-001'); // le plateau public, lui, est visible

    const specError = nextMessage<{ message: string }>(room3, 'error');
    room3.send('action', { type: 'endTurn' });
    expect((await specError).message).toContain('spectateur');

    await Promise.all([room1.leave(), room2.leave(), room3.leave()]);
  }, 30_000);

  it('refuse un deck illégal à la porte (49 cartes)', async () => {
    const c = new Client(WS_URL);
    const deck = legalDeck();
    deck.cards[deck.cards.length - 1] = { cardId: 'OP01-016', variantId: 'OP01-016', quantity: 1 };
    await expect(
      c.joinOrCreate('match', { name: 'Tricheur', code: 'TEST-BAD', deck }),
    ).rejects.toThrow(/illégal|49/i);
  }, 15_000);
});

describeWithDb('MatchRoom — reconnexion', () => {
  it('une déconnexion sauvage puis une reconnexion ne perd pas la partie', async () => {
    const c1 = new Client(WS_URL);
    const c2 = new Client(WS_URL);
    const room1 = await c1.joinOrCreate('match', {
      name: 'Ann',
      code: 'TEST-RECO',
      deck: legalDeck(),
    });
    const views1 = collect<ViewMessage>(room1, 'view');
    const room2 = await c2.joinOrCreate('match', {
      name: 'Bob',
      code: 'TEST-RECO',
      deck: legalDeck(),
    });
    const views2 = collect<ViewMessage>(room2, 'view');
    room2.send('requestView');

    const v1 = await views1.next();
    const v2 = await views2.next();
    room1.send('action', { type: 'mulligan', player: v1.you, mulligan: false });
    room2.send('action', { type: 'mulligan', player: v2.you, mulligan: false });
    await views1.until((v) => v.view.status === 'PLAYING');

    // Bob coupe SANS consentement (crash simulé), puis revient avec son token.
    const token = room2.reconnectionToken;
    const presence1 = collect<{ connected: boolean }>(room1, 'presence');
    await room2.leave(false);
    expect((await presence1.next()).connected).toBe(false);

    const room2bis = await new Client(WS_URL).reconnect(token);
    const views2bis = collect<ViewMessage>(room2bis, 'view');
    room2bis.send('requestView');
    const restored = await views2bis.next();

    expect(restored.you).toBe(v2.you); // même siège
    expect(restored.view.status).toBe('PLAYING'); // la partie n'est pas perdue
    expect((await presence1.next()).connected).toBe(true);

    // ... et il peut toujours agir sur son siège
    if (restored.view.activePlayer === restored.you) {
      room2bis.send('action', { type: 'endTurn' });
      const after = await views2bis.until((v) => v.view.turn === restored.view.turn + 1);
      expect(after.view.turn).toBe(restored.view.turn + 1);
    }

    await Promise.all([room1.leave(), room2bis.leave()]);
  }, 30_000);
});

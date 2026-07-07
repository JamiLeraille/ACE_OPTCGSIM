import { randomInt } from 'node:crypto';
import { getPrisma } from '@op/db';
import {
  applyAction,
  createGame,
  DeckCardEntrySchema,
  EngineError,
  filterStateFor,
  validateDeck,
  variantIdForArt,
  splitVariantId,
  type GameAction,
  type GameState,
  type PlayerId,
  type PlayerSetup,
  type Viewer,
} from '@op/shared';
import { Room, type Client } from '@colyseus/core';
import { z } from 'zod';
import { loadCatalogById } from '../catalog.js';

// ---------------------------------------------------------------------------
// Room autoritaire (Phase 3) : le client envoie des INTENTIONS, le serveur les
// rejoue dans le moteur déterministe (@op/engine), valide la légalité, mute
// l'état canonique et diffuse à chaque client une VUE FILTRÉE (l'information
// cachée — mains adverses, ordre des decks, seed — ne quitte jamais le serveur).
// ---------------------------------------------------------------------------

const JoinOptionsSchema = z.object({
  name: z.string().min(1).max(40).default('Pirate'),
  role: z.enum(['player', 'spectator']).default('player'),
  code: z.string().max(12).optional(),
  deck: z
    .object({
      leaderVariantId: z.string(),
      cards: z.array(DeckCardEntrySchema).min(1),
    })
    .optional(),
});

interface Seat {
  player: PlayerId;
  sessionId: string;
  name: string;
  setup: PlayerSetup;
  connected: boolean;
}

const RECONNECTION_WINDOW_S = 120;

export class MatchRoom extends Room {
  override maxClients = 12; // 2 joueurs + spectateurs

  private seats: Seat[] = [];
  private game: GameState | null = null;
  private persisted = false;

  override onCreate(options: { code?: string }) {
    void this.setMetadata({ code: options.code ?? 'PUBLIC' });

    this.onMessage('action', (client, message) => {
      this.handleAction(client, message as GameAction);
    });

    this.onMessage('chat', (client, message: { text?: string }) => {
      const text = String(message?.text ?? '').slice(0, 300);
      if (text.trim() === '') return;
      this.broadcast('chat', { from: this.nameOf(client), text });
    });

    // Resynchronisation à la demande (reconnexion, onglet réveillé…)
    this.onMessage('requestView', (client) => {
      this.sendView(client);
      this.broadcastLobby();
    });
  }

  override async onJoin(client: Client, rawOptions: unknown) {
    const parsed = JoinOptionsSchema.safeParse(rawOptions ?? {});
    if (!parsed.success) throw new Error('Options de connexion invalides.');
    const options = parsed.data;

    const wantsSeat = options.role === 'player' && this.seats.length < 2 && !this.game;
    if (wantsSeat) {
      if (!options.deck) throw new Error('Un deck est requis pour jouer.');
      const setup = await this.buildSetup(options.name, options.deck);
      const player: PlayerId = this.seats.some((s) => s.player === 'p1') ? 'p2' : 'p1';
      this.seats.push({
        player,
        sessionId: client.sessionId,
        name: options.name,
        setup,
        connected: true,
      });

      if (this.seats.length === 2) {
        this.startGame();
      }
    }

    this.broadcastLobby();
    if (this.game) this.sendView(client);
  }

  /** Validation SERVEUR du deck : mêmes règles que le client, source base de cartes. */
  private async buildSetup(
    name: string,
    deck: {
      leaderVariantId: string;
      cards: { cardId: string; variantId: string; quantity: number }[];
    },
  ): Promise<PlayerSetup> {
    const catalog = await loadCatalogById();

    const result = validateDeck(deck, (id) => catalog.get(id));
    if (!result.valid) {
      throw new Error(`Deck illégal : ${result.errors[0]?.message ?? 'erreur inconnue'}`);
    }

    const leaderCardId = splitVariantId(deck.leaderVariantId).cardId;
    const leader = catalog.get(leaderCardId);
    if (!leader || leader.life === null) throw new Error(`Leader inconnu : ${leaderCardId}.`);

    // Les variantes doivent exister ; repli sur la variante de base sinon.
    const cards: string[] = [];
    for (const entry of deck.cards) {
      const card = catalog.get(entry.cardId);
      const variantOk = card?.variants.some((v) => v.id === entry.variantId);
      const variantId = variantOk ? entry.variantId : variantIdForArt(entry.cardId, 'base');
      for (let i = 0; i < entry.quantity; i++) cards.push(variantId);
    }

    return { name, leaderVariantId: deck.leaderVariantId, leaderLife: leader.life, cards };
  }

  private startGame() {
    const p1 = this.seats.find((s) => s.player === 'p1')!;
    const p2 = this.seats.find((s) => s.player === 'p2')!;
    // Seed générée CÔTÉ SERVEUR : mélanges et pioches inconnaissables du client.
    this.game = createGame({ seed: randomInt(2 ** 31), p1: p1.setup, p2: p2.setup });
    this.broadcastViews();
  }

  private handleAction(client: Client, action: GameAction) {
    const seat = this.seats.find((s) => s.sessionId === client.sessionId);
    if (!seat) {
      client.send('error', { message: 'Les spectateurs ne peuvent pas agir.' });
      return;
    }
    if (!this.game) {
      client.send('error', { message: 'La partie n’a pas commencé.' });
      return;
    }
    // Autorisation : on n'agit que sur son propre siège, et endTurn
    // uniquement à son tour. (Relais manuel : les corrections restent libres.)
    if ('player' in action && action.player !== seat.player) {
      client.send('error', { message: 'Action refusée : ce n’est pas ton siège.' });
      return;
    }
    if (action.type === 'endTurn' && this.game.activePlayer !== seat.player) {
      client.send('error', { message: 'Action refusée : ce n’est pas ton tour.' });
      return;
    }

    try {
      this.game = applyAction(this.game, action);
    } catch (err) {
      client.send('error', {
        message: err instanceof EngineError ? err.message : 'Action invalide.',
      });
      return;
    }

    this.broadcastViews();
    if (this.game.status === 'FINISHED') void this.persistMatch();
  }

  // --- Vues filtrées ---

  private viewerOf(client: Client): Viewer {
    return this.seats.find((s) => s.sessionId === client.sessionId)?.player ?? 'spectator';
  }

  private nameOf(client: Client): string {
    return (
      this.seats.find((s) => s.sessionId === client.sessionId)?.name ??
      `Spectateur-${client.sessionId.slice(0, 4)}`
    );
  }

  private sendView(client: Client) {
    if (!this.game) return;
    const viewer = this.viewerOf(client);
    client.send('view', { you: viewer, view: filterStateFor(this.game, viewer) });
  }

  private broadcastViews() {
    for (const client of this.clients) this.sendView(client);
  }

  private broadcastLobby() {
    this.broadcast('lobby', {
      code: (this.metadata as { code?: string })?.code ?? 'PUBLIC',
      p1: this.seats.find((s) => s.player === 'p1')?.name ?? null,
      p2: this.seats.find((s) => s.player === 'p2')?.name ?? null,
      started: this.game !== null,
      spectators: this.clients.length - this.seats.filter((s) => s.connected).length,
    });
  }

  // --- Reconnexion / abandon ---

  override async onLeave(client: Client, consented: boolean) {
    const seat = this.seats.find((s) => s.sessionId === client.sessionId);
    if (!seat) {
      this.broadcastLobby();
      return;
    }

    const gameRunning = this.game !== null && this.game.status !== 'FINISHED';
    if (!consented && gameRunning) {
      seat.connected = false;
      this.broadcast('presence', { player: seat.player, name: seat.name, connected: false });
      try {
        const reconnected = await this.allowReconnection(client, RECONNECTION_WINDOW_S);
        seat.sessionId = reconnected.sessionId;
        seat.connected = true;
        this.broadcast('presence', { player: seat.player, name: seat.name, connected: true });
        this.sendView(reconnected);
        this.broadcastLobby();
        return;
      } catch {
        // fenêtre expirée : défaite propre
      }
    }

    if (this.game && this.game.status === 'PLAYING') {
      try {
        this.game = applyAction(this.game, { type: 'concede', player: seat.player });
        this.broadcastViews();
        void this.persistMatch();
      } catch {
        // partie déjà terminée entre-temps
      }
    }
    this.broadcastLobby();
  }

  private async persistMatch() {
    if (!this.game || this.persisted) return;
    this.persisted = true;
    const p1 = this.seats.find((s) => s.player === 'p1');
    const p2 = this.seats.find((s) => s.player === 'p2');
    try {
      await getPrisma().match.create({
        data: {
          seed: 0, // la seed reste secrète tant que les replays publics n'existent pas
          p1Name: p1?.name ?? '?',
          p2Name: p2?.name ?? '?',
          p1Leader: p1?.setup.leaderVariantId ?? '?',
          p2Leader: p2?.setup.leaderVariantId ?? '?',
          winner: this.game.winner,
          winReason: this.game.winReason,
          turns: this.game.turn,
          log: JSON.stringify(this.game.log),
        },
      });
    } catch (err) {
      console.error('[match] persistance échouée :', err);
      this.persisted = false;
    }
  }
}

import { createServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MatchRoom } from './rooms/MatchRoom.js';

// Serveur de jeu Colyseus (Phase 3). Hébergeur-agnostique : un simple process
// Node avec WebSockets — localhost en dev, VM/container en prod.

const port = Number(process.env.PORT ?? 2567);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: createServer() }),
});

// filterBy('code') : le matchmaking public partage code="PUBLIC",
// les salons privés se retrouvent par leur code.
gameServer.define('match', MatchRoom).filterBy(['code']);

await gameServer.listen(port);
console.log(`[game-server] Colyseus à l'écoute sur ws://localhost:${port}`);

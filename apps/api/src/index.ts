import compress from '@fastify/compress';
import Fastify from 'fastify';
import { registerImageProxy } from './image-proxy.js';
import { registerCardRoutes } from './routes/cards.js';
import { registerDeckRoutes } from './routes/decks.js';

// API REST : catalogue de cartes, partage de decks, proxy d'images (dev).
// Le trafic temps réel (Phase 3) vivra dans un serveur Colyseus séparé.

const app = Fastify({ logger: true });

await app.register(compress); // le catalogue JSON complet passe de ~4 Mo à ~300 Ko

app.get('/health', () => ({ status: 'ok' }));
registerImageProxy(app);
registerCardRoutes(app);
registerDeckRoutes(app);

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

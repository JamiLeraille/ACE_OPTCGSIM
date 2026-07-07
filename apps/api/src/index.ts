import Fastify from 'fastify';
import { registerImageProxy } from './image-proxy.js';

// API REST (comptes, decks, catalogue) — les routes arrivent en Phase 1.
// Le trafic temps réel (Phase 3) vivra dans un serveur Colyseus séparé.

const app = Fastify({ logger: true });

app.get('/health', () => ({ status: 'ok' }));
registerImageProxy(app);

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

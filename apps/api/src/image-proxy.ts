import type { FastifyInstance } from 'fastify';
import { request } from 'undici';
import { OFFICIAL_IMAGE_BASE } from '@op/shared';

// ---------------------------------------------------------------------------
// Proxy de cache d'images (version DEV — la prod utilisera un Cloudflare Worker).
// Contraintes juridiques câblées :
//   - allowlist stricte : seul le CDN officiel Bandai, seuls des noms de
//     variantes valides ;
//   - AUCUN rehébergement : simple passe-plat avec cache HTTP ;
//   - kill-switch : IMAGE_PROXY_ENABLED=false coupe le proxy (503).
// ---------------------------------------------------------------------------

/** Nom de fichier accepté : id de variante + .png, rien d'autre. */
const IMAGE_FILE_REGEX = /^(OP|ST|EB|PRB|P)\d*-\d+(_[a-z]\d+)?\.png$/;

const memoryCache = new Map<string, Buffer>();

export function registerImageProxy(app: FastifyInstance): void {
  app.get<{ Params: { file: string } }>('/img/:file', async (req, reply) => {
    if (process.env.IMAGE_PROXY_ENABLED === 'false') {
      return reply.code(503).send({ error: 'Proxy d’images désactivé (kill-switch).' });
    }

    const { file } = req.params;
    if (!IMAGE_FILE_REGEX.test(file)) {
      return reply.code(400).send({ error: 'Nom d’image invalide.' });
    }

    const cached = memoryCache.get(file);
    if (cached) {
      return reply
        .header('content-type', 'image/png')
        .header('cache-control', 'public, max-age=86400')
        .header('access-control-allow-origin', '*')
        .header('x-cache', 'hit')
        .send(cached);
    }

    const upstream = await request(`${OFFICIAL_IMAGE_BASE}/${file}`, {
      headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://en.onepiece-cardgame.com/' },
    });
    if (upstream.statusCode !== 200) {
      return reply.code(404).send({ error: `Image introuvable (${upstream.statusCode}).` });
    }
    const body = Buffer.from(await upstream.body.arrayBuffer());
    memoryCache.set(file, body);

    return reply
      .header('content-type', 'image/png')
      .header('cache-control', 'public, max-age=86400')
      .header('access-control-allow-origin', '*')
      .header('x-cache', 'miss')
      .send(body);
  });
}

import type { FastifyInstance } from 'fastify';
import { request } from 'undici';
import { OFFICIAL_IMAGE_BASE } from '@op/shared';

// ---------------------------------------------------------------------------
// Proxy de cache d'images (version DEV — la prod utilisera un Cloudflare Worker).
// Contraintes juridiques câblées :
//   - allowlist stricte : seul le CDN officiel Bandai, seuls des noms de
//     variantes valides ;
//   - AUCUN rehébergement : passe-plat avec cache mémoire ;
//   - kill-switch : IMAGE_PROXY_ENABLED=false coupe le proxy (503).
// Politesse / robustesse : timeouts courts (le CDN suspend les rafales),
// concurrence amont limitée, déduplication des requêtes en vol.
// ---------------------------------------------------------------------------

/** Nom de fichier accepté : id de variante + .png, rien d'autre. */
const IMAGE_FILE_REGEX = /^(OP|ST|EB|PRB|P)\d*-\d+(_[a-z]\d+)?\.png$/;

const UPSTREAM_CONCURRENCY = 4;
const UPSTREAM_TIMEOUT_MS = 10_000;

const memoryCache = new Map<string, Buffer>();
const inFlight = new Map<string, Promise<Buffer | null>>();

let active = 0;
const waiters: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= UPSTREAM_CONCURRENCY) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active++;
  try {
    return await task();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

async function fetchUpstream(file: string): Promise<Buffer | null> {
  return withSlot(async () => {
    try {
      const res = await request(`${OFFICIAL_IMAGE_BASE}/${file}`, {
        headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://en.onepiece-cardgame.com/' },
        headersTimeout: UPSTREAM_TIMEOUT_MS,
        bodyTimeout: UPSTREAM_TIMEOUT_MS,
      });
      if (res.statusCode !== 200) {
        await res.body.dump();
        return null;
      }
      return Buffer.from(await res.body.arrayBuffer());
    } catch {
      return null; // timeout / réseau : le client réessaiera
    }
  });
}

function getImage(file: string): Promise<Buffer | null> {
  const cached = memoryCache.get(file);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(file);
  if (pending) return pending;

  const promise = fetchUpstream(file)
    .then((buf) => {
      if (buf) memoryCache.set(file, buf);
      return buf;
    })
    .finally(() => inFlight.delete(file));
  inFlight.set(file, promise);
  return promise;
}

export function registerImageProxy(app: FastifyInstance): void {
  app.get<{ Params: { file: string } }>('/img/:file', async (req, reply) => {
    if (process.env.IMAGE_PROXY_ENABLED === 'false') {
      return reply.code(503).send({ error: 'Proxy d’images désactivé (kill-switch).' });
    }

    const { file } = req.params;
    if (!IMAGE_FILE_REGEX.test(file)) {
      return reply.code(400).send({ error: 'Nom d’image invalide.' });
    }

    const fromCache = memoryCache.has(file);
    const body = await getImage(file);
    if (!body) {
      return reply
        .code(502)
        .header('cache-control', 'no-store')
        .send({ error: 'Image indisponible en amont.' });
    }

    return reply
      .header('content-type', 'image/png')
      .header('cache-control', 'public, max-age=86400')
      .header('access-control-allow-origin', '*')
      .header('x-cache', fromCache ? 'hit' : 'miss')
      .send(body);
  });
}

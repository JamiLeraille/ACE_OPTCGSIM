import { request } from 'undici';

// Politesse envers le site officiel : throttling entre requêtes + retry exponentiel.
// Particularité du site : la première visite répond 302 vers ../index.php (pose un
// cookie de session) puis renvoie vers le cardlist -> il faut suivre les
// redirections ET conserver les cookies (comportement navigateur).

const BASE_URL = 'https://en.onepiece-cardgame.com/cardlist/';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const THROTTLE_MS = 1200;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const cookieJar = new Map<string, string>();

function storeCookies(setCookie: string | string[] | undefined): void {
  if (!setCookie) return;
  for (const raw of Array.isArray(setCookie) ? setCookie : [setCookie]) {
    const pair = raw.split(';')[0];
    const eq = pair?.indexOf('=') ?? -1;
    if (pair && eq > 0) cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(): string {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function getWithRedirects(url: string, redirectsLeft: number): Promise<string> {
  const res = await request(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
      ...(cookieJar.size > 0 ? { cookie: cookieHeader() } : {}),
    },
    headersTimeout: 30_000,
    bodyTimeout: 60_000,
  });
  storeCookies(res.headers['set-cookie'] as string | string[] | undefined);

  if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
    await res.body.dump();
    const location = res.headers['location'];
    if (typeof location !== 'string' || redirectsLeft === 0) {
      throw new Error(`Redirection non suivable (HTTP ${res.statusCode}) sur ${url}`);
    }
    return getWithRedirects(new URL(location, url).toString(), redirectsLeft - 1);
  }
  if (res.statusCode !== 200) {
    await res.body.dump();
    throw new Error(`HTTP ${res.statusCode} sur ${url}`);
  }
  return res.body.text();
}

/** Page du cardlist, optionnellement filtrée par série. Retry x3 avec backoff. */
export async function fetchCardlistPage(seriesCode?: string): Promise<string> {
  const url = seriesCode ? `${BASE_URL}?series=${encodeURIComponent(seriesCode)}` : BASE_URL;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await getWithRedirects(url, 8);
    } catch (err) {
      lastError = err;
      if (attempt < 3) await sleep(2000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`Échec après 3 tentatives sur ${url} : ${String(lastError)}`);
}

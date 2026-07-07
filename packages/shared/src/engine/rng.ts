// RNG déterministe (mulberry32) : l'état du générateur vit DANS le GameState,
// si bien qu'un match se rejoue à l'identique à partir de (seed, decks, actions).

export type RngState = number;

export function seedRng(seed: number): RngState {
  return seed >>> 0;
}

/** Un tirage : retourne [valeur dans [0,1), nouvel état]. Pur. */
export function nextRandom(state: RngState): [number, RngState] {
  const t = (state + 0x6d2b79f5) >>> 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return [value, t];
}

/** Fisher-Yates seedé. Pur : ne modifie pas l'entrée. */
export function shuffle<T>(items: readonly T[], rng: RngState): [T[], RngState] {
  const arr = [...items];
  let state = rng;
  for (let i = arr.length - 1; i > 0; i--) {
    const [value, next] = nextRandom(state);
    state = next;
    const j = Math.floor(value * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return [arr, state];
}

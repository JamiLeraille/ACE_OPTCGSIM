// ---------------------------------------------------------------------------
// Source d'images : UN SEUL point de passage, pour rester réversible
// (contrainte juridique : jamais de rehébergement, hot-link/proxy uniquement,
// kill-switch possible en coupant le proxy).
// ---------------------------------------------------------------------------

/** CDN officiel Bandai. Seul hôte autorisé pour les images de cartes. */
export const OFFICIAL_IMAGE_BASE = 'https://en.onepiece-cardgame.com/images/cardlist/card';

/** URL officielle d'une variante : OP01-001.png, OP01-006_p1.png, ... */
export function officialImageUrl(variantId: string): string {
  return `${OFFICIAL_IMAGE_BASE}/${variantId}.png`;
}

/**
 * URL via notre proxy de cache (Cloudflare Worker en prod, proxy local en dev).
 * `proxyBase` vient de la config d'environnement ; s'il est vide (kill-switch),
 * on retombe sur le hot-link direct du CDN officiel.
 */
export function proxiedImageUrl(variantId: string, proxyBase: string | undefined): string {
  if (!proxyBase) return officialImageUrl(variantId);
  return `${proxyBase.replace(/\/$/, '')}/${variantId}.png`;
}

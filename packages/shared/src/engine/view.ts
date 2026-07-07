import type { CardInstance, GameState, PlayerId } from './types.js';

// ---------------------------------------------------------------------------
// Vues filtrées (Phase 3, serveur autoritaire) : chaque client reçoit un
// GameState de même FORME que l'état réel (l'UI du plateau fonctionne telle
// quelle), mais où l'information cachée est masquée AVANT d'être envoyée :
//   - l'état du RNG (donc la seed et l'ordre des mélanges) n'est jamais exposé ;
//   - l'ordre des decks est illisible (cartes masquées) ;
//   - les cartes de vie sont face cachée pour tout le monde (même leur
//     propriétaire, conformément aux règles) ;
//   - la main adverse est masquée ; un spectateur ne voit aucune main.
// ---------------------------------------------------------------------------

export type Viewer = PlayerId | 'spectator';

function maskCard(card: CardInstance): CardInstance {
  return { ...card, cardId: '', variantId: '', faceUp: false };
}

/** Vue d'un état pour un observateur donné. L'objet retourné est un clone :
 *  l'état canonique du serveur n'est jamais muté ni partagé. */
export function filterStateFor(state: GameState, viewer: Viewer): GameState {
  const view = structuredClone(state);
  view.rng = 0;

  for (const pid of ['p1', 'p2'] as const) {
    const board = view.players[pid];
    board.deck = board.deck.map(maskCard);
    board.life = board.life.map(maskCard);
    if (viewer !== pid) {
      board.hand = board.hand.map(maskCard);
    }
  }
  return view;
}

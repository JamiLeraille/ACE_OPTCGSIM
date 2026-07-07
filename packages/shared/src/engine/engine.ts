import { cardIdFromVariantId } from '../deck-format.js';
import { seedRng, shuffle } from './rng.js';
import type {
  CardInstance,
  GameAction,
  GameConfig,
  GameState,
  PlayerBoard,
  PlayerId,
  PlayerSetup,
} from './types.js';

// ---------------------------------------------------------------------------
// Moteur déterministe — Phase 2 (relais manuel).
// applyAction est un réducteur PUR : (état, intention) -> nouvel état.
// Une action illégale lève EngineError et ne modifie rien.
// Rejouer (seed, decks, journal d'actions) reproduit l'état à l'identique —
// c'est la propriété qui rendra le serveur autoritaire trivial en Phase 3.
// ---------------------------------------------------------------------------

export class EngineError extends Error {}

export const MAX_CHARACTERS = 5;
export const DON_DECK_SIZE = 10;
export const HAND_SIZE = 5;

function opponentOf(player: PlayerId): PlayerId {
  return player === 'p1' ? 'p2' : 'p1';
}

// --- Construction ---

function buildBoard(setup: PlayerSetup, firstUid: number): [PlayerBoard, number] {
  let uid = firstUid;
  const mk = (variantId: string, overrides: Partial<CardInstance> = {}): CardInstance => ({
    uid: uid++,
    cardId: cardIdFromVariantId(variantId),
    variantId,
    rested: false,
    faceUp: true,
    attachedDon: 0,
    ...overrides,
  });

  const board: PlayerBoard = {
    name: setup.name,
    leader: mk(setup.leaderVariantId),
    leaderLife: setup.leaderLife,
    characters: [],
    stage: null,
    hand: [],
    deck: setup.cards.map((v) => mk(v, { faceUp: false })),
    trash: [],
    life: [],
    don: { deck: DON_DECK_SIZE, active: 0, rested: 0 },
    mulliganDecided: false,
  };
  return [board, uid];
}

export function createGame(config: GameConfig): GameState {
  if (config.p1.cards.length !== 50 || config.p2.cards.length !== 50) {
    throw new EngineError('Chaque deck doit contenir exactement 50 cartes.');
  }

  let uid = 1;
  const [p1, uidAfterP1] = buildBoard(config.p1, uid);
  uid = uidAfterP1;
  const [p2, uidAfterP2] = buildBoard(config.p2, uid);
  uid = uidAfterP2;

  const state: GameState = {
    status: 'MULLIGAN',
    rng: seedRng(config.seed),
    turn: 0,
    activePlayer: 'p1',
    phase: 'MAIN',
    players: { p1, p2 },
    winner: null,
    winReason: null,
    nextUid: uid,
    log: [],
  };

  // Mélange initial + pioche des 5 cartes de départ
  for (const pid of ['p1', 'p2'] as const) {
    const board = state.players[pid];
    const [shuffled, rng] = shuffle(board.deck, state.rng);
    board.deck = shuffled;
    state.rng = rng;
    board.hand = board.deck.splice(0, HAND_SIZE).map((c) => ({ ...c, faceUp: true }));
  }
  logEvent(state, null, 'Decks mélangés, 5 cartes piochées de chaque côté. Mulligan ?');
  return state;
}

// --- Journal ---

function logEvent(state: GameState, player: PlayerId | null, message: string): void {
  state.log.push({ seq: state.log.length + 1, turn: state.turn, player, message });
}

// --- Aides internes (mutent le clone) ---

function findInPlay(board: PlayerBoard, uid: number): CardInstance | null {
  if (board.leader.uid === uid) return board.leader;
  if (board.stage?.uid === uid) return board.stage;
  return board.characters.find((c) => c.uid === uid) ?? null;
}

function drawOne(state: GameState, player: PlayerId): void {
  const board = state.players[player];
  const card = board.deck.shift();
  if (!card) {
    state.status = 'FINISHED';
    state.winner = opponentOf(player);
    state.winReason = `${board.name} ne peut plus piocher (deck vide).`;
    logEvent(state, player, `Deck vide : ${state.players[state.winner].name} gagne par deck-out !`);
    return;
  }
  card.faceUp = true;
  board.hand.push(card);
  logEvent(state, player, `${board.name} pioche (${board.hand.length} en main).`);
}

/** Fin du mulligan des deux joueurs : pose des vies puis premier tour de p1. */
function startPlaying(state: GameState): void {
  for (const pid of ['p1', 'p2'] as const) {
    const board = state.players[pid];
    board.life = board.deck.splice(0, board.leaderLife).map((c) => ({ ...c, faceUp: false }));
    logEvent(state, pid, `${board.name} pose ${board.life.length} carte(s) de vie.`);
  }
  state.status = 'PLAYING';
  state.turn = 1;
  state.activePlayer = 'p1';
  // Premier tour du premier joueur : pas de pioche, 1 seul DON.
  state.players.p1.don.deck -= 1;
  state.players.p1.don.active += 1;
  state.phase = 'MAIN';
  logEvent(state, 'p1', `Tour 1 — ${state.players.p1.name} commence : +1 DON!!, pas de pioche.`);
}

/** END -> passe la main : REFRESH / DRAW / DON automatiques, arrivée en MAIN. */
function advanceTurn(state: GameState): void {
  const previous = state.activePlayer;
  logEvent(state, previous, `${state.players[previous].name} termine son tour.`);

  const player = opponentOf(previous);
  state.activePlayer = player;
  state.turn += 1;
  const board = state.players[player];

  // REFRESH : les DON!! attachés reviennent actifs, tout se redresse.
  state.phase = 'REFRESH';
  let returned = 0;
  for (const card of [board.leader, board.stage, ...board.characters]) {
    if (!card) continue;
    returned += card.attachedDon;
    card.attachedDon = 0;
    card.rested = false;
  }
  board.don.active += board.don.rested + returned;
  board.don.rested = 0;
  logEvent(
    state,
    player,
    `Tour ${state.turn} — Refresh : tout est redressé${returned ? `, ${returned} DON!! attaché(s) reviennent` : ''}.`,
  );

  // DRAW
  state.phase = 'DRAW';
  drawOne(state, player);
  if (state.status === 'FINISHED') return;

  // DON : +2 (limités au deck DON restant)
  state.phase = 'DON';
  const gained = Math.min(2, board.don.deck);
  board.don.deck -= gained;
  board.don.active += gained;
  if (gained > 0) logEvent(state, player, `+${gained} DON!! (${donTotal(board)} en jeu).`);

  state.phase = 'MAIN';
}

function donTotal(board: PlayerBoard): number {
  const attached =
    board.leader.attachedDon +
    (board.stage?.attachedDon ?? 0) +
    board.characters.reduce((s, c) => s + c.attachedDon, 0);
  return board.don.active + board.don.rested + attached;
}

// --- Réducteur principal ---

export function applyAction(previous: GameState, action: GameAction): GameState {
  if (previous.status === 'FINISHED') {
    throw new EngineError('La partie est terminée.');
  }
  const state = structuredClone(previous);

  switch (action.type) {
    case 'mulligan': {
      if (state.status !== 'MULLIGAN') throw new EngineError('Le mulligan est déjà résolu.');
      const board = state.players[action.player];
      if (board.mulliganDecided) throw new EngineError('Mulligan déjà décidé pour ce joueur.');
      if (action.mulligan) {
        // Main remélangée dans le deck, 5 nouvelles cartes.
        const returned = board.hand.splice(0).map((c) => ({ ...c, faceUp: false }));
        const [shuffled, rng] = shuffle([...board.deck, ...returned], state.rng);
        board.deck = shuffled;
        state.rng = rng;
        board.hand = board.deck.splice(0, HAND_SIZE).map((c) => ({ ...c, faceUp: true }));
        logEvent(state, action.player, `${board.name} mulligane : 5 nouvelles cartes.`);
      } else {
        logEvent(state, action.player, `${board.name} garde sa main.`);
      }
      board.mulliganDecided = true;
      if (state.players.p1.mulliganDecided && state.players.p2.mulliganDecided) {
        startPlaying(state);
      }
      return state;
    }

    case 'endTurn': {
      requirePlaying(state);
      state.phase = 'END';
      advanceTurn(state);
      return state;
    }

    case 'draw': {
      requirePlaying(state);
      drawOne(state, action.player);
      return state;
    }

    case 'playFromHand': {
      requirePlaying(state);
      const board = state.players[action.player];
      const index = board.hand.findIndex((c) => c.uid === action.uid);
      if (index === -1) throw new EngineError('Carte absente de la main.');
      const [card] = board.hand.splice(index, 1);
      if (!card) throw new EngineError('Carte introuvable.');

      if (action.to === 'characters') {
        if (board.characters.length >= MAX_CHARACTERS) {
          board.hand.splice(index, 0, card);
          throw new EngineError(`Zone personnage pleine (${MAX_CHARACTERS} max).`);
        }
        board.characters.push({ ...card, rested: false, faceUp: true });
        logEvent(state, action.player, `${board.name} joue ${card.cardId} en personnage.`);
      } else if (action.to === 'stage') {
        if (board.stage) {
          board.trash.push({ ...board.stage, attachedDon: 0 });
          logEvent(state, action.player, `${board.stage.cardId} (stage) part au trash.`);
        }
        board.stage = { ...card, rested: false, faceUp: true };
        logEvent(state, action.player, `${board.name} joue ${card.cardId} en stage.`);
      } else {
        board.trash.push({ ...card, faceUp: true });
        logEvent(state, action.player, `${board.name} défausse/joue ${card.cardId} (trash).`);
      }
      return state;
    }

    case 'trashToHand': {
      requirePlaying(state);
      const board = state.players[action.player];
      const index = board.trash.findIndex((c) => c.uid === action.uid);
      if (index === -1) throw new EngineError('Carte absente du trash.');
      const [card] = board.trash.splice(index, 1);
      board.hand.push({ ...card!, rested: false });
      logEvent(state, action.player, `${card!.cardId} revient du trash en main.`);
      return state;
    }

    case 'returnToHand': {
      requirePlaying(state);
      const board = state.players[action.player];
      const charIndex = board.characters.findIndex((c) => c.uid === action.uid);
      let card: CardInstance | null = null;
      if (charIndex !== -1) {
        card = board.characters.splice(charIndex, 1)[0] ?? null;
      } else if (board.stage?.uid === action.uid) {
        card = board.stage;
        board.stage = null;
      }
      if (!card) throw new EngineError('Carte absente du plateau.');
      board.don.rested += card.attachedDon; // les DON!! attachés retombent reposés
      board.hand.push({ ...card, rested: false, attachedDon: 0 });
      logEvent(state, action.player, `${card.cardId} retourne en main.`);
      return state;
    }

    case 'toggleRest': {
      requirePlaying(state);
      const board = state.players[action.player];
      const card = findInPlay(board, action.uid);
      if (!card) throw new EngineError('Carte absente du plateau.');
      card.rested = !card.rested;
      logEvent(
        state,
        action.player,
        `${card.cardId} ${card.rested ? 'se repose (attaque/coût…)' : 'se redresse'}.`,
      );
      return state;
    }

    case 'spendDon': {
      requirePlaying(state);
      const board = state.players[action.player];
      if (action.count < 1 || board.don.active < action.count) {
        throw new EngineError('Pas assez de DON!! actifs.');
      }
      board.don.active -= action.count;
      board.don.rested += action.count;
      logEvent(state, action.player, `${board.name} dépense ${action.count} DON!!.`);
      return state;
    }

    case 'readyDon': {
      requirePlaying(state);
      const board = state.players[action.player];
      if (action.count < 1 || board.don.rested < action.count) {
        throw new EngineError('Pas assez de DON!! reposés.');
      }
      board.don.rested -= action.count;
      board.don.active += action.count;
      logEvent(state, action.player, `${board.name} redresse ${action.count} DON!! (correction).`);
      return state;
    }

    case 'attachDon': {
      requirePlaying(state);
      const board = state.players[action.player];
      if (board.don.active < 1) throw new EngineError('Aucun DON!! actif à attacher.');
      const card = findInPlay(board, action.uid);
      if (!card) throw new EngineError('Cible absente du plateau.');
      board.don.active -= 1;
      card.attachedDon += 1;
      logEvent(state, action.player, `1 DON!! attaché à ${card.cardId} (+1000).`);
      return state;
    }

    case 'detachDon': {
      requirePlaying(state);
      const board = state.players[action.player];
      const card = findInPlay(board, action.uid);
      if (!card || card.attachedDon < 1) throw new EngineError('Aucun DON!! attaché à détacher.');
      card.attachedDon -= 1;
      board.don.rested += 1;
      logEvent(state, action.player, `1 DON!! détaché de ${card.cardId} (correction).`);
      return state;
    }

    case 'ko': {
      requirePlaying(state);
      const board = state.players[action.player];
      const index = board.characters.findIndex((c) => c.uid === action.uid);
      if (index === -1) throw new EngineError('Personnage introuvable.');
      const [card] = board.characters.splice(index, 1);
      board.don.rested += card!.attachedDon; // retour reposé (corrigeable via readyDon)
      board.trash.push({ ...card!, rested: false, attachedDon: 0 });
      logEvent(state, action.player, `${card!.cardId} est KO.`);
      return state;
    }

    case 'takeDamage': {
      requirePlaying(state);
      const board = state.players[action.player];
      const lifeCard = board.life.shift();
      if (!lifeCard) {
        state.status = 'FINISHED';
        state.winner = opponentOf(action.player);
        state.winReason = `${board.name} a subi un dégât sans carte de vie restante.`;
        logEvent(
          state,
          action.player,
          `Coup fatal ! ${state.players[state.winner].name} remporte la partie.`,
        );
        return state;
      }
      lifeCard.faceUp = true;
      board.hand.push(lifeCard);
      logEvent(
        state,
        action.player,
        `${board.name} subit 1 dégât : ${lifeCard.cardId} en main (Trigger ? — manuel). Vie restante : ${board.life.length}.`,
      );
      return state;
    }

    case 'concede': {
      const board = state.players[action.player];
      state.status = 'FINISHED';
      state.winner = opponentOf(action.player);
      state.winReason = `${board.name} concède.`;
      logEvent(state, action.player, `${board.name} concède la partie.`);
      return state;
    }

    default:
      throw new EngineError('Action inconnue.');
  }
}

function requirePlaying(state: GameState): void {
  if (state.status !== 'PLAYING') {
    throw new EngineError('La partie n’a pas commencé (mulligan en cours).');
  }
}

/** Power affiché d'une carte en jeu : base (fournie par l'UI) + 1000 par DON!! attaché. */
export function displayedPower(basePower: number | null, card: CardInstance): number | null {
  if (basePower === null) return null;
  return basePower + card.attachedDon * 1000;
}

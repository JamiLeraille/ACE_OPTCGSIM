import type { RngState } from './rng.js';

// ---------------------------------------------------------------------------
// Types du moteur (@op/engine, Phase 2 : relais manuel).
// Le moteur automatise l'état de tour, les compteurs et la victoire ;
// les EFFETS des cartes restent joués manuellement (Phase 4 : EffectScript).
// ---------------------------------------------------------------------------

export type PlayerId = 'p1' | 'p2';

export type Phase = 'REFRESH' | 'DRAW' | 'DON' | 'MAIN' | 'END';

export type GameStatus = 'MULLIGAN' | 'PLAYING' | 'FINISHED';

/** Instance physique d'une carte dans la partie. */
export interface CardInstance {
  uid: number;
  cardId: string; // identité de jeu ("OP01-016")
  variantId: string; // visuel choisi ("OP01-016_p4")
  rested: boolean;
  faceUp: boolean;
  attachedDon: number;
}

export interface DonArea {
  deck: number; // DON!! restants dans le deck DON (10 au départ)
  active: number;
  rested: number;
}

export interface PlayerBoard {
  name: string;
  leader: CardInstance;
  leaderLife: number; // life imprimée du leader (pour le setup)
  characters: CardInstance[]; // max 5
  stage: CardInstance | null;
  hand: CardInstance[];
  deck: CardInstance[]; // index 0 = dessus
  trash: CardInstance[];
  life: CardInstance[]; // index 0 = dessus, face cachée
  don: DonArea;
  mulliganDecided: boolean;
}

export interface GameEvent {
  seq: number;
  turn: number;
  player: PlayerId | null;
  message: string;
}

export interface GameState {
  status: GameStatus;
  rng: RngState;
  turn: number; // 1 = premier tour de p1
  activePlayer: PlayerId;
  phase: Phase;
  players: Record<PlayerId, PlayerBoard>;
  winner: PlayerId | null;
  winReason: string | null;
  nextUid: number;
  log: GameEvent[];
}

export interface PlayerSetup {
  name: string;
  leaderVariantId: string;
  leaderLife: number; // fourni par l'UI depuis le catalogue
  /** 50 ids de variantes, quantités déjà développées. */
  cards: string[];
}

export interface GameConfig {
  seed: number;
  p1: PlayerSetup;
  p2: PlayerSetup;
}

/** Intentions du relais manuel. Le moteur valide la légalité STRUCTURELLE
 *  (zones, limites, tours), jamais les effets de cartes. */
export type GameAction =
  | { type: 'mulligan'; player: PlayerId; mulligan: boolean }
  | { type: 'endTurn' }
  | { type: 'draw'; player: PlayerId }
  | { type: 'playFromHand'; player: PlayerId; uid: number; to: 'characters' | 'stage' | 'trash' }
  | { type: 'trashToHand'; player: PlayerId; uid: number }
  | { type: 'returnToHand'; player: PlayerId; uid: number }
  | { type: 'toggleRest'; player: PlayerId; uid: number }
  | { type: 'spendDon'; player: PlayerId; count: number }
  | { type: 'readyDon'; player: PlayerId; count: number }
  | { type: 'attachDon'; player: PlayerId; uid: number }
  | { type: 'detachDon'; player: PlayerId; uid: number }
  | { type: 'ko'; player: PlayerId; uid: number }
  | { type: 'takeDamage'; player: PlayerId }
  | { type: 'concede'; player: PlayerId };

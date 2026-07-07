import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  filterStateFor,
  type GameConfig,
  type GameState,
} from '../src/index.js';

function testDeck(prefix: string): string[] {
  const cards: string[] = [];
  for (let i = 0; i < 50; i++) cards.push(`${prefix}-${String(100 + i)}`);
  return cards;
}

function started(): GameState {
  let s = createGame({
    seed: 99,
    p1: { name: 'Ann', leaderVariantId: 'OP01-001', leaderLife: 5, cards: testDeck('OP01') },
    p2: { name: 'Bob', leaderVariantId: 'OP02-001', leaderLife: 4, cards: testDeck('OP02') },
  } satisfies GameConfig);
  s = applyAction(s, { type: 'mulligan', player: 'p1', mulligan: false });
  s = applyAction(s, { type: 'mulligan', player: 'p2', mulligan: false });
  return s;
}

describe('filterStateFor — aucune fuite d’information cachée', () => {
  const state = started();

  it('le RNG (seed) ne quitte jamais le serveur', () => {
    expect(filterStateFor(state, 'p1').rng).toBe(0);
    expect(filterStateFor(state, 'spectator').rng).toBe(0);
    expect(state.rng).not.toBe(0); // l'état canonique, lui, garde son RNG
  });

  it('p1 voit sa main mais pas celle de p2 (aucun id ne fuite)', () => {
    const view = filterStateFor(state, 'p1');
    expect(view.players.p1.hand.every((c) => c.cardId.startsWith('OP01'))).toBe(true);
    const foeHand = JSON.stringify(view.players.p2.hand);
    expect(foeHand).not.toContain('OP02');
    expect(view.players.p2.hand.every((c) => c.cardId === '' && !c.faceUp)).toBe(true);
    // les compteurs restent exacts
    expect(view.players.p2.hand).toHaveLength(state.players.p2.hand.length);
  });

  it('l’ordre des decks est illisible pour tout le monde', () => {
    const view = filterStateFor(state, 'p1');
    for (const pid of ['p1', 'p2'] as const) {
      expect(JSON.stringify(view.players[pid].deck)).not.toContain('OP0');
      expect(view.players[pid].deck).toHaveLength(state.players[pid].deck.length);
    }
  });

  it('les cartes de vie sont cachées même à leur propriétaire', () => {
    const view = filterStateFor(state, 'p1');
    expect(JSON.stringify(view.players.p1.life)).not.toContain('OP01');
    expect(view.players.p1.life).toHaveLength(5);
  });

  it('un spectateur ne voit aucune main', () => {
    const view = filterStateFor(state, 'spectator');
    expect(JSON.stringify(view.players.p1.hand)).not.toContain('OP01');
    expect(JSON.stringify(view.players.p2.hand)).not.toContain('OP02');
  });

  it('le plateau public reste visible (leader, journal, compteurs DON)', () => {
    const view = filterStateFor(state, 'spectator');
    expect(view.players.p1.leader.cardId).toBe('OP01-001');
    expect(view.players.p1.don).toEqual(state.players.p1.don);
    expect(view.log.length).toBe(state.log.length);
  });

  it('ne mute pas l’état canonique', () => {
    const before = JSON.stringify(state);
    filterStateFor(state, 'p1');
    filterStateFor(state, 'spectator');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('une carte de vie prise en dégât redevient visible pour son propriétaire (en main)', () => {
    const damaged = applyAction(state, { type: 'takeDamage', player: 'p1' });
    const view = filterStateFor(damaged, 'p1');
    const lastCard = view.players.p1.hand.at(-1);
    expect(lastCard?.cardId.startsWith('OP01')).toBe(true);
    // ... mais pas pour l'adversaire
    const foeView = filterStateFor(damaged, 'p2');
    expect(foeView.players.p1.hand.every((c) => c.cardId === '')).toBe(true);
  });
});

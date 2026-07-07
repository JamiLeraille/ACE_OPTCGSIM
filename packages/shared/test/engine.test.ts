import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  displayedPower,
  EngineError,
  type GameAction,
  type GameConfig,
  type GameState,
} from '../src/index.js';

// Deck de test : 50 variantes (les ids n'ont pas besoin d'exister au catalogue,
// le moteur ne valide que la structure).
function testDeck(prefix: string): string[] {
  const cards: string[] = [];
  for (let i = 0; i < 50; i++) cards.push(`${prefix}-${String(100 + i)}`);
  return cards;
}

function config(seed = 42): GameConfig {
  return {
    seed,
    p1: { name: 'Ann', leaderVariantId: 'OP01-001', leaderLife: 5, cards: testDeck('OP01') },
    p2: { name: 'Bob', leaderVariantId: 'OP01-060', leaderLife: 4, cards: testDeck('OP02') },
  };
}

/** Partie démarrée : les deux joueurs gardent leur main. */
function started(seed = 42): GameState {
  let s = createGame(config(seed));
  s = applyAction(s, { type: 'mulligan', player: 'p1', mulligan: false });
  s = applyAction(s, { type: 'mulligan', player: 'p2', mulligan: false });
  return s;
}

describe('setup et mulligan', () => {
  it('mélange, pioche 5, attend le mulligan', () => {
    const s = createGame(config());
    expect(s.status).toBe('MULLIGAN');
    expect(s.players.p1.hand).toHaveLength(5);
    expect(s.players.p2.hand).toHaveLength(5);
    expect(s.players.p1.deck).toHaveLength(45);
    expect(s.players.p1.life).toHaveLength(0);
  });

  it('le mélange est déterministe par seed', () => {
    const a = createGame(config(7));
    const b = createGame(config(7));
    const c = createGame(config(8));
    const hand = (s: GameState) => s.players.p1.hand.map((x) => x.variantId).join(',');
    expect(hand(a)).toBe(hand(b));
    expect(hand(a)).not.toBe(hand(c));
  });

  it('le mulligan redonne 5 cartes différentes et un deck remélangé', () => {
    const s0 = createGame(config());
    const before = s0.players.p1.hand.map((c) => c.variantId).join(',');
    const s1 = applyAction(s0, { type: 'mulligan', player: 'p1', mulligan: true });
    expect(s1.players.p1.hand).toHaveLength(5);
    expect(s1.players.p1.deck).toHaveLength(45);
    expect(s1.players.p1.hand.map((c) => c.variantId).join(',')).not.toBe(before);
  });

  it('après les deux décisions : vies posées (life du leader), tour 1, 1 DON, pas de pioche', () => {
    const s = started();
    expect(s.status).toBe('PLAYING');
    expect(s.turn).toBe(1);
    expect(s.activePlayer).toBe('p1');
    expect(s.phase).toBe('MAIN');
    expect(s.players.p1.life).toHaveLength(5); // life du leader d'Ann
    expect(s.players.p2.life).toHaveLength(4);
    expect(s.players.p1.hand).toHaveLength(5); // pas de pioche au tour 1
    expect(s.players.p1.don).toEqual({ deck: 9, active: 1, rested: 0 });
  });
});

describe('machine à états du tour', () => {
  it('endTurn : le joueur 2 pioche et gagne 2 DON', () => {
    const s = applyAction(started(), { type: 'endTurn' });
    expect(s.turn).toBe(2);
    expect(s.activePlayer).toBe('p2');
    expect(s.phase).toBe('MAIN');
    expect(s.players.p2.hand).toHaveLength(6);
    expect(s.players.p2.don).toEqual({ deck: 8, active: 2, rested: 0 });
  });

  it('le deck DON est plafonné à 10', () => {
    let s = started();
    for (let i = 0; i < 12; i++) s = applyAction(s, { type: 'endTurn' });
    const total = (p: 'p1' | 'p2') =>
      s.players[p].don.deck + s.players[p].don.active + s.players[p].don.rested;
    expect(total('p1')).toBe(10);
    expect(total('p2')).toBe(10);
    expect(s.players.p1.don.deck).toBe(0);
    expect(s.players.p1.don.active).toBe(10);
  });

  it('refresh : redresse tout et rend les DON attachés actifs', () => {
    let s = started();
    // Ann : attache son DON au leader, le repose (attaque), fin de tour
    const leaderUid = s.players.p1.leader.uid;
    s = applyAction(s, { type: 'attachDon', player: 'p1', uid: leaderUid });
    s = applyAction(s, { type: 'toggleRest', player: 'p1', uid: leaderUid });
    expect(s.players.p1.leader.attachedDon).toBe(1);
    expect(s.players.p1.leader.rested).toBe(true);

    s = applyAction(s, { type: 'endTurn' }); // tour de Bob
    s = applyAction(s, { type: 'endTurn' }); // retour à Ann -> refresh
    expect(s.players.p1.leader.attachedDon).toBe(0);
    expect(s.players.p1.leader.rested).toBe(false);
    // 1 (T1) + 1 revenu + 2 (T3) = ... total en jeu : 1+2 = 3 dont tous actifs
    expect(s.players.p1.don.active).toBe(3);
    expect(s.players.p1.don.rested).toBe(0);
  });
});

describe('actions manuelles', () => {
  it('joue un personnage depuis la main, limite de 5', () => {
    let s = started();
    for (let i = 0; i < 5; i++) {
      // recharge la main au besoin
      if (s.players.p1.hand.length === 0) s = applyAction(s, { type: 'draw', player: 'p1' });
      const uid = s.players.p1.hand[0]!.uid;
      s = applyAction(s, { type: 'playFromHand', player: 'p1', uid, to: 'characters' });
    }
    expect(s.players.p1.characters).toHaveLength(5);
    const uid = s.players.p1.hand[0]?.uid ?? -1;
    expect(() =>
      applyAction(s, { type: 'playFromHand', player: 'p1', uid, to: 'characters' }),
    ).toThrow(EngineError);
  });

  it('un nouveau stage remplace l’ancien (trash)', () => {
    let s = started();
    const [a, b] = s.players.p1.hand;
    s = applyAction(s, { type: 'playFromHand', player: 'p1', uid: a!.uid, to: 'stage' });
    s = applyAction(s, { type: 'playFromHand', player: 'p1', uid: b!.uid, to: 'stage' });
    expect(s.players.p1.stage?.uid).toBe(b!.uid);
    expect(s.players.p1.trash.map((c) => c.uid)).toContain(a!.uid);
  });

  it('DON : dépense, attache (+1000 affiché), KO rend les DON reposés', () => {
    let s = started();
    s = applyAction(s, { type: 'endTurn' }); // Bob a 2 DON
    const uid = s.players.p2.hand[0]!.uid;
    s = applyAction(s, { type: 'playFromHand', player: 'p2', uid, to: 'characters' });
    s = applyAction(s, { type: 'attachDon', player: 'p2', uid });
    expect(s.players.p2.characters[0]!.attachedDon).toBe(1);
    expect(displayedPower(5000, s.players.p2.characters[0]!)).toBe(6000);
    expect(s.players.p2.don.active).toBe(1);

    s = applyAction(s, { type: 'spendDon', player: 'p2', count: 1 });
    expect(s.players.p2.don).toMatchObject({ active: 0, rested: 1 });

    s = applyAction(s, { type: 'ko', player: 'p2', uid });
    expect(s.players.p2.characters).toHaveLength(0);
    expect(s.players.p2.trash.map((c) => c.uid)).toContain(uid);
    expect(s.players.p2.don.rested).toBe(2); // le DON attaché revient reposé
  });

  it('rejette les actions illégales sans modifier l’état', () => {
    const s = started();
    expect(() => applyAction(s, { type: 'spendDon', player: 'p1', count: 5 })).toThrow(EngineError);
    expect(() => applyAction(s, { type: 'ko', player: 'p1', uid: 9999 })).toThrow(EngineError);
    expect(s.players.p1.don.active).toBe(1); // état d'origine intact
  });
});

describe('victoire', () => {
  it('dégâts : la carte de vie va en main ; à zéro, le coup suivant est fatal', () => {
    let s = started();
    for (let i = 0; i < 4; i++) s = applyAction(s, { type: 'takeDamage', player: 'p2' });
    expect(s.players.p2.life).toHaveLength(0);
    expect(s.players.p2.hand).toHaveLength(9); // 5 + 4 cartes de vie
    expect(s.status).toBe('PLAYING');

    s = applyAction(s, { type: 'takeDamage', player: 'p2' });
    expect(s.status).toBe('FINISHED');
    expect(s.winner).toBe('p1');
    expect(s.winReason).toContain('sans carte de vie');
  });

  it('deck-out : piocher deck vide fait gagner l’adversaire', () => {
    let s = started();
    while (s.players.p1.deck.length > 0) s = applyAction(s, { type: 'draw', player: 'p1' });
    expect(s.status).toBe('PLAYING');
    s = applyAction(s, { type: 'draw', player: 'p1' });
    expect(s.status).toBe('FINISHED');
    expect(s.winner).toBe('p2');
  });

  it('concession', () => {
    const s = applyAction(started(), { type: 'concede', player: 'p1' });
    expect(s.winner).toBe('p2');
    expect(s.winReason).toContain('concède');
  });

  it('aucune action après la fin', () => {
    const s = applyAction(started(), { type: 'concede', player: 'p1' });
    expect(() => applyAction(s, { type: 'endTurn' })).toThrow(EngineError);
  });
});

describe('parité de replay (clé de voûte Phase 3)', () => {
  it('rejouer (seed, decks, actions) reproduit un état strictement identique', () => {
    const actions: GameAction[] = [
      { type: 'mulligan', player: 'p1', mulligan: true },
      { type: 'mulligan', player: 'p2', mulligan: false },
      { type: 'endTurn' },
      { type: 'takeDamage', player: 'p1' },
      { type: 'endTurn' },
      { type: 'draw', player: 'p1' },
      { type: 'takeDamage', player: 'p2' },
      { type: 'endTurn' },
    ];
    const run = () => {
      let s = createGame(config(1234));
      for (const a of actions) s = applyAction(s, a);
      return s;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

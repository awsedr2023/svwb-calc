import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bestPlan,
  calculateAll,
  calculateScenario,
  choose,
  ComplexityError,
  DEFAULT_CONFIG,
  hands,
  initialDistribution,
  selectAction,
  validateConfig,
} from '../src/engine';
import type { Config } from '../src/types';

const base = (overrides: Partial<Config> = {}): Config => ({
  target: { cost: 3, copies: 3 },
  turn: 5,
  extra: 'greedy',
  sources: [],
  ...overrides,
});
const close = (a: number, b: number, tolerance = 1e-11) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('hypergeometric hands conserve probability and count', () => {
  for (const deck of [
    [3, 3, 34],
    [1, 2, 3, 3, 31],
    [3, 37],
  ]) {
    const outcomes = hands(deck, 4);
    close(
      outcomes.reduce((p, h) => p + h.probability, 0),
      1,
    );
    for (const h of outcomes)
      assert.equal(
        h.hand.reduce((a, b) => a + b, 0),
        4,
      );
  }
});

test('mulligan excludes physical exchanged cards, restores them before play', () => {
  const config = base();
  const opening = initialDistribution(config, false);
  const missBoth =
    ((choose(37, 4) / choose(40, 4)) * choose(33, 4)) / choose(36, 4);
  close(opening.success, 1 - missBoth);
  close(
    opening.states.reduce((p, s) => p + s.probability, opening.success),
    1,
  );
  for (const state of opening.states) {
    assert.equal(
      state.deck.reduce((a, b) => a + b, 0),
      36,
    );
    assert.equal(state.deck[0], 3);
  }
});

test('without sources matches closed form for 1..3 target copies and every horizon', () => {
  for (let copies = 1; copies <= 3; copies++) {
    const result = calculateAll(base({ target: { cost: 0, copies } }));
    const missOpening =
      ((choose(40 - copies, 4) / choose(40, 4)) * choose(36 - copies, 4)) /
      choose(36, 4);
    for (const row of result.rows) {
      const expected =
        1 -
        (missOpening * choose(36 - copies, row.turn)) / choose(36, row.turn);
      for (const key of [
        'frontKeep',
        'backKeep',
        'frontExchange',
        'backExchange',
      ] as const)
        close(row[key], expected);
    }
  }
});

test('extra PP makes a 6PP target playable on turn 5 only going second', () => {
  const config = base({ target: { cost: 6, copies: 3 } });
  assert.equal(calculateScenario(config).probability, 0);
  close(
    calculateScenario(config, { back: true }).probability,
    calculateScenario(base()).probability,
  );
  assert.equal(
    calculateScenario(config, { back: true, horizon: 4 }).probability,
    0,
  );
});

test('knapsack prefers greatest total draws, not a single best-ratio card', () => {
  const sources = [
    { cost: 3, draw: 4, copies: 1, keep: 3 },
    { cost: 2, draw: 2, copies: 2, keep: 3 },
  ];
  assert.deepEqual(bestPlan(sources, [0, 1, 2, 0], 4), {
    draw: 4,
    cost: 3,
    first: 0,
  });
  assert.deepEqual(bestPlan(sources, [0, 1, 2, 0], 5), {
    draw: 6,
    cost: 5,
    first: 1,
  });
});

test('extra PP is spent only when useful, can be reserved and is never reused', () => {
  const config = base({
    sources: [{ cost: 2, draw: 2, copies: 3, keep: 3 }],
  });
  const hand = [0, 2, 2];
  assert.deepEqual(selectAction(config, hand, 1, 5, 1, true), {
    source: 0,
    activate: true,
  });
  assert.deepEqual(selectAction(config, hand, 1, 5, 1, false), {
    source: -1,
    activate: false,
  });
  assert.deepEqual(
    selectAction({ ...config, extra: 'reserve' }, hand, 1, 5, 1, true),
    { source: -1, activate: false },
  );
  assert.deepEqual(selectAction(config, hand, 2, 5, 2, true), {
    source: 0,
    activate: false,
  });
  // 5PP - target's 3PP leaves 2: +1 does not enable a second 2PP source.
  assert.deepEqual(selectAction(config, hand, 5, 5, 5, true), {
    source: 0,
    activate: false,
  });
  const expensiveTarget = { ...config, target: { cost: 6, copies: 3 } };
  assert.deepEqual(selectAction(expensiveTarget, hand, 1, 5, 1, true), {
    source: -1,
    activate: false,
  });
  assert.deepEqual(selectAction(expensiveTarget, hand, 5, 5, 5, true), {
    source: -1,
    activate: true,
  });
});

test('zero-cost chains terminate and hand sizes above 9 do not burn the target', () => {
  const config = base({
    target: { copies: 1, cost: 0 },
    sources: [{ cost: 0, draw: 5, copies: 3, keep: 3 }],
  });
  // An artificial conditioned opening isolates the in-play engine: 9 inert cards
  // plus a zero-cost source. The natural draw must still enter hand as a target.
  const initial = {
    success: 0,
    states: [{ probability: 1, deck: [1, 0, 0], hand: [0, 1, 9] }],
  };
  close(calculateScenario(config, { horizon: 1, initial }).probability, 1);
  assert.ok(
    calculateScenario(config).probability >
      calculateScenario(base({ target: config.target })).probability,
  );
});

test('newly drawn sources can be played in the same turn', () => {
  const config = base({
    target: { copies: 1, cost: 0 },
    sources: [{ cost: 0, draw: 1, copies: 3, keep: 3 }],
  });
  const initial = {
    success: 0,
    states: [{ probability: 1, deck: [1, 2, 0], hand: [0, 0, 4] }],
  };
  close(calculateScenario(config, { horizon: 1, initial }).probability, 1);
});

test('target PP is reserved on the goal turn and extra PP is carried across turns', () => {
  const config = base({
    target: { copies: 1, cost: 1 },
    turn: 1,
    sources: [{ cost: 1, draw: 1, copies: 1, keep: 3 }],
  });
  const initial = {
    success: 0,
    states: [{ probability: 1, deck: [1, 0, 1], hand: [0, 1, 3] }],
  };
  close(calculateScenario(config, { initial }).probability, 0.5);
  close(calculateScenario(config, { initial, back: true }).probability, 1);
});

test('deck-out during a draw effect fails even if a target would be drawn', () => {
  const config = base({
    target: { copies: 1, cost: 0 },
    sources: [{ cost: 0, draw: 5, copies: 1, keep: 3 }],
    turn: 1,
  });
  const initial = {
    success: 0,
    states: [{ probability: 1, deck: [1, 0, 1], hand: [0, 1, 3] }],
  };
  close(calculateScenario(config, { initial }).probability, 0.5);
});

test('unchecked sources make the two mulligan policies identical', () => {
  const result = calculateAll(
    base({ sources: [{ cost: 1, draw: 2, copies: 3, keep: 0 }] }),
  );
  for (const row of result.rows) {
    close(row.frontKeep, row.frontExchange);
    close(row.backKeep, row.backExchange);
  }
});

test('invalid configurations and excessive state growth report errors', () => {
  for (const value of [
    null,
    {},
    { ...DEFAULT_CONFIG, turn: 6 },
    { ...DEFAULT_CONFIG, target: { copies: 41, cost: 3 } },
    {
      ...DEFAULT_CONFIG,
      sources: [{ cost: -1, draw: 2, copies: 3, keep: 3 }],
    },
  ])
    assert.throws(() => validateConfig(value));
  assert.throws(
    () => calculateScenario(DEFAULT_CONFIG, { maxStates: 1 }),
    ComplexityError,
  );
});

test('disabled sources become inert cards, including during mulligan, without changing settings', () => {
  const disabled = { cost: 0, draw: 5, copies: 3, keep: 3, enabled: false };
  const active = { cost: 2, draw: 2, copies: 2, keep: 3 };
  const config = base({
    sources: [disabled, active, { ...disabled, cost: 1 }],
  });
  const original = structuredClone(config);
  assert.deepEqual(
    calculateAll(config).rows,
    calculateAll(base({ sources: [active] })).rows,
  );
  assert.deepEqual(config, original);
  assert.deepEqual(
    calculateAll(base({ sources: [disabled] })).rows,
    calculateAll(base()).rows,
  );
  const legacy = base({ sources: [active] });
  assert.deepEqual(
    calculateAll(legacy).rows,
    calculateAll(base({ sources: [{ ...active, enabled: true }] })).rows,
  );
  assert.throws(() =>
    validateConfig(
      base({
        sources: [{ ...disabled, enabled: 'false' as unknown as boolean }],
      }),
    ),
  );
});

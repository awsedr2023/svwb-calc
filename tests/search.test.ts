import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAll,
  calculateScenario,
  initialDistribution,
  selectAction,
  validateConfig,
} from '../src/engine';
import { removeSource, removeSearchOther } from '../src/storage';
import type { Config, DrawSource } from '../src/types';

const search = (draw: number): DrawSource => ({
  kind: 'search',
  copies: 1,
  cost: 0,
  draw,
  keep: 1,
  search: { target: true, sources: [], others: [0] },
});
const base: Config = {
  target: { copies: 1, cost: 0 },
  turn: 1,
  extra: 'greedy',
  sources: [search(1)],
  searchOthers: [2],
};
const initial = {
  success: 0,
  states: [{ probability: 1, deck: [1, 0, 2, 1], hand: [0, 1, 0, 3] }],
};
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-11, `${a} != ${b}`);

test('search candidates decrease after a normal draw; search n cards without replacement', () => {
  // Natural target: 1/4. Natural other candidate: 2/4, then 1/2 hit.
  // Natural noncandidate: 1/4, then 1/3 hit. Total 7/12, not 1/2.
  close(calculateScenario(base, { initial }).probability, 7 / 12);
  close(
    calculateScenario({ ...base, sources: [search(2)] }, { initial })
      .probability,
    11 / 12,
  );
  // More requested than available: add the remaining candidates, no deck-out.
  close(
    calculateScenario({ ...base, sources: [search(40)] }, { initial })
      .probability,
    1,
  );
});

test('type search excludes selected names only within the current effect', () => {
  const typed = (n: number): DrawSource => ({
    ...search(n),
    search: { ...search(n).search!, unit: 'types' },
  });
  close(
    calculateScenario({ ...base, sources: [typed(1)] }, { initial })
      .probability,
    7 / 12,
  );
  for (const n of [2, 40])
    close(
      calculateScenario({ ...base, sources: [typed(n)] }, { initial })
        .probability,
      1,
    );
  close(
    calculateScenario(
      { ...base, sources: [typed(1), typed(1)] },
      {
        initial: {
          success: 0,
          states: [
            { probability: 1, deck: [1, 0, 0, 2, 1], hand: [0, 1, 1, 0, 2] },
          ],
        },
      },
    ).probability,
    11 / 12,
  );
  close(
    calculateScenario(
      {
        ...base,
        turn: 2,
        sources: [
          { ...typed(40), search: { ...typed(40).search!, target: false } },
        ],
      },
      { initial },
    ).probability,
    5 / 8,
  );
});

test('overlapping searches share remaining candidates', () => {
  const config = { ...base, sources: [search(1), search(1)] };
  const start = {
    success: 0,
    states: [{ probability: 1, deck: [1, 0, 0, 2, 1], hand: [0, 1, 1, 0, 2] }],
  };
  close(calculateScenario(config, { initial: start }).probability, 11 / 12);
});

test('searches can retrieve a draw source and play it in the same turn', () => {
  const config: Config = {
    ...base,
    searchOthers: [],
    sources: [
      { ...search(1), search: { target: false, sources: [1], others: [] } },
      { cost: 0, draw: 1, copies: 1, keep: 1 },
    ],
  };
  const start = {
    success: 0,
    states: [{ probability: 1, deck: [1, 0, 1, 1], hand: [0, 1, 0, 3] }],
  };
  close(calculateScenario(config, { initial: start }).probability, 5 / 6);
});

test('candidate-free searches are skipped without consuming PP or extra PP', () => {
  const config: Config = {
    ...base,
    sources: [
      {
        ...search(2),
        cost: 2,
        search: { target: false, sources: [], others: [0] },
      },
    ],
  };
  assert.deepEqual(
    selectAction(config, [0, 1, 0, 3], 1, 1, 1, true, [1, 0, 0, 10]),
    { source: -1, activate: false },
  );
});

test('searching only other cards thins the deck for later natural draws', () => {
  const config: Config = {
    ...base,
    turn: 2,
    sources: [
      { ...search(1), search: { target: false, sources: [], others: [0] } },
    ],
  };
  close(calculateScenario(config, { initial }).probability, 5 / 8);
});

test('a search pays PP and preserves target PP on the goal turn', () => {
  const config: Config = {
    ...base,
    target: { copies: 1, cost: 1 },
    sources: [{ ...search(1), cost: 1 }],
  };
  close(calculateScenario(config, { initial }).probability, 1 / 4);
  close(calculateScenario(config, { initial, back: true }).probability, 7 / 12);
});

test('search groups enter the opening distribution with conserved mass and a 40-card deck', () => {
  const opening = initialDistribution(base, true);
  close(
    opening.success + opening.states.reduce((n, s) => n + s.probability, 0),
    1,
  );
  for (const state of opening.states) {
    assert.equal(
      state.deck.reduce((n, c) => n + c, 0),
      36,
    );
    assert.equal(state.deck[2] + state.hand[2], 2);
  }
});

test('disabled and removed sources remap search membership without changing candidates', () => {
  const config: Config = {
    ...base,
    sources: [
      { cost: 1, draw: 1, copies: 3, keep: 1 },
      { cost: 1, draw: 1, copies: 3, keep: 1, enabled: false },
      {
        ...search(2),
        search: { target: true, sources: [0, 1, 2], others: [0] },
      },
    ],
  };
  const removed = removeSource(config, 1);
  assert.deepEqual(removed.sources[1].search?.sources, [0, 1]);
  assert.deepEqual(calculateAll(config).rows, calculateAll(removed).rows);
  const withOthers: Config = {
    ...base,
    searchOthers: [2, 3, 4],
    sources: [
      {
        ...search(2),
        search: { target: true, sources: [], others: [0, 1, 2] },
      },
    ],
  };
  const updated = removeSearchOther(withOthers, 1);
  assert.deepEqual(updated.searchOthers, [2, 4]);
  assert.deepEqual(updated.sources[0].search?.others, [0, 1]);
});

test('invalid search references and candidate deck overflow are rejected', () => {
  assert.throws(
    () => validateConfig({ ...base, searchOthers: [39] }),
    /合計40枚/,
  );
  for (const bad of [
    { target: true, sources: [1], others: [] },
    { target: true, sources: [], others: [1] },
    { target: true, sources: [], others: [0, 0] },
  ])
    assert.throws(() =>
      validateConfig({ ...base, sources: [{ ...search(1), search: bad }] }),
    );
});

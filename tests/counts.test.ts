import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAll,
  calculateScenario,
  choose,
  initialDistribution,
  validateConfig,
} from '../src/engine';
import { migrateConfig } from '../src/storage';
import type { Config } from '../src/types';

const config: Config = {
  target: { copies: 3, cost: 3 },
  turn: 5,
  extra: 'greedy',
  sources: [{ copies: 12, cost: 2, draw: 2, keep: 1 }],
};

test('retention caps match independent opening-hand probability for 12 equivalent cards', () => {
  for (let cap = 0; cap <= 3; cap++) {
    const c = { ...config, sources: [{ ...config.sources[0], keep: cap }] };
    validateConfig(c);
    let miss = 0;
    for (let sourcesInHand = 0; sourcesInHand <= 4; sourcesInHand++) {
      const first =
        (choose(12, sourcesInHand) * choose(25, 4 - sourcesInHand)) /
        choose(40, 4);
      const replacementCount = 4 - Math.min(sourcesInHand, cap);
      miss +=
        (first * choose(33, replacementCount)) / choose(36, replacementCount);
    }
    const opening = initialDistribution(c, true);
    assert.ok(Math.abs(opening.success - (1 - miss)) < 1e-12);
    assert.ok(
      Math.abs(
        opening.success +
          opening.states.reduce((n, s) => n + s.probability, 0) -
          1,
      ) < 1e-12,
    );
  }
  const zeroKeep = calculateAll({
    ...config,
    sources: [{ ...config.sources[0], keep: 0 }],
  });
  for (const row of zeroKeep.rows) {
    assert.equal(row.frontKeep, row.frontExchange);
    assert.equal(row.backKeep, row.backExchange);
  }
});

test('different retention caps match an independent sequential mulligan distribution', () => {
  const c: Config = {
    ...config,
    sources: [
      { copies: 3, cost: 1, draw: 1, keep: 1 },
      { copies: 3, cost: 2, draw: 2, keep: 2 },
    ],
  };
  validateConfig(c);
  const original = [3, 3, 3, 31];
  for (const keep of [false, true]) {
    let success = 0;
    const expected = new Map<string, number>();
    // Ordered sequential draws, not the engine's combinatorial hand generator.
    function draw(
      deck: number[],
      hand: number[],
      left: number,
      p: number,
      done: (deck: number[], hand: number[], p: number) => void,
    ) {
      if (!left) {
        done(deck, hand, p);
        return;
      }
      const size = deck.reduce((n, x) => n + x, 0);
      for (let i = 0; i < deck.length; i++)
        if (deck[i]) {
          const d = [...deck],
            h = [...hand];
          d[i]--;
          h[i]++;
          draw(d, h, left - 1, (p * deck[i]) / size, done);
        }
    }
    draw(original, [0, 0, 0, 0], 4, 1, (excludedDeck, first, p) => {
      if (first[0]) {
        success += p;
        return;
      }
      const kept = [
        0,
        keep ? Math.min(first[1], 1) : 0,
        keep ? Math.min(first[2], 2) : 0,
        0,
      ];
      draw(
        excludedDeck,
        [0, 0, 0, 0],
        4 - kept[1] - kept[2],
        p,
        (_, replacement, q) => {
          if (replacement[0]) {
            success += q;
            return;
          }
          const hand = kept.map((n, i) => n + replacement[i]);
          const key = hand.join(',');
          expected.set(key, (expected.get(key) ?? 0) + q);
        },
      );
    });
    const actual = initialDistribution(c, keep);
    assert.ok(Math.abs(actual.success - success) < 1e-11);
    assert.equal(actual.states.length, expected.size);
    for (const state of actual.states) {
      assert.ok(
        Math.abs(
          state.probability - (expected.get(state.hand.join(',')) ?? -1),
        ) < 1e-11,
      );
      assert.deepEqual(
        state.deck,
        original.map((n, i) => n - state.hand[i]),
      );
    }
  }
});

test('40-copy boundaries, deck totals, and high-copy zero-cost chains', () => {
  const allTargets: Config = {
    ...config,
    target: { copies: 40, cost: 0 },
    sources: [],
  };
  for (const row of calculateAll(allTargets).rows)
    assert.equal(row.frontKeep, 1);
  const chain: Config = {
    ...config,
    target: { copies: 1, cost: 0 },
    turn: 1,
    sources: [{ copies: 39, cost: 0, draw: 1, keep: 3 }],
  };
  assert.ok(Math.abs(calculateScenario(chain).probability - 1) < 1e-12);
  assert.doesNotThrow(() =>
    validateConfig({
      ...config,
      sources: [{ ...config.sources[0], copies: 37 }],
    }),
  );
  assert.throws(
    () =>
      validateConfig({
        ...config,
        sources: [{ ...config.sources[0], copies: 38 }],
      }),
    /合計40枚/,
  );
  assert.doesNotThrow(() =>
    validateConfig({
      ...allTargets,
      sources: [{ ...config.sources[0], copies: 40, enabled: false }],
    }),
  );
  for (const keep of [-1, 4, 5, 1.5])
    assert.throws(() =>
      validateConfig({ ...config, sources: [{ ...config.sources[0], keep }] }),
    );
});

test('old boolean keep settings migrate without dropping the saved deck', () => {
  const legacy = {
    ...config,
    sources: [
      { ...config.sources[0], keep: true },
      { ...config.sources[0], keep: false, enabled: false },
    ],
  };
  const migrated = migrateConfig(legacy);
  assert.deepEqual(
    migrated.sources.map((s) => s.keep),
    [3, 0],
  );
  assert.equal(migrated.sources[0].copies, 12);
  assert.equal(migrated.sources[1].enabled, false);
  assert.deepEqual(migrateConfig(config), config);
  assert.equal(
    migrateConfig({ ...config, sources: [{ ...config.sources[0], keep: 4 }] })
      .sources[0].keep,
    3,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAll,
  calculateScenario,
  ComplexityError,
  DEFAULT_CONFIG,
} from '../src/engine';
import { calculationKey, migrateConfig } from '../src/storage';
import type { Config } from '../src/types';

// Independent tiny-deck oracle: physical cards, no memoization, no production
// planning/search helpers, no target-found shortcut. Max is outside each
// random draw's expectation: the player never observes an unseen deck order.
function oracle(
  c: Config,
  deck: number[],
  hand: number[],
  back: boolean,
): number {
  function step(
    d: number[],
    h: number[],
    t: number,
    pp: number,
    extra: boolean,
  ): number {
    if (t === c.turn && h.includes(0))
      return Number(pp + Number(extra) >= c.target.cost);
    let best = t < c.turn ? draw(d, h, t + 1, t + 1, extra, 1) : 0;
    if (h.includes(0)) return best;
    for (let pos = 0; pos < h.length; pos++) {
      const type = h[pos],
        s = c.sources[type - 1];
      if (type === 0 || !s) continue;
      for (const spend of [false, true]) {
        if (spend && !extra) continue;
        const left = pp + Number(spend) - s.cost;
        if (left < 0) continue;
        const next = h.filter((_, i) => i !== pos);
        best = Math.max(
          best,
          draw(
            d,
            next,
            t,
            left,
            extra && !spend,
            s.draw,
            s.kind === 'search' ? type - 1 : -1,
          ),
        );
      }
    }
    return best;
  }
  function draw(
    d: number[],
    h: number[],
    t: number,
    pp: number,
    extra: boolean,
    n: number,
    search = -1,
    seen: number[] = [],
  ): number {
    if (!n) return step(d, h, t, pp, extra);
    const spec = c.sources[search]?.search;
    const pool = d
      .map((type, pos) => ({ type, pos }))
      .filter(
        ({ type }) =>
          !spec ||
          (!(spec.unit === 'types' && seen.includes(type)) &&
            (type === 0
              ? spec.target
              : type <= c.sources.length
                ? spec.sources.includes(type - 1)
                : spec.others.includes(type - c.sources.length - 1))),
      );
    if (!pool.length) return spec ? step(d, h, t, pp, extra) : 0;
    return pool.reduce(
      (sum, { type, pos }) =>
        sum +
        draw(
          d.filter((_, i) => i !== pos),
          [...h, type],
          t,
          pp,
          extra,
          n - 1,
          search,
          [...seen, type],
        ) /
          pool.length,
      0,
    );
  }
  return draw(deck, hand, 1, 1, back, 1);
}

function exact(
  c: Config,
  deck: number[],
  hand: number[],
  back = false,
  pruning?: import('../src/engine').Limits['pruning'],
) {
  const counts = (cards: number[]) =>
    Array.from(
      { length: c.sources.length + (c.searchOthers?.length ?? 0) + 2 },
      (_, type) => cards.filter((x) => x === type).length,
    );
  return calculateScenario(c, {
    pruning,
    back,
    initial: {
      success: 0,
      states: [{ deck: counts(deck), hand: counts(hand), probability: 1 }],
    },
  }).probability;
}
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-11, `${a} != ${b}`);

test('optimal defaults and legacy policies stay distinguishable and persisted', () => {
  assert.equal(
    calculationKey(DEFAULT_CONFIG),
    calculationKey({ ...DEFAULT_CONFIG, maxStates: 400000 }),
  );
  assert.notEqual(
    calculationKey(DEFAULT_CONFIG),
    calculationKey({ ...DEFAULT_CONFIG, maxStates: 500000 }),
  );
  assert.equal(
    migrateConfig({ ...DEFAULT_CONFIG, maxStates: 2000000 }).maxStates,
    2000000,
  );
  for (const maxStates of [0, 99999, 2000001, 100000.5, NaN])
    assert.throws(() => migrateConfig({ ...DEFAULT_CONFIG, maxStates }));
  assert.equal(DEFAULT_CONFIG.extra, 'optimal');
  assert.equal(migrateConfig(DEFAULT_CONFIG).extra, 'optimal');
  assert.equal(
    migrateConfig({ ...DEFAULT_CONFIG, extra: 'greedy' }).extra,
    'greedy',
  );
  assert.notEqual(
    calculationKey(DEFAULT_CONFIG),
    calculationKey({ ...DEFAULT_CONFIG, extra: 'greedy' }),
  );
});

test('optimal preserves extra PP for target and matches natural-draw formulas through turn five', () => {
  for (const cost of [0, 3, 6]) {
    const config = {
      ...DEFAULT_CONFIG,
      target: { copies: 3, cost },
      sources: [],
    };
    const expected = calculateAll({ ...config, extra: 'greedy' });
    assert.deepEqual(calculateAll(config).rows, expected.rows);
  }
  const c: Config = {
    target: { copies: 1, cost: 3 },
    turn: 2,
    extra: 'optimal',
    sources: [{ cost: 2, draw: 2, copies: 1, keep: 0 }],
  };
  close(exact(c, [0, 2, 2, 2, 2, 2], [1], true), 1 / 3);
  close(
    exact(c, [0, 2, 2, 2, 2, 2], [1], true),
    oracle(c, [0, 2, 2, 2, 2, 2], [1], true),
  );
});

test('search hit probability, not acquisition count, determines best action', () => {
  const c: Config = {
    target: { copies: 1, cost: 0 },
    turn: 1,
    extra: 'optimal',
    searchOthers: [4],
    sources: [
      { cost: 1, draw: 2, copies: 1, keep: 0 },
      {
        kind: 'search',
        cost: 1,
        draw: 1,
        copies: 1,
        keep: 0,
        search: { target: true, sources: [], others: [] },
      },
    ],
  };
  const deck = [0, 3, 3, 3, 3, 4];
  close(exact(c, deck, [1, 2]), 1);
  close(exact({ ...c, extra: 'greedy' }, deck, [1, 2]), 0.5);
  const uncertain = {
    ...c,
    sources: [
      c.sources[0],
      { ...c.sources[1], search: { target: true, sources: [], others: [0] } },
    ],
  };
  // Broad search only hits 1 of 4/5 candidates after the natural draw;
  // two normal draws give a better result. Search is not always preferred.
  close(exact(uncertain, deck, [1, 2]), 0.5);
  close(exact(uncertain, deck, [1, 2]), oracle(uncertain, deck, [1, 2], false));
});

test('optimal agrees with independent physical-card expectimax across mixed searches (192 scenarios)', () => {
  let cases = 0;
  for (const unit of ['cards', 'types'] as const)
    for (const back of [false, true])
      for (const cost of [0, 1, 2])
        for (const turn of [1, 2])
          for (const draw of [1, 2])
            for (const sourceCost of [0, 1])
              for (const target of [false, true]) {
                const c: Config = {
                  target: { copies: 1, cost },
                  turn,
                  extra: 'optimal',
                  searchOthers: [2],
                  sources: [
                    { cost: sourceCost, draw, copies: 2, keep: 0 },
                    {
                      cost: 1,
                      draw: 2,
                      copies: 2,
                      keep: 0,
                      kind: 'search',
                      search: { target, sources: [0, 1], others: [0], unit },
                    },
                  ],
                };
                const deck = [0, 1, 2, 3, 3, 4],
                  hand = [1, 2];
                const expected = oracle(c, deck, hand, back);
                for (const pruning of [
                  false,
                  {},
                  { extraPP: false },
                  { terminalPP: false },
                  { ordering: false },
                  { bounds: false },
                ] as const)
                  close(exact(c, deck, hand, back, pruning), expected);
                cases++;
              }
  assert.equal(cases, 192);
});

test('optimal can avoid lethal draw and beats both legacy policies on full decks', () => {
  const tiny: Config = {
    target: { copies: 1, cost: 0 },
    turn: 2,
    extra: 'optimal',
    sources: [{ cost: 0, draw: 5, copies: 1, keep: 0 }],
  };
  close(exact(tiny, [0, 2, 2], [1]), 2 / 3);
  close(exact({ ...tiny, extra: 'greedy' }, [0, 2, 2], [1]), 1 / 3);
  const c: Config = {
    ...DEFAULT_CONFIG,
    searchOthers: [3],
    sources: [
      { cost: 1, draw: 2, copies: 2, keep: 1 },
      {
        kind: 'search',
        cost: 2,
        draw: 1,
        copies: 2,
        keep: 1,
        search: { target: true, sources: [0], others: [0], unit: 'types' },
      },
    ],
  };
  const best = calculateAll(c);
  for (const extra of ['greedy', 'reserve'] as const) {
    const old = calculateAll({ ...c, extra });
    best.rows.forEach((row, i) => {
      for (const key of [
        'frontKeep',
        'frontExchange',
        'backKeep',
        'backExchange',
      ] as const)
        assert.ok(row[key] + 1e-11 >= old.rows[i][key]);
    });
  }
  assert.throws(
    () => calculateAll(c, undefined, { maxStates: 1 }),
    ComplexityError,
  );
});

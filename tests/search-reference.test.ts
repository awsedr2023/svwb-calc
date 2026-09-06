import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenario, selectAction } from '../src/engine';
import type { Config } from '../src/types';

// Independent oracle: arrays of physical cards, exhaustive hand subsets and
// individual-card random branches. No production planning/distribution helpers,
// memoization, early-success shortcut, or selected-type bit masks.
function reference(
  c: Config,
  initialDeck: number[],
  initialHand: number[],
  back: boolean,
): number {
  function candidates(source: number, deck: number[]) {
    const s = c.sources[source - 1].search!;
    return deck
      .map((type, index) => ({ type, index }))
      .filter(({ type }) =>
        type === 0
          ? s.target
          : type <= c.sources.length
            ? s.sources.includes(type - 1)
            : s.others.includes(type - c.sources.length - 1),
      );
  }
  function action(
    deck: number[],
    hand: number[],
    turn: number,
    pp: number,
    extra: boolean,
  ) {
    const amount = (type: number) => {
      const s = c.sources[type - 1];
      if (s.kind !== 'search') return s.draw;
      const pool = candidates(type, deck);
      return Math.min(
        s.draw,
        s.search?.unit === 'types'
          ? new Set(pool.map((x) => x.type)).size
          : pool.length,
      );
    };
    const held = hand
      .filter((t) => t > 0 && t <= c.sources.length && amount(t) > 0)
      .sort(
        (a, b) =>
          c.sources[a - 1].cost - c.sources[b - 1].cost ||
          amount(b) - amount(a) ||
          a - b,
      );
    function plan(budget: number) {
      let best = { count: 0, cost: 0, sequence: [] as number[] };
      for (let mask = 2 ** held.length - 1; mask >= 0; mask--) {
        const sequence = held.filter(
          (_, i) => mask & (1 << (held.length - 1 - i)),
        );
        const cost = sequence.reduce((n, t) => n + c.sources[t - 1].cost, 0);
        const count = sequence.reduce((n, t) => n + amount(t), 0);
        if (
          cost <= budget &&
          (count > best.count || (count === best.count && cost < best.cost))
        )
          best = { count, cost, sequence };
      }
      return best;
    }
    const reserved = turn === c.turn ? c.target.cost : 0;
    const normal = plan(pp - reserved);
    const allowed =
      extra &&
      (turn === c.turn || (c.extra === 'greedy' && c.target.cost <= c.turn));
    const boosted = plan(pp + 1 - reserved);
    const activate =
      allowed &&
      (boosted.count > normal.count ||
        (turn === c.turn && pp < reserved && pp + 1 >= reserved));
    return { type: (activate ? boosted : normal).sequence[0], activate };
  }
  function play(
    deck: number[],
    hand: number[],
    turn: number,
    pp: number,
    extra: boolean,
  ): number {
    if (!hand.includes(0)) {
      const a = action(deck, hand, turn, pp, extra);
      if (a.activate) {
        pp++;
        extra = false;
      }
      if (a.type !== undefined) {
        const next = [...hand];
        next.splice(next.indexOf(a.type), 1);
        const s = c.sources[a.type - 1];
        return effect(
          deck,
          next,
          turn,
          pp - s.cost,
          extra,
          s.draw,
          s.kind === 'search' ? a.type : undefined,
          [],
        );
      }
    }
    if (turn === c.turn)
      return Number(hand.includes(0) && pp + Number(extra) >= c.target.cost);
    return effect(deck, hand, turn + 1, turn + 1, extra, 1, undefined, []);
  }
  function effect(
    deck: number[],
    hand: number[],
    turn: number,
    pp: number,
    extra: boolean,
    left: number,
    source: number | undefined,
    selected: number[],
  ): number {
    if (!left) return play(deck, hand, turn, pp, extra);
    const pool =
      source === undefined
        ? deck.map((type, index) => ({ type, index }))
        : candidates(source, deck).filter((x) => !selected.includes(x.type));
    if (!pool.length)
      return source === undefined ? 0 : play(deck, hand, turn, pp, extra);
    let result = 0;
    for (const { type, index } of pool) {
      const remaining = deck.filter((_, i) => i !== index);
      const excluded =
        source !== undefined && c.sources[source - 1].search?.unit === 'types'
          ? [...selected, type]
          : [];
      result +=
        effect(
          remaining,
          [...hand, type],
          turn,
          pp,
          extra,
          left - 1,
          source,
          excluded,
        ) / pool.length;
    }
    return result;
  }
  return effect(initialDeck, initialHand, 1, 1, back, 1, undefined, []);
}

function compare(c: Config, deck: number[], hand: number[], back: boolean) {
  const count = (cards: number[]) =>
    Array.from(
      { length: c.sources.length + (c.searchOthers?.length ?? 0) + 2 },
      (_, t) => cards.filter((x) => x === t).length,
    );
  const expected = reference(c, deck, hand, back);
  const actual = calculateScenario(c, {
    back,
    initial: {
      success: 0,
      states: [{ probability: 1, deck: count(deck), hand: count(hand) }],
    },
  }).probability;
  assert.ok(
    Math.abs(actual - expected) < 1e-11,
    JSON.stringify({ c, deck, hand, back, actual, expected }),
  );
  return actual;
}

test('mixed draw/card/type search chains match independent physical-card enumeration (240 scenarios)', () => {
  for (const unit of ['cards', 'types'] as const)
    for (const extra of ['greedy', 'reserve'] as const)
      for (const back of [false, true])
        for (const turn of [1, 2, 3, 4, 5])
          for (const cost of [0, 2, 6])
            for (const searchCost of [0, 2]) {
              const c: Config = {
                target: { copies: 1, cost },
                turn,
                extra,
                searchOthers: [2],
                sources: [
                  { cost: 0, draw: 1, copies: 2, keep: 1 },
                  {
                    kind: 'search',
                    cost: searchCost,
                    draw: 2,
                    copies: 2,
                    keep: 1,
                    search: {
                      target: true,
                      sources: [0, 2],
                      others: [0],
                      unit,
                    },
                  },
                  {
                    kind: 'search',
                    cost: 1,
                    draw: 2,
                    copies: 2,
                    keep: 1,
                    search: {
                      target: false,
                      sources: [0, 1, 2],
                      others: [0],
                      unit: unit === 'cards' ? 'types' : 'cards',
                    },
                  },
                ],
              };
              compare(c, [0, 1, 2, 3, 4, 4, 5], [1, 2, 3, 5], back);
            }
});

test('two-type search resets exclusions for a following search and natural draws', () => {
  for (const unit of ['cards', 'types'] as const) {
    const c: Config = {
      target: { copies: 1, cost: 0 },
      turn: 2,
      extra: 'greedy',
      searchOthers: [2, 2],
      sources: [
        {
          kind: 'search',
          copies: 2,
          cost: 0,
          draw: 2,
          keep: 1,
          search: { target: false, sources: [], others: [0, 1], unit: 'types' },
        },
        {
          kind: 'search',
          copies: 1,
          cost: 0,
          draw: 1,
          keep: 1,
          search: { target: true, sources: [], others: [0, 1], unit },
        },
      ],
    };
    // First source is held twice: same names must be eligible again on replay.
    const value = compare(c, [0, 3, 3, 4, 4, 5, 5], [1, 1, 2, 5], false);
    assert.ok(value > 0 && value < 1);
  }
});

test('search capacity controls extra PP activation, including cards versus types', () => {
  const c: Config = {
    target: { copies: 1, cost: 0 },
    turn: 5,
    extra: 'greedy',
    searchOthers: [3],
    sources: [
      { cost: 1, draw: 1, copies: 1, keep: 1 },
      {
        kind: 'search',
        cost: 2,
        draw: 3,
        copies: 1,
        keep: 1,
        search: { target: false, sources: [], others: [0], unit: 'cards' },
      },
    ],
  };
  const hand = [0, 1, 1, 0, 2];
  assert.deepEqual(selectAction(c, hand, 1, 5, 1, true, [1, 0, 0, 3, 10]), {
    source: 1,
    activate: true,
  });
  assert.deepEqual(selectAction(c, hand, 1, 5, 1, true, [1, 0, 0, 1, 10]), {
    source: 0,
    activate: false,
  });
  c.sources[1].search!.unit = 'types';
  assert.deepEqual(selectAction(c, hand, 1, 5, 1, true, [1, 0, 0, 3, 10]), {
    source: 0,
    activate: false,
  });
});

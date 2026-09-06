import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScenario } from '../src/engine';
import type { Config } from '../src/types';

// Independent, deliberately slow oracle: enumerate physical deck permutations
// and execute each game. No engine helpers, memo keys, or hypergeometric code.
function* permutations(items: number[]): Generator<number[]> {
  if (!items.length) {
    yield [];
    return;
  }
  for (let i = 0; i < items.length; i++)
    for (const rest of permutations(items.filter((_, j) => i !== j)))
      yield [items[i], ...rest];
}

function play(
  config: Config,
  order: number[],
  initialHand: number[],
  horizon: number,
  back: boolean,
): number {
  const hand = [...initialHand];
  const deck = [...order];
  let extra = back,
    pp = 0;
  const draw = (n: number) => {
    for (let i = 0; i < n; i++) {
      const card = deck.shift();
      if (card === undefined) return false;
      hand.push(card);
    }
    return true;
  };
  function plan(budget: number) {
    let best = { draws: 0, cost: 0, sequence: [] as number[] };
    if (budget < 0) return best;
    const held = hand
      .filter((i) => i > 0 && i <= config.sources.length)
      .sort(
        (a, b) =>
          config.sources[a - 1].cost - config.sources[b - 1].cost ||
          config.sources[b - 1].draw - config.sources[a - 1].draw ||
          a - b,
      );
    // Highest bit belongs to first source, matching the documented final tie.
    for (let mask = (1 << held.length) - 1; mask >= 0; mask--) {
      const sequence = held.filter(
        (_, i) => mask & (1 << (held.length - 1 - i)),
      );
      const cost = sequence.reduce((n, i) => n + config.sources[i - 1].cost, 0);
      const draws = sequence.reduce(
        (n, i) => n + config.sources[i - 1].draw,
        0,
      );
      if (
        cost <= budget &&
        (draws > best.draws || (draws === best.draws && cost < best.cost))
      )
        best = { draws, cost, sequence };
    }
    return best;
  }
  for (let turn = 1; turn <= horizon; turn++) {
    pp = turn;
    if (!draw(1)) return 0;
    while (!hand.includes(0)) {
      const reserved = turn === horizon ? config.target.cost : 0;
      const normal = plan(pp - reserved);
      const allowed =
        extra &&
        (turn === horizon ||
          (config.extra === 'greedy' && config.target.cost <= horizon));
      const boosted = allowed ? plan(pp + 1 - reserved) : normal;
      let selected = normal;
      if (
        allowed &&
        (boosted.draws > normal.draws ||
          (turn === horizon && pp < reserved && pp + 1 >= reserved))
      ) {
        extra = false;
        pp++;
        selected = boosted;
      }
      if (!selected.sequence.length) break;
      const sourceType = selected.sequence[0];
      hand.splice(hand.indexOf(sourceType), 1);
      pp -= config.sources[sourceType - 1].cost;
      if (!draw(config.sources[sourceType - 1].draw)) return 0;
    }
  }
  return Number(hand.includes(0) && pp + Number(extra) >= config.target.cost);
}

test('memoized exact engine matches all 720 physical deck orders under PP and draw policies', () => {
  const cards = [0, 1, 1, 2, 3, 3];
  const orders = [...permutations(cards)];
  const initialHand = [2, 3, 3, 3];
  const initial = {
    success: 0,
    states: [{ probability: 1, deck: [1, 2, 1, 2], hand: [0, 0, 1, 3] }],
  };
  for (const extra of ['greedy', 'reserve'] as const)
    for (const back of [false, true])
      for (const cost of [0, 1, 3, 5, 6])
        for (const horizon of [1, 3, 5]) {
          const config: Config = {
            target: { copies: 1, cost },
            turn: horizon,
            extra,
            sources: [
              { cost: 1, draw: 2, copies: 3, keep: 3 },
              { cost: 2, draw: 3, copies: 3, keep: 3 },
            ],
          };
          const expected =
            orders.reduce(
              (n, order) => n + play(config, order, initialHand, horizon, back),
              0,
            ) / orders.length;
          const actual = calculateScenario(config, {
            initial,
            back,
          }).probability;
          assert.ok(
            Math.abs(actual - expected) < 1e-11,
            JSON.stringify({ extra, back, cost, horizon, actual, expected }),
          );
        }
});

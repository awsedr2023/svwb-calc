import { calculateScenario } from '../src/engine';
import type { Config } from '../src/types';

// Only the comparison calls the production engine. The simulator uses physical
// card arrays, its own mulligan, subset planner, and random draws/searches.
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(
  c: Config,
  back: boolean,
  keep: boolean,
  trials: number,
  seed: number,
) {
  const rng = random(seed);
  const filler = c.sources.length + 1 + (c.searchOthers?.length ?? 0);
  const original: number[] = Array(c.target.copies).fill(0);
  c.sources.forEach((s, i) =>
    original.push(...Array(s.enabled === false ? 0 : s.copies).fill(i + 1)),
  );
  (c.searchOthers ?? []).forEach((n, i) =>
    original.push(
      ...Array(c.searchOtherEnabled?.[i] === false ? 0 : n).fill(
        c.sources.length + 1 + i,
      ),
    ),
  );
  while (original.length < 40) original.push(filler);
  if (original.length !== 40)
    throw new Error('Simulator requires a 40-card deck');
  const candidate = (source: number, type: number) => {
    const s = c.sources[source - 1].search!;
    if (type === 0) return s.target;
    if (type <= c.sources.length)
      return (
        c.sources[type - 1].enabled !== false && s.sources.includes(type - 1)
      );
    return s.others.includes(type - c.sources.length - 1);
  };
  let wins = 0;
  for (let trial = 0; trial < trials; trial++) {
    const deck = [...original];
    const take = () => deck.splice(Math.floor(rng() * deck.length), 1)[0];
    let hand = Array.from({ length: 4 }, take);
    if (!hand.includes(0)) {
      const returned: number[] = [],
        retained: number[] = [];
      for (const type of hand) {
        const source =
          type > 0 && type <= c.sources.length
            ? c.sources[type - 1]
            : undefined;
        const cap =
          source?.keep ??
          (type > c.sources.length && type < filler
            ? (c.searchOtherKeeps?.[type - c.sources.length - 1] ?? 0)
            : 0);
        if (keep && retained.filter((t) => t === type).length < cap)
          retained.push(type);
        else returned.push(type);
      }
      hand = [...retained, ...Array.from({ length: returned.length }, take)];
      deck.push(...returned);
    }
    let extra = back,
      pp = 0,
      alive = true;
    for (let turn = 1; turn <= c.turn && alive; turn++) {
      pp = turn;
      if (!deck.length) {
        alive = false;
        break;
      }
      hand.push(take());
      while (!hand.includes(0)) {
        const amount = (type: number) => {
          const s = c.sources[type - 1];
          if (s.kind !== 'search') return s.draw;
          const pool = deck.filter((t) => candidate(type, t));
          return Math.min(
            s.draw,
            s.search?.unit === 'types' ? new Set(pool).size : pool.length,
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
          let best = { draw: 0, cost: 0, first: 0 };
          function visit(i: number, cost: number, draw: number, first: number) {
            if (cost > budget) return;
            if (i === held.length) {
              if (draw > best.draw || (draw === best.draw && cost < best.cost))
                best = { draw, cost, first };
              return;
            }
            const t = held[i];
            visit(
              i + 1,
              cost + c.sources[t - 1].cost,
              draw + amount(t),
              first || t,
            );
            visit(i + 1, cost, draw, first);
          }
          visit(0, 0, 0, 0);
          return best;
        }
        const reserve = turn === c.turn ? c.target.cost : 0;
        let selected = plan(pp - reserve);
        if (
          extra &&
          (turn === c.turn || (c.extra === 'greedy' && c.target.cost <= c.turn))
        ) {
          const boosted = plan(pp + 1 - reserve);
          if (
            boosted.draw > selected.draw ||
            (turn === c.turn && pp < reserve && pp + 1 >= reserve)
          ) {
            pp++;
            extra = false;
            selected = boosted;
          }
        }
        if (!selected.first) break;
        const type = selected.first,
          s = c.sources[type - 1];
        hand.splice(hand.indexOf(type), 1);
        pp -= s.cost;
        const seen = new Set<number>();
        for (let n = 0; n < s.draw; n++) {
          if (s.kind === 'search') {
            const pool = deck
              .map((t, i) => ({ t, i }))
              .filter(({ t }) => candidate(type, t) && !seen.has(t));
            if (!pool.length) break;
            const card = pool[Math.floor(rng() * pool.length)];
            hand.push(deck.splice(card.i, 1)[0]);
            if (s.search?.unit === 'types') seen.add(card.t);
          } else {
            if (!deck.length) {
              alive = false;
              break;
            }
            hand.push(take());
          }
        }
        if (!alive) break;
      }
    }
    if (alive && hand.includes(0) && pp + Number(extra) >= c.target.cost)
      wins++;
  }
  return wins;
}

const base: Config = {
  target: { copies: 3, cost: 3 },
  turn: 5,
  extra: 'greedy',
  sources: [],
};
const mixed: Config = {
  ...base,
  turn: 4,
  target: { copies: 2, cost: 2 },
  searchOthers: [3],
  sources: [
    { copies: 2, cost: 1, draw: 1, keep: 1 },
    {
      kind: 'search',
      copies: 2,
      cost: 2,
      draw: 2,
      keep: 2,
      search: { target: true, sources: [0, 2], others: [0], unit: 'cards' },
    },
    {
      kind: 'search',
      copies: 2,
      cost: 1,
      draw: 2,
      keep: 1,
      search: { target: false, sources: [0, 1, 2], others: [0], unit: 'types' },
    },
  ],
};
const cases: [string, Config][] = [
  ['natural-only', base],
  [
    'draw-greedy',
    { ...base, sources: [{ copies: 3, cost: 2, draw: 2, keep: 1 }] },
  ],
  [
    'draw-reserve',
    {
      ...base,
      extra: 'reserve',
      sources: [{ copies: 3, cost: 2, draw: 2, keep: 2 }],
    },
  ],
  [
    'six-PP-target',
    {
      ...base,
      target: { copies: 3, cost: 6 },
      sources: [{ copies: 3, cost: 1, draw: 2, keep: 1 }],
    },
  ],
  ['mixed-greedy', mixed],
  ['mixed-reserve', { ...mixed, extra: 'reserve' }],
  [
    'disabled-search-member',
    {
      ...mixed,
      sources: mixed.sources.map((s, i) => ({ ...s, enabled: i !== 0 })),
    },
  ],
  [
    'search-exhaustion',
    {
      ...base,
      turn: 2,
      target: { copies: 1, cost: 0 },
      searchOthers: [3],
      sources: [
        {
          kind: 'search',
          copies: 3,
          cost: 0,
          draw: 40,
          keep: 2,
          search: { target: false, sources: [], others: [0], unit: 'types' },
        },
      ],
    },
  ],
  [
    'deck-out',
    {
      ...base,
      turn: 3,
      target: { copies: 1, cost: 0 },
      sources: [{ copies: 12, cost: 0, draw: 5, keep: 3 }],
    },
  ],
];

const trials = Number(process.argv[2] ?? 100000);
if (!Number.isSafeInteger(trials) || trials < 1000)
  throw new Error('Specify an integer trial count >= 1000');
const comparisons = cases.length * 4;
// Hoeffding + union bound: probability of ANY false alarm <= 0.001 under
// independent Bernoulli sampling. Bound chosen before observing results.
const familyAlpha = 0.001;
const tolerance = Math.sqrt(
  Math.log((2 * comparisons) / familyAlpha) / (2 * trials),
);
console.log(
  JSON.stringify({
    trials,
    comparisons,
    totalTrials: trials * comparisons,
    seedBase: 20260906,
    tolerancePercentagePoints: tolerance * 100,
    familyAlpha,
  }),
);
let failed = 0,
  maxDifference = 0;
for (const [index, [name, c]] of cases.entries())
  for (const back of [false, true])
    for (const keep of [false, true]) {
      const seed = 20260906 + index * 4 + Number(back) * 2 + Number(keep);
      const exact = calculateScenario(c, { back, keep }).probability;
      const wins = simulate(c, back, keep, trials, seed);
      const estimate = wins / trials,
        difference = Math.abs(estimate - exact);
      const passed =
        exact === 0 || exact === 1
          ? estimate === exact
          : difference <= tolerance;
      if (!passed) failed++;
      maxDifference = Math.max(maxDifference, difference);
      console.log(
        JSON.stringify({
          name,
          back,
          keep,
          seed,
          wins,
          exact,
          estimate,
          differencePercentagePoints: difference * 100,
          passed,
        }),
      );
    }
console.log(
  JSON.stringify({
    failed,
    maxDifferencePercentagePoints: maxDifference * 100,
  }),
);
if (failed) process.exitCode = 1;

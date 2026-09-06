// Exact enumeration of a deliberately limited play policy, using double precision.
// Types: target, draw source 1..n, inert cards. No individual card identities needed.
import type { Config, DrawSource, Progress, Result, ResultRow } from './types';

export const DEFAULT_CONFIG: Config = {
  target: { copies: 3, cost: 3 },
  turn: 5,
  extra: 'optimal',
  sources: [{ cost: 2, draw: 2, copies: 3, keep: 0, enabled: true }],
};

export function validateConfig(value: unknown): Config {
  const c = value as Config;
  const integer = (v: number, min: number, max: number) =>
    Number.isInteger(v) && v >= min && v <= max;
  if (
    !c ||
    !c.target ||
    !integer(c.target.copies, 1, 40) ||
    !integer(c.target.cost, 0, 6)
  ) {
    throw new Error('対象カードは採用1〜40枚、コスト0〜6で入力してください。');
  }
  if (!integer(c.turn, 1, 5))
    throw new Error('目標ターンは1〜5で入力してください。');
  if (c.maxStates !== undefined && !integer(c.maxStates, 100000, 2000000))
    throw new Error('計算量上限は10万〜200万状態で指定してください。');
  if (!['optimal', 'greedy', 'reserve'].includes(c.extra))
    throw new Error('エクストラPPの方針が不正です。');
  if (!Array.isArray(c.sources) || c.sources.length > 5)
    throw new Error('ドローソースは最大5種類です。');
  if (
    c.searchOthers !== undefined &&
    (!Array.isArray(c.searchOthers) ||
      c.searchOthers.length > 3 ||
      c.searchOthers.some((n) => !integer(n, 1, 40)))
  ) {
    throw new Error(
      'カードカテゴリは最大3グループ、各1〜40枚で入力してください。',
    );
  }
  if (
    c.searchOtherKeeps !== undefined &&
    (!Array.isArray(c.searchOtherKeeps) ||
      c.searchOtherKeeps.length > (c.searchOthers?.length ?? 0) ||
      c.searchOtherKeeps.some((n) => !integer(n, 0, 3)))
  ) {
    throw new Error('その他の初手保持は各グループ0〜3枚で指定してください。');
  }
  if (
    c.searchOtherEnabled !== undefined &&
    (!Array.isArray(c.searchOtherEnabled) ||
      c.searchOtherEnabled.length > (c.searchOthers?.length ?? 0) ||
      c.searchOtherEnabled.some((n) => typeof n !== 'boolean'))
  ) {
    throw new Error('カードカテゴリの有効・無効の指定が不正です。');
  }
  for (const s of c.sources) {
    if (
      !s ||
      !integer(s.copies, 1, 40) ||
      !integer(s.cost, 0, 6) ||
      !integer(s.draw, 1, s.kind === 'search' ? 40 : 5) ||
      !integer(s.keep, 0, 3) ||
      (s.enabled !== undefined && typeof s.enabled !== 'boolean') ||
      (s.kind !== undefined && !['draw', 'search'].includes(s.kind))
    ) {
      throw new Error(
        '採用1〜40枚、コスト0〜6、ドロー1〜5枚（サーチ1〜40）、初手保持0〜3枚で入力してください。',
      );
    }
    if (s.kind === 'search' || s.search !== undefined) {
      const search = s.search;
      const validIndices = (values: unknown, length: number) =>
        Array.isArray(values) &&
        values.every((i) => integer(i, 0, length - 1)) &&
        new Set(values).size === values.length;
      if (
        !search ||
        (search.unit !== undefined &&
          !['cards', 'types'].includes(search.unit)) ||
        typeof search.target !== 'boolean' ||
        !validIndices(search.sources, c.sources.length) ||
        !validIndices(search.others, c.searchOthers?.length ?? 0)
      ) {
        throw new Error('サーチ対象の指定が不正です。');
      }
    }
  }
  if (
    c.target.copies +
      enabledSources(c).reduce((n, s) => n + s.copies, 0) +
      (c.searchOthers ?? []).reduce(
        (n, copies, i) =>
          n + (c.searchOtherEnabled?.[i] === false ? 0 : copies),
        0,
      ) >
    40
  ) {
    throw new Error(
      '対象カード・有効なソース・カードカテゴリを、合計40枚以内にしてください。',
    );
  }
  return c;
}

export function enabledSources(config: Config): DrawSource[] {
  return config.sources.filter((source) => source.enabled !== false);
}

function activeConfig(config: Config): Config {
  // Disabled copies become inert cards in the 40-card deck. Keep their settings
  // in the UI/snapshots, but avoid adding unnecessary states to the calculation.
  const indices = config.sources
    .map((_, i) => i)
    .filter((i) => config.sources[i].enabled !== false);
  const hasSearch = indices.some((i) => config.sources[i].kind === 'search');
  const otherIndices = (config.searchOthers ?? [])
    .map((_, i) => i)
    .filter((i) => config.searchOtherEnabled?.[i] !== false);
  return {
    ...config,
    sources: indices.map((i) => {
      const source = config.sources[i];
      return {
        ...source,
        search: source.search && {
          ...source.search,
          sources: source.search.sources
            .filter((j) => indices.includes(j))
            .map((j) => indices.indexOf(j)),
          others: hasSearch
            ? source.search.others
                .filter((j) => otherIndices.includes(j))
                .map((j) => otherIndices.indexOf(j))
            : [],
        },
      };
    }),
    searchOthers: otherIndices.map((i) => config.searchOthers![i]),
    searchOtherKeeps: otherIndices.map(
      (i) => config.searchOtherKeeps?.[i] ?? 0,
    ),
    searchOtherEnabled: otherIndices.map(() => true),
  };
}

export function searchTypeIndices(
  config: Config,
  source: DrawSource,
): number[] {
  if (source.kind !== 'search' || !source.search) return [];
  return [
    ...(source.search.target ? [0] : []),
    ...source.search.sources.map((i) => i + 1),
    ...source.search.others.map((i) => config.sources.length + 1 + i),
  ];
}

function searchCapacity(
  config: Config,
  source: DrawSource,
  deck: number[],
): number {
  return Math.min(
    source.draw,
    searchTypeIndices(config, source).reduce(
      (n, i) =>
        n + (source.search?.unit === 'types' ? Number(deck[i] > 0) : deck[i]),
      0,
    ),
  );
}

export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++)
    result = (result * (n - i + 1)) / i;
  return result;
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

interface WeightedHand {
  hand: number[];
  probability: number;
}
interface Opening {
  success: number;
  states: (WeightedHand & { deck: number[] })[];
}
interface Plan {
  draw: number;
  cost: number;
  first: number;
}
interface Action {
  source: number;
  activate: boolean;
}
export interface Limits {
  maxStates?: number;
  maxMs?: number;
  /** Diagnostic switches; all enabled by default. Never persisted in UI. */
  pruning?:
    | false
    | Partial<
        Record<'extraPP' | 'terminalPP' | 'ordering' | 'bounds', boolean>
      >;
}
interface ScenarioOptions extends Limits {
  horizon?: number;
  back?: boolean;
  keep?: boolean;
  initial?: Opening;
}

// Multivariate hypergeometric distribution. Used only before play; in-play draws
// are sequential to account for a target found mid-effect. No hand size limit.
export function hands(deck: number[], count: number): WeightedHand[] {
  const result: WeightedHand[] = [];
  const total = choose(sum(deck), count);
  const hand = deck.map(() => 0);
  function visit(i: number, left: number, weight: number) {
    if (i === deck.length - 1) {
      if (left <= deck[i]) {
        hand[i] = left;
        result.push({
          hand: [...hand],
          probability: (weight * choose(deck[i], left)) / total,
        });
      }
      return;
    }
    for (let n = 0; n <= Math.min(left, deck[i]); n++) {
      hand[i] = n;
      visit(i + 1, left - n, weight * choose(deck[i], n));
    }
  }
  visit(0, count, 1);
  return result;
}

export function initialDistribution(
  config: Config,
  keepSources: boolean,
): Opening {
  config = activeConfig(config);
  const deck = [
    config.target.copies,
    ...config.sources.map((s) => s.copies),
    ...(config.searchOthers ?? []),
  ];
  deck.push(40 - sum(deck));
  let success = 0;
  const states = new Map<string, Opening['states'][number]>();
  for (const first of hands(deck, 4)) {
    if (first.hand[0]) {
      success += first.probability;
      continue;
    }
    const kept = first.hand.map((n, i) => {
      if (!keepSources || i === 0) return 0;
      const cap =
        i <= config.sources.length
          ? config.sources[i - 1].keep
          : (config.searchOtherKeeps?.[i - config.sources.length - 1] ?? 0);
      return Math.min(n, cap);
    });
    const replacementDeck = deck.map((n, i) => n - first.hand[i]);
    // Set aside all exchanged cards, draw replacements, then shuffle them back.
    for (const replacement of hands(replacementDeck, 4 - sum(kept))) {
      const p = first.probability * replacement.probability;
      if (replacement.hand[0]) {
        success += p;
        continue;
      }
      const hand = kept.map((n, i) => n + replacement.hand[i]);
      const remaining = deck.map((n, i) => n - hand[i]);
      const key = hand.join(',');
      const prior = states.get(key);
      if (prior) prior.probability += p;
      else states.set(key, { deck: remaining, hand, probability: p });
    }
  }
  return { success, states: [...states.values()] };
}

// Bounded knapsack over the currently held sources. Maximize declared draws;
// tie: lower total cost, then lower cost / higher draw / registration order.
export function bestPlan(
  sources: DrawSource[],
  hand: number[],
  budget: number,
): Plan {
  if (budget < 0) return { draw: 0, cost: 0, first: -1 };
  const order = sources
    .map((_, i) => i)
    .filter((i) => sources[i].draw > 0)
    .sort(
      (a, b) =>
        sources[a].cost - sources[b].cost ||
        sources[b].draw - sources[a].draw ||
        a - b,
    );
  let best = { draw: 0, cost: 0, first: -1 };
  function visit(pos: number, cost: number, draw: number, first: number) {
    if (pos === order.length) {
      if (draw > best.draw || (draw === best.draw && cost < best.cost))
        best = { draw, cost, first };
      return;
    }
    const i = order[pos],
      s = sources[i];
    const max =
      s.cost === 0
        ? hand[i + 1]
        : Math.min(hand[i + 1], Math.floor((budget - cost) / s.cost));
    // All free draws belong in a maximum-draw plan; avoid exploring subsets.
    for (let n = max; n >= (s.cost === 0 ? max : 0); n--)
      visit(
        pos + 1,
        cost + n * s.cost,
        draw + n * s.draw,
        first < 0 && n ? i : first,
      );
  }
  visit(0, 0, 0, -1);
  return best;
}

export function selectAction(
  config: Config,
  hand: number[],
  turn: number,
  horizon: number,
  pp: number,
  extra: boolean,
  deck?: number[],
): Action {
  // Searches are capped by their current candidate count; recompute after each
  // effect. This is a local card-count policy, not a success-rate optimizer.
  const sources = deck
    ? config.sources.map((s) =>
        s.kind === 'search'
          ? {
              ...s,
              draw: searchCapacity(config, s, deck),
            }
          : s,
      )
    : config.sources;
  const reserve = turn === horizon ? config.target.cost : 0;
  const normal = bestPlan(sources, hand, pp - reserve);
  // A target costing horizon+1 needs the unique extra PP on the target turn.
  const canUse =
    extra &&
    (turn === horizon ||
      (config.extra === 'greedy' && config.target.cost <= horizon));
  const boosted = canUse ? bestPlan(sources, hand, pp + 1 - reserve) : normal;
  const activate =
    canUse &&
    (boosted.draw > normal.draw ||
      (turn === horizon && pp < reserve && pp + 1 >= reserve));
  return {
    source: (activate ? boosted : normal).first,
    activate: Boolean(activate),
  };
}

export class ComplexityError extends Error {
  constructor() {
    super(
      'この条件は計算量の上限に達しました。ドローソースの種類数やドロー枚数を減らして再計算してください。',
    );
    this.name = 'ComplexityError';
  }
}

export function calculateScenario(
  config: Config,
  {
    horizon = config.turn,
    back = false,
    keep = true,
    maxStates = config.maxStates ?? 400000,
    maxMs = 12000,
    pruning,
    initial,
  }: ScenarioOptions = {},
) {
  validateConfig(config);
  config = activeConfig(config);
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 5)
    throw new Error('計算対象は1〜5ターンです。');
  const start = performance.now();
  const enabled = (name: 'extraPP' | 'terminalPP' | 'ordering' | 'bounds') =>
    config.extra === 'optimal' &&
    pruning !== false &&
    pruning?.[name] !== false;
  const pruneExtra = enabled('extraPP'),
    mergeTerminal = enabled('terminalPP'),
    orderActions =
      enabled('ordering') && config.sources.some((s) => s.kind === 'search'),
    pruneBounds = enabled('bounds');
  if (config.target.cost > horizon + Number(back))
    return { probability: 0, states: 0, ms: performance.now() - start };
  const opening = initial ?? initialDistribution(config, keep);
  const hasSearch =
    config.sources.some((s) => s.kind === 'search') ||
    Boolean(config.searchOthers?.length);
  const searchTypes = config.sources.map(
    (s) => new Set(searchTypeIndices(config, s)),
  );
  const naturalOrder = config.sources.map((_, i) => i);
  const memo = new Map<number | string, number>(),
    plans = new Map<number, Action>();
  let visited = 0;
  function check() {
    visited++;
    if (
      memo.size >= maxStates ||
      (visited % 1024 === 0 && performance.now() - start > maxMs)
    )
      throw new ComplexityError();
  }
  function solve(
    deck: number[],
    hand: number[],
    turn: number,
    pp: number,
    extra: boolean,
    pending: number,
    searchMode = -1,
    selectedTypes = 0,
    cutoff = -1,
  ): number {
    check();
    // On the final turn there is no future use for a saved extra PP.
    if (mergeTerminal && turn === horizon && extra) {
      pp++;
      extra = false;
    }
    const size = sum(deck);
    // The whole draw effect must resolve. Deck-out during it is a failure.
    if (pending > size) return 0;
    if (hand[0]) {
      const affordable =
        turn === horizon
          ? pp + Number(extra) >= config.target.cost
          : horizon + Number(extra) >= config.target.cost;
      return Number(affordable && size >= pending + horizon - turn);
    }
    if (deck[0] === 0) return 0;
    // For c copies, (in deck, in hand) has (c+1)(c+2)/2 states.
    // The target remains in deck until success. Inert cards in hand are irrelevant.
    // A numeric key substantially reduces allocation and memory on mobile.
    let sourceState = 0;
    for (let i = 1; i <= config.sources.length; i++) {
      const copies = config.sources[i - 1].copies;
      sourceState =
        sourceState * (((copies + 1) * (copies + 2)) / 2) +
        (deck[i] * (2 * copies + 3 - deck[i])) / 2 +
        hand[i];
    }
    const key = hasSearch
      ? `${turn}/${pp}/${+extra}/${pending}/${searchMode}/${selectedTypes}/${deck}/${hand.slice(1, config.sources.length + 1)}`
      : ((((sourceState * 40 + deck.at(-1)!) * 5 + turn - 1) * 7 + pp) * 2 +
          Number(extra)) *
          6 +
        pending;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let value = 0;
    if (pending > 0) {
      const eligible =
        searchMode < 0
          ? size
          : [...searchTypes[searchMode]].reduce(
              (n, i) => n + (selectedTypes & (1 << i) ? 0 : deck[i]),
              0,
            );
      // A search with no candidates simply finishes; it is not a deck-out draw.
      if (eligible === 0 && searchMode >= 0)
        return solve(deck, hand, turn, pp, extra, 0);
      let remaining = eligible;
      for (let i = 0; i < deck.length; i++) {
        if (
          !deck[i] ||
          selectedTypes & (1 << i) ||
          (searchMode >= 0 && !searchTypes[searchMode].has(i))
        )
          continue;
        const nextDeck = [...deck],
          nextHand = [...hand];
        nextDeck[i]--;
        nextHand[i]++;
        value +=
          (deck[i] / eligible) *
          solve(
            nextDeck,
            nextHand,
            turn,
            pp,
            extra,
            pending - 1,
            pending === 1 ? -1 : searchMode,
            pending > 1 &&
              searchMode >= 0 &&
              config.sources[searchMode].search?.unit === 'types'
              ? selectedTypes | (1 << i)
              : 0,
          );
        remaining -= deck[i];
        // Each unvisited outcome contributes at most its probability mass.
        // Return only to the competing decision node; NEVER memoize a bound.
        // A conservative margin avoids cutting ties due to roundoff.
        if (
          pruneBounds &&
          remaining > 0 &&
          value + remaining / eligible < cutoff - 1e-12
        )
          return value + remaining / eligible;
      }
    } else if (config.extra === 'optimal') {
      // Bellman decision node: maximize expected success BEFORE seeing the next
      // random card. Waiting preserves held sources and the unused extra PP.
      const wait = () =>
        turn < horizon
          ? solve(deck, hand, turn + 1, turn + 1, extra, 1, -1, 0, value)
          : 0;
      value = orderActions ? 0 : wait();
      const order = orderActions ? [...naturalOrder] : naturalOrder;
      if (orderActions) {
        // Cheap ordering only, not pruning by this heuristic. Target-only
        // searches come first; ordinary draws use a rough immediate-hit score.
        const score = (i: number) => {
          const s = config.sources[i];
          if (!hand[i + 1] || s.cost > pp + Number(extra)) return -1;
          if (s.kind !== 'search')
            return Math.min(1, (s.draw * deck[0]) / size);
          if (!s.search?.target) return 0;
          const pool = [...searchTypes[i]].reduce((n, j) => n + deck[j], 0);
          return pool
            ? Math.min(1, (deck[0] / pool) * searchCapacity(config, s, deck))
            : 0;
        };
        const scores = order.map(score);
        order.sort((a, b) => scores[b] - scores[a]);
      }
      for (const i of order) {
        if (value >= 1) break;
        const source = config.sources[i];
        if (!hand[i + 1]) continue;
        const amount =
          source.kind === 'search'
            ? searchCapacity(config, source, deck)
            : source.draw;
        if (!amount) continue;
        for (const activate of [false, true]) {
          if (activate && !extra) continue;
          // If this action is already affordable, activation can be delayed
          // until the next decision without losing any available action.
          if (pruneExtra && activate && source.cost <= pp) continue;
          const remainingPP = pp + Number(activate) - source.cost;
          const remainingExtra = extra && !activate;
          if (remainingPP < 0) continue;
          // Even after finding the target, its PP must still be available.
          if (
            (turn === horizon ? remainingPP : horizon) +
              Number(remainingExtra) <
            config.target.cost
          )
            continue;
          const nextHand = [...hand];
          nextHand[i + 1]--;
          value = Math.max(
            value,
            solve(
              deck,
              nextHand,
              turn,
              remainingPP,
              remainingExtra,
              amount,
              source.kind === 'search' ? i : -1,
              0,
              value,
            ),
          );
          if (value === 1) break;
        }
      }
      if (orderActions && value < 1) value = Math.max(value, wait());
    } else {
      let heldState = 0;
      for (let i = 1; i <= config.sources.length; i++)
        heldState = heldState * (config.sources[i - 1].copies + 1) + hand[i];
      const planKey = ((heldState * 5 + turn - 1) * 7 + pp) * 2 + Number(extra);
      let action = hasSearch ? undefined : plans.get(planKey);
      if (!action) {
        action = selectAction(
          config,
          hand,
          turn,
          horizon,
          pp,
          extra,
          hasSearch ? deck : undefined,
        );
        if (!hasSearch) plans.set(planKey, action);
      }
      const available = pp + Number(action.activate);
      const nextExtra = extra && !action.activate;
      if (action.source >= 0) {
        const nextHand = [...hand],
          source = config.sources[action.source];
        nextHand[action.source + 1]--;
        value = solve(
          deck,
          nextHand,
          turn,
          available - source.cost,
          nextExtra,
          source.kind === 'search'
            ? searchCapacity(config, source, deck)
            : source.draw,
          source.kind === 'search' ? action.source : -1,
        );
      } else if (turn < horizon) {
        value = solve(deck, hand, turn + 1, turn + 1, nextExtra, 1);
      }
    }
    memo.set(key, value);
    return value;
  }
  let probability = opening.success;
  for (const s of opening.states)
    probability += s.probability * solve(s.deck, s.hand, 1, 1, back, 1);
  return {
    probability: Math.min(1, Math.max(0, probability)),
    states: memo.size,
    ms: performance.now() - start,
  };
}

export function calculateAll(
  config: Config,
  onProgress: (p: Progress) => void = () => {},
  limits: Limits = {},
): Result {
  validateConfig(config);
  config = activeConfig(config);
  const start = performance.now();
  const same =
    !config.sources.some((s) => s.keep) &&
    !config.searchOtherKeeps?.some((n) => n > 0);
  const initialKeep = initialDistribution(config, true);
  const initialExchange = same
    ? initialKeep
    : initialDistribution(config, false);
  const rows: ResultRow[] = [];
  let states = 0;
  for (let turn = 1; turn <= 5; turn++) {
    const row: ResultRow = {
      turn,
      frontKeep: 0,
      backKeep: 0,
      frontExchange: 0,
      backExchange: 0,
    };
    for (const back of [false, true]) {
      const prefix = back ? 'back' : 'front';
      const kept = calculateScenario(config, {
        ...limits,
        horizon: turn,
        back,
        keep: true,
        initial: initialKeep,
      });
      row[`${prefix}Keep`] = kept.probability;
      states += kept.states;
      const exchanged = same
        ? kept
        : calculateScenario(config, {
            ...limits,
            horizon: turn,
            back,
            keep: false,
            initial: initialExchange,
          });
      row[`${prefix}Exchange`] = exchanged.probability;
      if (!same) states += exchanged.states;
    }
    rows.push(row);
    onProgress({ completed: turn, total: 5, row });
  }
  return {
    rows,
    states,
    ms: performance.now() - start,
    method: 'exact',
    version: 1,
  };
}

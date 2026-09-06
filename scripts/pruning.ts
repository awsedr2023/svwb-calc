import assert from 'node:assert/strict';
import {
  calculateAll,
  ComplexityError,
  DEFAULT_CONFIG,
  type Limits,
} from '../src/engine';
import type { Config, Result } from '../src/types';

const stages: [string, Limits['pruning']][] = [
  ['baseline', false],
  ['extraPP', { terminalPP: false, ordering: false, bounds: false }],
  ['+terminalPP', { ordering: false, bounds: false }],
  ['+ordering', { bounds: false }],
  ['+bounds (all)', {}],
];
const draw = (cost: number, n: number, copies = 3) => ({
  cost,
  draw: n,
  copies,
  keep: 1,
});
const search = (unit: 'cards' | 'types', others: number[]) => ({
  ...draw(2, 2, 2),
  kind: 'search' as const,
  search: { target: true, sources: [0], others, unit },
});
const cases: [string, Config, boolean?][] = [
  ['default', DEFAULT_CONFIG],
  [
    '3 draws',
    { ...DEFAULT_CONFIG, sources: [draw(1, 1), draw(2, 2), draw(3, 2)] },
  ],
  ...(['cards', 'types'] as const).map((unit): [string, Config] => [
    'mixed ' + unit,
    {
      ...DEFAULT_CONFIG,
      searchOthers: [3, 2],
      sources: [draw(1, 1, 2), search(unit, [0]), search(unit, [0, 1])],
    },
  ]),
  [
    'certain search',
    {
      ...DEFAULT_CONFIG,
      sources: [
        draw(1, 2),
        {
          ...search('cards', []),
          search: { target: true, sources: [], others: [] },
        },
      ],
    },
  ],
  [
    '5 draws (stress)',
    {
      ...DEFAULT_CONFIG,
      sources: [draw(1, 1), draw(2, 2), draw(3, 2), draw(4, 3), draw(2, 1)],
    },
    true,
  ],
  [
    'overlap (stress)',
    {
      ...DEFAULT_CONFIG,
      searchOthers: [4, 3, 3],
      sources: [
        draw(1, 1),
        { ...search('cards', [0, 1]), copies: 3 },
        { ...search('types', [0, 2]), copies: 3 },
      ],
    },
    true,
  ],
];
const keys = [
  'frontKeep',
  'frontExchange',
  'backKeep',
  'backExchange',
] as const;
const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
let maxDifference = 0,
  comparisons = 0;
// Warm up outside measurements. Reverse stage order on alternating repetitions.
for (const [, pruning] of stages)
  calculateAll(DEFAULT_CONFIG, undefined, { pruning });
for (const [name, config, stress] of cases) {
  const modes = stress ? [stages[0], stages.at(-1)!] : stages;
  const samples = new Map<
    string,
    { ms: number[]; result?: Result; error?: string }
  >();
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const [stage, pruning] of repeat % 2 ? [...modes].reverse() : modes) {
      const sample = samples.get(stage) ?? { ms: [] };
      samples.set(stage, sample);
      const start = performance.now();
      try {
        sample.result = calculateAll(config, undefined, { pruning });
      } catch (e) {
        if (!(e instanceof ComplexityError) || !stress) throw e;
        sample.error = 'limit';
      }
      sample.ms.push(performance.now() - start);
    }
  }
  const base = samples.get('baseline')!;
  for (const [stage, sample] of samples) {
    let delta: number | null = null;
    if (base.result && sample.result) {
      delta = 0;
      sample.result.rows.forEach((row, i) => {
        for (const key of keys) {
          const difference = Math.abs(row[key] - base.result!.rows[i][key]);
          assert.ok(
            difference <= 1e-11,
            `${name}/${stage}/${row.turn}/${key}: ${difference}`,
          );
          delta = Math.max(delta!, difference);
          if (stage !== 'baseline') comparisons++;
        }
      });
      maxDifference = Math.max(maxDifference, delta);
    }
    console.log(
      JSON.stringify({
        name,
        stage,
        status: sample.error ?? 'ok',
        medianMs: +median(sample.ms).toFixed(2),
        states: sample.result?.states,
        speedup:
          base.error || sample.error
            ? null
            : +(median(base.ms) / median(sample.ms)).toFixed(2),
        stateReduction:
          base.result && sample.result
            ? +(1 - sample.result.states / base.result.states).toFixed(4)
            : null,
        difference: delta,
      }),
    );
  }
}
console.log(
  JSON.stringify({
    comparisons,
    maxDifference,
    tolerance: 1e-11,
    note: 'Limit cases are not probability-equality passes. Times are Node wall-clock medians, not phone measurements.',
  }),
);

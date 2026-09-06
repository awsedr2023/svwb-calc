import { calculateAll, DEFAULT_CONFIG } from '../src/engine';
import type { Config } from '../src/types';

const cases: [string, Config][] = [
  [
    '1 search + 7 other candidates',
    {
      ...DEFAULT_CONFIG,
      searchOthers: [7],
      sources: [
        {
          kind: 'search',
          cost: 2,
          draw: 2,
          copies: 3,
          keep: 1,
          search: { target: true, sources: [], others: [0] },
        },
      ],
    },
  ],
  [
    'draw + 2 overlapping searches',
    {
      ...DEFAULT_CONFIG,
      searchOthers: [4, 3, 3],
      sources: [
        { cost: 1, draw: 1, copies: 3, keep: 1 },
        {
          kind: 'search',
          cost: 2,
          draw: 2,
          copies: 3,
          keep: 1,
          search: { target: true, sources: [0], others: [0, 1] },
        },
        {
          kind: 'search',
          cost: 2,
          draw: 1,
          copies: 3,
          keep: 2,
          search: { target: true, sources: [0], others: [0, 2] },
        },
      ],
    },
  ],
  ['no sources', { ...DEFAULT_CONFIG, sources: [] }],
  ['1 source (default)', DEFAULT_CONFIG],
  [
    '3 sources',
    {
      ...DEFAULT_CONFIG,
      sources: [
        { cost: 1, draw: 1, copies: 3, keep: 3 },
        { cost: 2, draw: 2, copies: 3, keep: 3 },
        { cost: 3, draw: 2, copies: 3, keep: 0 },
      ],
    },
  ],
  [
    '5 sources',
    {
      ...DEFAULT_CONFIG,
      sources: [
        { cost: 1, draw: 1, copies: 3, keep: 3 },
        { cost: 2, draw: 2, copies: 3, keep: 3 },
        { cost: 3, draw: 2, copies: 3, keep: 0 },
        { cost: 4, draw: 3, copies: 3, keep: 0 },
        { cost: 2, draw: 1, copies: 3, keep: 3 },
      ],
    },
  ],
  [
    '5 heavy sources',
    {
      ...DEFAULT_CONFIG,
      target: { copies: 1, cost: 0 },
      sources: Array.from({ length: 5 }, (_, i) => ({
        cost: i % 2,
        draw: Math.min(5, i + 1),
        copies: 3,
        keep: i % 2 === 0 ? 3 : 0,
      })),
    },
  ],
];
for (const [name, config] of cases) {
  const start = performance.now();
  try {
    const result = calculateAll(config);
    console.log(
      JSON.stringify({
        name,
        ms: Math.round(result.ms),
        states: result.states,
        turn5: result.rows[4],
        heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      }),
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        name,
        ms: Math.round(performance.now() - start),
        error: (e as Error).message,
      }),
    );
  }
}

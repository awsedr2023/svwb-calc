import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAll,
  initialDistribution,
  validateConfig,
  choose,
} from '../src/engine';
import {
  calculationKey,
  migrateConfig,
  removeSearchOther,
} from '../src/storage';
import type { Config } from '../src/types';

const config: Config = {
  target: { copies: 3, cost: 0 },
  turn: 5,
  extra: 'greedy',
  sources: [],
  searchOthers: [3, 3],
  searchOtherKeeps: [1, 2],
};
test('other-group caps match equivalent source caps for the entire opening distribution', () => {
  for (const caps of [
    [0, 0],
    [1, 2],
    [3, 1],
  ]) {
    const c = { ...config, searchOtherKeeps: caps };
    const proxy: Config = {
      ...config,
      searchOthers: [],
      searchOtherKeeps: [],
      sources: c.searchOthers!.map((copies, i) => ({
        copies,
        cost: 6,
        draw: 1,
        keep: caps[i],
      })),
    };
    for (const keep of [false, true])
      assert.deepEqual(
        initialDistribution(c, keep),
        initialDistribution(proxy, keep),
      );
  }
});
test('other-only retention changes results even without searches or active sources', () => {
  const result = calculateAll(config);
  for (const keep of [false, true]) {
    const opening = initialDistribution(config, keep);
    for (const row of result.rows) {
      const expected =
        1 -
        ((1 - opening.success) * choose(33, row.turn)) / choose(36, row.turn);
      for (const side of ['front', 'back'] as const)
        assert.ok(
          Math.abs(row[`${side}${keep ? 'Keep' : 'Exchange'}`] - expected) <
            1e-11,
        );
    }
  }
  assert.notEqual(result.rows[0].frontKeep, result.rows[0].frontExchange);
  assert.deepEqual(
    calculateAll({
      ...config,
      sources: [{ cost: 1, draw: 1, copies: 3, keep: 3, enabled: false }],
    }).rows,
    result.rows,
  );
});
test('other retention defaults, cache keys, deletion and invalid caps', () => {
  const legacy = { ...config, searchOtherKeeps: undefined };
  assert.deepEqual(
    calculateAll(legacy).rows,
    calculateAll({ ...config, searchOtherKeeps: [0, 0] }).rows,
  );
  assert.deepEqual(migrateConfig(config), config);
  assert.notEqual(calculationKey(config), calculationKey(legacy));
  assert.deepEqual(removeSearchOther(config, 0).searchOtherKeeps, [2]);
  for (const caps of [[4], [-1], [1.5], [0, 0, 0]])
    assert.throws(() => validateConfig({ ...config, searchOtherKeeps: caps }));
});

test('disabled categories become filler and remap search membership without losing settings', () => {
  for (const unit of ['cards', 'types'] as const) {
    const c: Config = {
      ...config,
      searchOtherEnabled: [false, true],
      sources: [
        {
          kind: 'search',
          copies: 2,
          cost: 1,
          draw: 2,
          keep: 1,
          search: { target: true, sources: [], others: [0, 1], unit },
        },
      ],
    };
    const original = structuredClone(c);
    const removed = removeSearchOther(c, 0);
    assert.deepEqual(removed.searchOtherEnabled, [true]);
    assert.deepEqual(removed.sources[0].search?.others, [0]);
    assert.deepEqual(calculateAll(c).rows, calculateAll(removed).rows);
    assert.deepEqual(c, original);
    assert.notEqual(
      calculationKey(c),
      calculationKey({ ...c, searchOtherEnabled: [true, true] }),
    );
  }
  const disabled = { ...config, searchOtherEnabled: [false, false] };
  assert.deepEqual(
    calculateAll(disabled).rows,
    calculateAll({ ...config, searchOthers: [], searchOtherKeeps: [] }).rows,
  );
  assert.doesNotThrow(() =>
    validateConfig({ ...disabled, searchOthers: [40, 40] }),
  );
  for (const enabled of [[1], [true, true, true], null])
    assert.throws(() =>
      validateConfig({ ...config, searchOtherEnabled: enabled }),
    );
});

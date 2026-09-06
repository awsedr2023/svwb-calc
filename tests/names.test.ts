import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, calculateAll, validateConfig } from '../src/engine';
import {
  calculationKey,
  migrateConfig,
  removeSource,
  removeSearchOther,
} from '../src/storage';

test('names persist without changing probabilities/cache and survive indexed removal', () => {
  const base = {
    ...DEFAULT_CONFIG,
    searchOthers: [2, 3],
    searchOtherEnabled: [false, true],
    sources: [...DEFAULT_CONFIG.sources, { ...DEFAULT_CONFIG.sources[0] }],
  };
  const named = {
    ...base,
    sources: base.sources.map((s, i) => ({ ...s, name: `カード${i}` })),
    searchOtherNames: ['A', 'B'],
  };
  assert.equal(calculationKey(named), calculationKey(base));
  assert.deepEqual(calculateAll(named).rows, calculateAll(base).rows);
  assert.deepEqual(
    migrateConfig(JSON.parse(JSON.stringify(named))).searchOtherNames,
    ['A', 'B'],
  );
  assert.deepEqual(removeSearchOther(named, 0).searchOtherNames, ['B']);
  assert.equal(removeSource(named, 0).sources[0].name, 'カード1');
  assert.throws(() =>
    validateConfig({ ...base, searchOtherNames: ['A', 'B', 'C'] }),
  );
  assert.throws(() =>
    validateConfig({ ...base, sources: [{ ...base.sources[0], name: 42 }] }),
  );
  assert.throws(() =>
    validateConfig({ ...base, searchOtherNames: ['x'.repeat(81)] }),
  );
});

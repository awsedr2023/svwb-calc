import { DEFAULT_CONFIG, validateConfig } from './engine';
import type { Config } from './types';

export const STORAGE_KEY = 'svwb-draw-lab:config:v1';

export function migrateConfig(value: unknown): Config {
  const legacy = value as Config;
  if (!legacy || !Array.isArray(legacy.sources)) return validateConfig(value);
  return validateConfig({
    ...legacy,
    sources: legacy.sources.map((source) => {
      if (!source) return source;
      const keep: unknown = source.keep;
      return {
        ...source,
        keep:
          typeof keep === 'boolean' ? (keep ? 3 : 0) : keep === 4 ? 3 : keep,
      };
    }),
  });
}

export function loadConfig(): Config {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value) return migrateConfig(JSON.parse(value));
  } catch {
    /* Old, malformed, or unavailable storage must not block the page. */
  }
  return structuredClone(DEFAULT_CONFIG);
}

export function saveConfig(config: Config): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function calculationKey(config: Config): string {
  // All five target horizons are computed together. Selecting a turn is free.
  return JSON.stringify({
    target: config.target,
    extra: config.extra,
    sources: config.sources,
    searchOthers: config.searchOthers,
  });
}

export function removeSource(config: Config, index: number): Config {
  return {
    ...config,
    sources: config.sources
      .filter((_, i) => i !== index)
      .map((s) => ({
        ...s,
        search: s.search && {
          ...s.search,
          sources: s.search.sources
            .filter((i) => i !== index)
            .map((i) => (i > index ? i - 1 : i)),
        },
      })),
  };
}

export function removeSearchOther(config: Config, index: number): Config {
  return {
    ...config,
    searchOthers: config.searchOthers?.filter((_, i) => i !== index),
    sources: config.sources.map((s) => ({
      ...s,
      search: s.search && {
        ...s.search,
        others: s.search.others
          .filter((i) => i !== index)
          .map((i) => (i > index ? i - 1 : i)),
      },
    })),
  };
}

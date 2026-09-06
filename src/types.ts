export interface DrawSource {
  kind?: 'draw' | 'search';
  search?: {
    target: boolean;
    sources: number[];
    others: number[];
    unit?: 'cards' | 'types';
  };
  /** Missing in older saved configurations; defaults to enabled. */
  enabled?: boolean;
  cost: number;
  draw: number;
  copies: number;
  /** Maximum copies to retain from the four-card opening hand. */
  keep: number;
}

export interface Config {
  target: { copies: number; cost: number };
  turn: number;
  extra: 'greedy' | 'reserve';
  sources: DrawSource[];
  /** Disjoint groups of otherwise inert cards, shared by search effects. */
  searchOthers?: number[];
  /** Per-group opening retention cap; missing entries default to zero. */
  searchOtherKeeps?: number[];
  /** Missing entries default to enabled. Disabled copies become inert filler. */
  searchOtherEnabled?: boolean[];
}

export type SeriesKey =
  'frontKeep' | 'backKeep' | 'frontExchange' | 'backExchange';

export interface ResultRow {
  turn: number;
  frontKeep: number;
  backKeep: number;
  frontExchange: number;
  backExchange: number;
}

export interface Result {
  rows: ResultRow[];
  states: number;
  ms: number;
  method: 'exact';
  version: 1;
}

export interface Progress {
  completed: number;
  total: number;
  row: ResultRow;
}
export type WorkerMessage =
  | ({ type: 'progress' } & Progress)
  | { type: 'result'; result: Result }
  | { type: 'error'; message: string };

export interface Snapshot {
  config: Config;
  result: Result;
}

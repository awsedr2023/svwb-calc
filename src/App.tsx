import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'preact/hooks';
import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import type { Config, DrawSource, Snapshot } from './types';
import {
  loadConfig,
  saveConfig,
  removeSource,
  removeSearchOther,
} from './storage';
import { enabledSources, validateConfig } from './engine';
import { useCalculation } from './useCalculation';
import { Chart, ProbabilityTables, difference, percent } from './Chart';
import { PwaNotice } from './PwaNotice';

const InputValidity = createContext<(id: string, valid: boolean) => void>(
  () => {},
);

function Icon({
  name,
  size = 18,
}: {
  name: 'cards' | 'plus' | 'close' | 'pin' | 'chart' | 'table' | 'arrow';
  size?: number;
}) {
  const paths = {
    cards: (
      <>
        <rect x="8" y="3" width="12" height="17" rx="2" />
        <path d="m5 5-2 1 3 15 4-1M14 8l3 4-3 4-3-4Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    pin: <path d="m15 3 6 6-3 1-4 4v4l-3-3-6 6m6-6-5-5h4l4-4 1-3Z" />,
    chart: <path d="M4 4v16h16M7 15l4-5 4 2 5-7" />,
    table: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 9h16M4 14h16M10 4v16" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
  id,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix?: string;
  id: string;
}) {
  const reportValidity = useContext(InputValidity);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
    reportValidity(id, true);
  }, [value, id, reportValidity]);
  useEffect(() => () => reportValidity(id, true), [id, reportValidity]);
  const update = (raw: string) => {
    setDraft(raw);
    const valid =
      Boolean(raw.trim()) &&
      Number.isInteger(Number(raw)) &&
      Number(raw) >= min &&
      Number(raw) <= max;
    reportValidity(id, valid);
    if (valid) onChange(Number(raw));
  };
  const invalid =
    !draft.trim() ||
    !Number.isInteger(Number(draft)) ||
    Number(draft) < min ||
    Number(draft) > max;
  return (
    <label class="number-field" for={id}>
      <span>{label}</span>
      <div class="input-wrap">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step="1"
          value={draft}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onInput={(e) => update(e.currentTarget.value)}
          onBlur={() => {
            if (invalid) {
              setDraft(String(value));
              reportValidity(id, true);
            }
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
      {invalid && (
        <small id={`${id}-error`} class="negative">
          {min}〜{max}の整数
        </small>
      )}
    </label>
  );
}

function SectionTitle({
  number,
  children,
  aside,
}: {
  number: string;
  children: ComponentChildren;
  aside?: ComponentChildren;
}) {
  return (
    <div class="section-title">
      <span class="step">{number}</span>
      <h2>{children}</h2>
      {aside}
    </div>
  );
}

function ConfigSummary({ config }: { config: Config }) {
  return (
    <>
      <p>
        対象 {config.target.copies}枚 / {config.target.cost}PP ・ ドローソース{' '}
        有効{enabledSources(config).length} / 登録{config.sources.length}種類
      </p>
      <ul>
        {config.sources.map((s, i) => (
          <li key={i}>
            ソース{i + 1}：{s.cost}PP → {s.draw}
            {s.kind === 'search'
              ? `${s.search?.unit === 'types' ? '種類' : '枚'}サーチ`
              : 'ドロー'}{' '}
            × {s.copies}枚
            {s.enabled === false ? '（無効）' : `（初手に最大${s.keep}枚残す）`}
            {s.kind === 'search' && s.search && (
              <span>
                {' '}
                / 候補：
                {[
                  ...(s.search.target ? ['対象カード'] : []),
                  ...s.search.sources.map((j) => `ソース${j + 1}`),
                  ...s.search.others.map(
                    (j) => `その他${j + 1}（${config.searchOthers?.[j]}枚）`,
                  ),
                ].join('・') || 'なし'}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p>
        エクストラPP：
        {config.extra === 'greedy'
          ? '引ける枚数が増えるとき'
          : '目標ターンまで温存'}
      </p>
    </>
  );
}

export function App() {
  const extraHelp = useRef<HTMLDialogElement>(null);
  const [config, setConfig] = useState<Config>(loadConfig);
  const [saved, setSaved] = useState(true);
  const [pinned, setPinned] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<'chart' | 'table'>('chart');
  const [keep, setKeep] = useState(true);
  const [invalidFields, setInvalidFields] = useState(new Set<string>());
  const reportValidity = useCallback(
    (id: string, valid: boolean) =>
      setInvalidFields((previous) => {
        if (previous.has(id) === !valid) return previous;
        const next = new Set(previous);
        if (valid) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  let configError: string | undefined;
  try {
    validateConfig(config);
  } catch (error) {
    configError = (error as Error).message;
  }
  const calculation = useCalculation(
    config,
    invalidFields.size === 0 && !configError,
    configError,
  );
  const result = calculation.result;
  const row = result?.rows[config.turn - 1];
  const pinRow = pinned?.result.rows[config.turn - 1];
  const busy =
    calculation.status === 'waiting' || calculation.status === 'running';
  const activeSources = enabledSources(config);
  const sourceCopies = activeSources.reduce((n, s) => n + s.copies, 0);
  const otherCopies = (config.searchOthers ?? []).reduce(
    (n, copies) => n + copies,
    0,
  );

  useEffect(() => {
    if (!configError) setSaved(saveConfig(config));
  }, [config, configError]);
  const setTurn = (turn: number) => setConfig((c) => ({ ...c, turn }));
  const updateSource = (index: number, change: Partial<DrawSource>) =>
    setConfig((c) => ({
      ...c,
      sources: c.sources.map((s, i) => (i === index ? { ...s, ...change } : s)),
    }));
  const toggleSearchTarget = (
    index: number,
    type: 'sources' | 'others',
    targetIndex: number,
    checked: boolean,
  ) => {
    const search = config.sources[index].search!;
    updateSource(index, {
      search: {
        ...search,
        [type]: checked
          ? [...search[type], targetIndex]
          : search[type].filter((i) => i !== targetIndex),
      },
    });
  };

  return (
    <InputValidity.Provider value={reportValidity}>
      <header class="site-header">
        <a href="./" class="brand" aria-label="SVWB ドロー確率計算 ホーム">
          <span class="brand-mark">
            <Icon name="cards" size={24} />
          </span>
          <span>
            SVWB <strong>ドロー確率計算</strong>
          </span>
        </a>
        <span class="header-note">SHADOWVERSE: WORLDS BEYOND</span>
      </header>
      <main>
        <div class="intro">
          <div>
            <h1>
              ドロー確率<span>計算ツール</span>
            </h1>
          </div>
          <div class="intro-badge">
            <span class="badge-spark">✧</span>
            <div>
              エクストラPP対応<small>先攻・後攻を同時に比較</small>
            </div>
          </div>
        </div>
        <div class="workspace">
          <aside class="configuration" aria-label="計算条件">
            <section class="panel target-panel">
              <SectionTitle number="01">対象カード</SectionTitle>
              <div class="target-inputs">
                <NumberField
                  id="target-copies"
                  label="採用枚数"
                  value={config.target.copies}
                  min={1}
                  max={40}
                  suffix="枚"
                  onChange={(copies) =>
                    setConfig((c) => ({
                      ...c,
                      target: { ...c.target, copies },
                    }))
                  }
                />
                <NumberField
                  id="target-cost"
                  label="使用コスト"
                  value={config.target.cost}
                  min={0}
                  max={6}
                  suffix="PP"
                  onChange={(cost) =>
                    setConfig((c) => ({ ...c, target: { ...c.target, cost } }))
                  }
                />
              </div>
              <fieldset class="turn-field">
                <legend>目標ターン</legend>
                <div class="turn-selector">
                  {[1, 2, 3, 4, 5].map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={config.turn === t}
                      onClick={() => setTurn(t)}
                    >
                      {t}
                      <small>T</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <p class="field-note">
                このターンに、対象カード1枚を使うPPを確保します。
              </p>
            </section>
            <section class="panel sources-panel">
              <SectionTitle
                number="02"
                aside={
                  <span class="count-label">
                    有効{activeSources.length} / 登録{config.sources.length}種類
                  </span>
                }
              >
                ドローソース
              </SectionTitle>
              <p class="section-copy">
                コストを払って、ドローまたはランダムなサーチを行うカード。
              </p>
              <div class="sources-list">
                {config.sources.map((source, i) => (
                  <div
                    class={`source-card${source.enabled === false ? ' source-disabled' : ''}`}
                    key={i}
                  >
                    <div class="source-title">
                      <span class="source-symbol">
                        <Icon name="cards" size={15} />
                      </span>
                      <h3>ソース {String(i + 1).padStart(2, '0')}</h3>
                      <label class="source-enabled">
                        <input
                          type="checkbox"
                          aria-label={`ソース${i + 1}を有効にする`}
                          checked={source.enabled !== false}
                          onChange={(e) =>
                            updateSource(i, {
                              enabled: e.currentTarget.checked,
                            })
                          }
                        />
                        {source.enabled === false ? '無効' : '有効'}
                      </label>
                      <button
                        class="icon-button remove-source"
                        type="button"
                        aria-label={`ソース${i + 1}を削除`}
                        onClick={() => setConfig((c) => removeSource(c, i))}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                    <label class="source-kind" for={`source-${i}-kind`}>
                      <span>効果</span>
                      <select
                        id={`source-${i}-kind`}
                        value={source.kind ?? 'draw'}
                        onChange={(e) =>
                          updateSource(i, {
                            kind: e.currentTarget.value as DrawSource['kind'],
                            draw:
                              e.currentTarget.value === 'draw'
                                ? Math.min(5, source.draw)
                                : source.draw,
                            search: source.search ?? {
                              target: true,
                              sources: [],
                              others: [],
                            },
                          })
                        }
                      >
                        <option value="draw">通常ドロー</option>
                        <option value="search">ランダムサーチ</option>
                      </select>
                    </label>
                    {source.kind === 'search' && source.search && (
                      <label class="source-kind" for={`source-${i}-unit`}>
                        <span>サーチ単位</span>
                        <select
                          id={`source-${i}-unit`}
                          value={source.search.unit ?? 'cards'}
                          onChange={(e) =>
                            updateSource(i, {
                              search: {
                                ...source.search!,
                                unit: e.currentTarget.value as
                                  'cards' | 'types',
                              },
                            })
                          }
                        >
                          <option value="cards">枚</option>
                          <option value="types">種類</option>
                        </select>
                      </label>
                    )}
                    <div class="source-inputs">
                      <NumberField
                        id={`source-${i}-cost`}
                        label="コスト"
                        value={source.cost}
                        min={0}
                        max={6}
                        suffix="PP"
                        onChange={(cost) => updateSource(i, { cost })}
                      />
                      <NumberField
                        id={`source-${i}-draw`}
                        label={source.kind === 'search' ? 'サーチ' : 'ドロー'}
                        value={source.draw}
                        min={1}
                        max={source.kind === 'search' ? 40 : 5}
                        suffix={
                          source.kind === 'search' &&
                          source.search?.unit === 'types'
                            ? '種類'
                            : '枚'
                        }
                        onChange={(draw) => updateSource(i, { draw })}
                      />
                      <NumberField
                        id={`source-${i}-copies`}
                        label="採用"
                        value={source.copies}
                        min={1}
                        max={40}
                        suffix="枚"
                        onChange={(copies) => updateSource(i, { copies })}
                      />
                    </div>
                    <label class="keep-count" for={`source-${i}-keep`}>
                      <span>初手に残す枚数</span>
                      <select
                        id={`source-${i}-keep`}
                        value={source.keep}
                        disabled={source.enabled === false}
                        onChange={(e) =>
                          updateSource(i, {
                            keep: Number(e.currentTarget.value),
                          })
                        }
                      >
                        {[0, 1, 2, 3].map((count) => (
                          <option key={count} value={count}>
                            {count}枚まで
                          </option>
                        ))}
                      </select>
                    </label>
                    {source.kind === 'search' && source.search && (
                      <fieldset class="search-targets">
                        <legend>サーチ対象</legend>
                        <label>
                          <input
                            type="checkbox"
                            checked={source.search.target}
                            onChange={(e) =>
                              updateSource(i, {
                                search: {
                                  ...source.search!,
                                  target: e.currentTarget.checked,
                                },
                              })
                            }
                          />
                          対象カード（{config.target.copies}枚）
                        </label>
                        {config.sources.map((candidate, j) => (
                          <label key={`source-${j}`}>
                            <input
                              type="checkbox"
                              checked={source.search!.sources.includes(j)}
                              disabled={candidate.enabled === false}
                              onChange={(e) =>
                                toggleSearchTarget(
                                  i,
                                  'sources',
                                  j,
                                  e.currentTarget.checked,
                                )
                              }
                            />
                            ソース{j + 1}（{candidate.copies}枚
                            {candidate.enabled === false ? '・無効' : ''}）
                          </label>
                        ))}
                        {(config.searchOthers ?? []).map((copies, j) => (
                          <label key={`other-${j}`}>
                            <input
                              type="checkbox"
                              checked={source.search!.others.includes(j)}
                              onChange={(e) =>
                                toggleSearchTarget(
                                  i,
                                  'others',
                                  j,
                                  e.currentTarget.checked,
                                )
                              }
                            />
                            その他{j + 1}（{copies}枚）
                          </label>
                        ))}
                        <p class="field-note">
                          選んだ候補から最大{source.draw}
                          {source.search.unit === 'types' ? '種類' : '枚'}
                          。残りが少なければ残っている分だけ加えます。
                          {source.search.unit === 'types' &&
                            '各登録グループを1種類として、1種類につき1枚加えます。別名のカードは分けて登録してください。'}
                        </p>
                      </fieldset>
                    )}
                  </div>
                ))}
              </div>
              {!activeSources.length && (
                <div class="empty-sources">
                  通常ドローだけで計算しています。
                  <br />
                  ソースを追加して、確率の変化を見てみましょう。
                </div>
              )}
              <button
                type="button"
                class="add-button"
                disabled={config.sources.length >= 5}
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    sources: [
                      ...c.sources,
                      {
                        cost: 2,
                        draw: 2,
                        copies: 3,
                        keep: 3,
                        enabled: true,
                      },
                    ],
                  }))
                }
              >
                <Icon name="plus" size={16} />
                ドローソースを追加
              </button>
              {(config.sources.some((s) => s.kind === 'search') ||
                Boolean(config.searchOthers?.length)) && (
                <div class="search-others">
                  <h3>その他のサーチ候補</h3>
                  <p class="field-note">
                    対象・ソース以外の候補です。同じグループを複数のサーチで選ぶと、残り枚数を共有します。グループ同士に同じカードを重複登録しないでください。
                  </p>
                  {(config.searchOthers ?? []).map((copies, j) => (
                    <div class="search-other-row" key={j}>
                      <NumberField
                        id={`search-other-${j}-copies`}
                        label={`その他${j + 1}の採用枚数`}
                        value={copies}
                        min={1}
                        max={40}
                        suffix="枚"
                        onChange={(copies) =>
                          setConfig((c) => ({
                            ...c,
                            searchOthers: c.searchOthers!.map((n, k) =>
                              k === j ? copies : n,
                            ),
                          }))
                        }
                      />
                      <button
                        type="button"
                        class="icon-button"
                        aria-label={`その他${j + 1}を削除`}
                        onClick={() =>
                          setConfig((c) => removeSearchOther(c, j))
                        }
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    class="add-button"
                    disabled={(config.searchOthers?.length ?? 0) >= 3}
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        searchOthers: [...(c.searchOthers ?? []), 3],
                      }))
                    }
                  >
                    <Icon name="plus" size={16} />
                    その他の候補を追加
                  </button>
                </div>
              )}
              <div class="deck-summary">
                <span>
                  デッキ <strong>40</strong>枚
                </span>
                <span>
                  対象 {config.target.copies} / ソース {sourceCopies} /{' '}
                  {otherCopies > 0 && <>候補 {otherCopies} / </>}その他{' '}
                  {Math.max(
                    0,
                    40 - config.target.copies - sourceCopies - otherCopies,
                  )}
                </span>
              </div>
              {configError && (
                <p class="field-note negative" role="alert">
                  {configError}
                </p>
              )}
            </section>
            <section class="panel extra-panel">
              <SectionTitle number="03">エクストラPP</SectionTitle>
              <label class="select-label" for="extra-policy">
                後攻での使用方針
              </label>
              <select
                id="extra-policy"
                value={config.extra}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    extra: e.currentTarget.value as Config['extra'],
                  }))
                }
              >
                <option value="greedy">引ける枚数が増えるときに使う</option>
                <option value="reserve">目標ターンまで温存する</option>
              </select>
              <p class="field-note">
                5ターン以内に1回。対象カードの使用に必要な場合は、どちらの方針でも温存します。
              </p>
              <button
                type="button"
                class="help-link"
                onClick={() => extraHelp.current?.showModal()}
              >
                方針の説明
              </button>
            </section>
            <p class={`save-note ${saved ? '' : 'negative'}`}>
              {configError
                ? '条件を修正すると自動保存されます'
                : saved
                  ? '✓ 入力条件はこのブラウザに自動保存されます'
                  : '入力を保存できません。このタブ内では計算できます。'}
            </p>
          </aside>
          <div class="results-column">
            <section
              class="panel results-panel"
              aria-labelledby="results-heading"
            >
              <div class="results-heading">
                <div>
                  <h2 id="results-heading">{config.turn}ターン目の到達確率</h2>
                </div>
                <button
                  type="button"
                  class="pin-button"
                  disabled={!result}
                  onClick={() =>
                    result && setPinned(structuredClone({ config, result }))
                  }
                >
                  <Icon name="pin" size={16} />
                  {pinned ? '固定を更新' : '比較用に固定'}
                </button>
              </div>
              <p class="result-definition">
                対象カードを手札に確保し、使用コストも残せる確率
              </p>
              <div class="stat-grid">
                {(['front', 'back'] as const).map((side) => {
                  const current = row?.[`${side}${keep ? 'Keep' : 'Exchange'}`];
                  const old = pinRow?.[`${side}${keep ? 'Keep' : 'Exchange'}`];
                  return (
                    <div class={`stat-card ${side}`} key={side}>
                      <div class="stat-label">
                        <span>
                          <i class={`dot ${side}`} />
                          {side === 'front' ? '先攻' : '後攻'}
                        </span>
                        {side === 'back' && (
                          <span class="extra-tag">EX PP</span>
                        )}
                      </div>
                      <div class="stat-value">
                        {current === undefined ? (
                          <span class="placeholder">—</span>
                        ) : (
                          <>
                            {(current * 100).toFixed(2)}
                            <small>%</small>
                          </>
                        )}
                      </div>
                      <div class="stat-difference">
                        {current !== undefined && old !== undefined ? (
                          <>
                            <span
                              class={current >= old ? 'positive' : 'negative'}
                            >
                              {difference(current, old)}
                            </span>
                            <span>固定 {percent(old)}</span>
                          </>
                        ) : (
                          <span>
                            {keep ? '指定ソースを残す' : '対象がなければ全交換'}
                          </span>
                        )}
                      </div>
                      <div class="other-policy">
                        <span>{keep ? 'すべて交換' : '指定を残す'}</span>
                        <strong>
                          {row
                            ? percent(
                                row[`${side}${keep ? 'Exchange' : 'Keep'}`],
                              )
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div class="calculation-status" role="status" aria-live="polite">
                {busy ? (
                  <>
                    <span class="spinner" />
                    {calculation.status === 'waiting'
                      ? '入力を反映しています…'
                      : `計算中… ${calculation.completed} / 5ターン`}
                    <button type="button" onClick={calculation.cancel}>
                      中止
                    </button>
                  </>
                ) : calculation.status === 'done' ? (
                  <>
                    <span class="status-dot" />
                    計算完了
                    <span class="status-detail">
                      全分岐を集計 · {(result!.ms / 1000).toFixed(2)}秒
                    </span>
                  </>
                ) : (
                  <>
                    <span class="negative">
                      {calculation.error ?? '計算を中止しました。'}
                    </span>
                    {calculation.status !== 'invalid' && (
                      <button type="button" onClick={calculation.retry}>
                        再計算
                      </button>
                    )}
                  </>
                )}
              </div>
              {pinned && (
                <div class="pinned-panel">
                  <div class="pinned-top">
                    <span>
                      <Icon name="pin" size={14} />
                      比較条件を固定中
                    </span>
                    <button
                      type="button"
                      class="text-button"
                      onClick={() => setPinned(null)}
                    >
                      解除
                    </button>
                  </div>
                  <details>
                    <summary>
                      対象{pinned.config.target.copies}枚・
                      {pinned.config.target.cost}PP / ソース 有効
                      {enabledSources(pinned.config).length} / 登録
                      {pinned.config.sources.length}種類<span>条件を見る</span>
                    </summary>
                    <ConfigSummary config={pinned.config} />
                  </details>
                </div>
              )}
              <div class="visualization-heading">
                <h3>ターンごとの確率</h3>
                <div
                  class="view-tabs"
                  role="tablist"
                  aria-label="結果の表示形式"
                >
                  {(['chart', 'table'] as const).map((t) => (
                    <button
                      key={t}
                      id={`${t}-tab`}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      aria-controls="visualization-panel"
                      tabIndex={tab === t ? 0 : -1}
                      onKeyDown={(e) => {
                        if (
                          e.key === 'ArrowLeft' ||
                          e.key === 'ArrowRight' ||
                          e.key === 'Home' ||
                          e.key === 'End'
                        ) {
                          e.preventDefault();
                          const next =
                            e.key === 'Home'
                              ? 'chart'
                              : e.key === 'End'
                                ? 'table'
                                : t === 'chart'
                                  ? 'table'
                                  : 'chart';
                          setTab(next);
                          document.getElementById(`${next}-tab`)?.focus();
                        }
                      }}
                      onClick={() => setTab(t)}
                    >
                      <Icon name={t} size={15} />
                      {t === 'chart' ? 'グラフ' : '表'}
                    </button>
                  ))}
                </div>
              </div>
              <div class="policy-picker">
                <span>初手交換</span>
                <div>
                  <button
                    type="button"
                    aria-pressed={keep}
                    onClick={() => setKeep(true)}
                  >
                    指定を残す
                  </button>
                  <button
                    type="button"
                    aria-pressed={!keep}
                    onClick={() => setKeep(false)}
                  >
                    すべて交換
                  </button>
                </div>
              </div>
              <div
                id="visualization-panel"
                role="tabpanel"
                aria-labelledby={`${tab}-tab`}
                aria-busy={busy}
              >
                {result ? (
                  tab === 'chart' ? (
                    <Chart
                      result={result}
                      pinned={pinned}
                      keep={keep}
                      turn={config.turn}
                      onTurn={setTurn}
                    />
                  ) : (
                    <ProbabilityTables
                      result={result}
                      pinned={pinned}
                      keep={keep}
                      turn={config.turn}
                      onTurn={setTurn}
                    />
                  )
                ) : (
                  <div class="chart-placeholder">
                    <Icon name="chart" size={36} />
                    <p>
                      {busy
                        ? '計算結果を準備しています'
                        : '条件を調整して再計算できます'}
                    </p>
                  </div>
                )}
              </div>
              <p class="chart-note">
                各ターンを独立した目標として計算。目標ターンに合わせてPPの使い方が変わります。
              </p>
            </section>
            <section class="assumptions panel">
              <div class="assumption-heading">
                <span class="info-icon">i</span>
                <h2>この計算の前提</h2>
              </div>
              <p>
                ドローと対象カードにPPを優先する場合の確率です。
                <strong>手札上限は考慮しません。</strong>
              </p>
              <details>
                <summary>プレイ方針・対応範囲を確認する</summary>
                <ul>
                  <li>
                    40枚デッキ、初手4枚、先攻・後攻とも各ターン1枚ドロー。
                  </li>
                  <li>
                    初手に対象があれば保持。対象がない場合に「指定枚数までソースを残す」と「すべて交換」を比較します。交換するカードは引き直し後に山札へ戻します。
                  </li>
                  <li>
                    手札から、残りPP内で合計ドロー枚数が最大の組み合わせを選びます。同点なら低い合計コストを優先。組み合わせ内は低コスト、多ドロー、登録順で使用し、1枚使うたびに選び直します。
                  </li>
                  <li>
                    対象カードは目標ターンに使用。必要なPPを確保し、対象を引いたら追加のドローソースは使いません。効果解決中や目標ターンまでの通常ドローでの山札切れは失敗です。
                  </li>
                  <li>
                    エクストラPPは後攻で1回。6ターン目の再使用は今回の範囲外です。温存方針の違いで成功率も変わり、未来の引きを含めた最適化はしません。
                  </li>
                  <li>
                    サーチの「枚」は同名カードを複数枚取得でき、「種類」は異なるカード名を各1枚取得します。残り枚数に比例して1枚ずつ抽選し、「種類」ではそのサーチ中に選んだ種類を候補から外します。通常ドローで候補を引いた場合も残り枚数が減ります。無効なソースはサーチ対象からも外します。候補0枚のサーチは使いません。
                  </li>
                  <li>
                    ドローとサーチは取得枚数を基準に使用します。サーチは現在の候補残数を上限とし、効果を1回使うたびに選び直します。候補が重なる複数サーチの将来の取得枚数や成功率を最適化するものではありません。
                  </li>
                  <li>
                    対象とドローソースは別カードとして登録してください。盤面、相手の行動、PPブースト、進化、条件付き効果、コスト変動は扱いません。フォロワーも固定コストの即時効果として抽象化します。
                  </li>
                  <li>
                    表示はモデル内の全分岐から求めた確率です（浮動小数点の丸めあり）。抽選シミュレーションの推定値ではありません。
                  </li>
                </ul>
                <a
                  href="https://shadowverse-wb.com/ja/help/?tab=tab0"
                  target="_blank"
                  rel="noreferrer"
                >
                  公式ヘルプでルールを確認 <Icon name="arrow" size={14} />
                </a>
              </details>
            </section>
          </div>
        </div>
      </main>
      <dialog
        ref={extraHelp}
        class="extra-help"
        aria-labelledby="extra-help-title"
      >
        <h2 id="extra-help-title">エクストラPPの使用方針</h2>
        <h3>引ける枚数が増えるときに使う</h3>
        <p>
          エクストラPPを足すことで、今の手札から引ける枚数が増える場合に使います。
        </p>
        <p class="help-example">
          例：目標が5ターン目で、対象が3PPの場合。2ターン目に「3PPで2枚引く」ソースがあれば、エクストラPPを使ってプレイします。
        </p>
        <h3>目標ターンまで温存する</h3>
        <p>目標ターンより前には使わず、目標ターンに必要なら使います。</p>
        <p class="help-example">
          例：目標が5ターン目なら、2ターン目に上のソースがあっても温存します。5ターン目に、対象の使用や追加のドローに必要なら使います。
        </p>
        <h3>共通のルール</h3>
        <p>
          後攻のみ、今回の計算範囲（1〜5ターン）では1回使えます。目標ターンには対象カードを使うPPを確保します。5ターン目に6PPの対象を使う設定なら、どちらの方針でも目標ターンまで温存します。
        </p>
        <p>
          未来に引くカードまで予測して、成功率が最大になる使い方を選ぶ計算ではありません。
        </p>
        <form method="dialog">
          <button type="submit" autoFocus>
            閉じる
          </button>
        </form>
      </dialog>
      <footer>
        <PwaNotice />
        <p>
          <a href="./LICENSE.txt">MITライセンス</a> ·{' '}
          <a href="./licenses.md">第三者ライセンス</a>
        </p>
        <span>SVWB ドロー確率計算</span>
        <p>
          非公式の確率計算ツールです。ゲーム内の勝率を示すものではありません。
        </p>
      </footer>
      <a class="mobile-result-bar" href="#results-heading">
        <span>
          {config.turn}T <small>{keep ? '指定を残す' : 'すべて交換'}</small>
        </span>
        <span>
          <i class="dot front" />
          先攻{' '}
          <strong>
            {row ? percent(row[keep ? 'frontKeep' : 'frontExchange']) : '—'}
          </strong>
        </span>
        <span>
          <i class="dot back" />
          後攻{' '}
          <strong>
            {row ? percent(row[keep ? 'backKeep' : 'backExchange']) : '—'}
          </strong>
        </span>
        <span class="jump-label">結果へ ↓</span>
      </a>
    </InputValidity.Provider>
  );
}

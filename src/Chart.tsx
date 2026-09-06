import type { Result, SeriesKey, Snapshot } from './types';

export const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
export const difference = (current: number, previous: number) => {
  const points = (current - previous) * 100;
  return `${Math.abs(points) < 0.005 ? '±' : points > 0 ? '+' : '−'}${Math.abs(points).toFixed(2)} pt`;
};

interface Props {
  result: Result;
  pinned: Snapshot | null;
  keep: boolean;
  turn: number;
  onTurn: (turn: number) => void;
}

export function Chart({ result, pinned, keep, turn, onTurn }: Props) {
  const series: { key: SeriesKey; color: string; name: string }[] = [
    {
      key: keep ? 'frontKeep' : 'frontExchange',
      color: '#7655ce',
      name: '先攻',
    },
    { key: keep ? 'backKeep' : 'backExchange', color: '#168a84', name: '後攻' },
  ];
  const x = (t: number) => 54 + (t - 1) * 123;
  const y = (p: number) => 234 - p * 208;
  return (
    <div class="chart-wrap">
      <div class="legend">
        <span>
          <i class="dot front" />
          先攻
        </span>
        <span>
          <i class="dot back" />
          後攻
        </span>
        {pinned && <span class="pinned-legend">┄ 固定した条件</span>}
      </div>
      <svg
        class="chart"
        viewBox="0 0 584 268"
        role="img"
        aria-labelledby="chart-title chart-desc"
      >
        <title id="chart-title">ターンごとの対象カード使用確率</title>
        <desc id="chart-desc">
          {keep ? '指定したドローソースを残す' : '対象がなければすべて交換する'}
          方針。
          {result.rows
            .map(
              (row) =>
                `${row.turn}ターン目、先攻${percent(row[series[0].key])}、後攻${percent(row[series[1].key])}`,
            )
            .join('。')}
          。各ターンを独立した目標として計算しています。
        </desc>
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#7655ce" stop-opacity=".11" />
            <stop offset="100%" stop-color="#7655ce" stop-opacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line
              x1="54"
              x2="546"
              y1={y(p)}
              y2={y(p)}
              stroke="#e7e8f0"
              stroke-dasharray={p ? '3 5' : undefined}
            />
            <text x="40" y={y(p) + 5} text-anchor="end" class="axis-label">
              {p * 100}
              {p === 1 ? '%' : ''}
            </text>
          </g>
        ))}
        <path
          d={`M54,234 ${result.rows.map((row) => `L${x(row.turn)},${y(row[series[0].key])}`).join(' ')} L546,234 Z`}
          fill="url(#area)"
        />
        <line
          x1={x(turn)}
          x2={x(turn)}
          y1="20"
          y2="234"
          stroke="#bab4d3"
          stroke-dasharray="4 5"
        />
        {series.map((s) => (
          <g key={s.key}>
            {pinned && (
              <polyline
                points={pinned.result.rows
                  .map((row) => `${x(row.turn)},${y(row[s.key])}`)
                  .join(' ')}
                fill="none"
                stroke={s.color}
                opacity=".5"
                stroke-width="2"
                stroke-dasharray="6 5"
              />
            )}
            <polyline
              points={result.rows
                .map((row) => `${x(row.turn)},${y(row[s.key])}`)
                .join(' ')}
              fill="none"
              stroke={s.color}
              stroke-width="3"
              stroke-linejoin="round"
            />
            {result.rows.map((row) => (
              <circle
                key={row.turn}
                cx={x(row.turn)}
                cy={y(row[s.key])}
                r={row.turn === turn ? 6 : 4}
                fill="white"
                stroke={s.color}
                stroke-width={row.turn === turn ? 3 : 2}
              />
            ))}
          </g>
        ))}
        {result.rows.map((row) => (
          <text
            key={row.turn}
            x={x(row.turn)}
            y="259"
            text-anchor="middle"
            class="axis-label"
          >
            {row.turn}T
          </text>
        ))}
      </svg>
      <div class="chart-turns" aria-label="グラフの目標ターン">
        {result.rows.map((row) => (
          <button
            key={row.turn}
            type="button"
            aria-pressed={turn === row.turn}
            onClick={() => onTurn(row.turn)}
          >
            {row.turn}T
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProbabilityTables({
  result,
  pinned,
  keep,
  turn,
  onTurn,
}: Props) {
  return (
    <div class="tables">
      {(['front', 'back'] as const).map((side) => {
        const key: SeriesKey = `${side}${keep ? 'Keep' : 'Exchange'}`;
        return (
          <table key={side}>
            <caption>
              <i class={`dot ${side}`} />
              {side === 'front' ? '先攻' : '後攻'}
            </caption>
            <thead>
              <tr>
                <th scope="col">ターン</th>
                <th scope="col">現在</th>
                {pinned && (
                  <>
                    <th scope="col">固定</th>
                    <th scope="col">差</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr
                  key={row.turn}
                  class={row.turn === turn ? 'selected-row' : ''}
                >
                  <th scope="row">
                    <button
                      type="button"
                      aria-label={`${side === 'front' ? '先攻' : '後攻'} ${row.turn}ターン目を選択`}
                      aria-pressed={row.turn === turn}
                      onClick={() => onTurn(row.turn)}
                    >
                      {row.turn}T
                    </button>
                  </th>
                  <td>{percent(row[key])}</td>
                  {pinned && (
                    <>
                      <td class="muted">
                        {percent(pinned.result.rows[i][key])}
                      </td>
                      <td
                        class={
                          row[key] >= pinned.result.rows[i][key]
                            ? 'positive'
                            : 'negative'
                        }
                      >
                        {difference(row[key], pinned.result.rows[i][key])}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

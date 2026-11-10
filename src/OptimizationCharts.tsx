import { useMemo, useState } from "react";
import {
  connectedSegments,
  utcDay,
  type DirectionKey,
  type optimizationStatistics,
} from "./optimization";
type Stats = ReturnType<typeof optimizationStatistics>;
export type TrendMode = "count" | "share";
const percent = (v: number | null) => (v === null ? "—" : v.toFixed(1) + "%");
export function DirectionPie({
  stats,
  focus,
  onFocus,
}: {
  stats: Stats;
  focus: DirectionKey | null;
  onFocus: (key: DirectionKey | null) => void;
}) {
  let offset = 0;
  const slices = stats.directions
    .filter((d) => d.count > 0)
    .map((d) => {
      const slice = { ...d, length: (d.count / stats.total) * 100, offset };
      offset += slice.length;
      return slice;
    });
  return (
    <section className="chart-panel direction-pie-panel">
      <div className="chart-heading">
        <div>
          <h2>累计 PR 方向占比</h2>
          <p>按一级标题分类 · 同一 PR 只计一次</p>
        </div>
        <span className="chart-unit">{stats.total} 个 PR</span>
      </div>
      {stats.total ? (
        <div className="direction-pie-body">
          <div className="direction-donut">
            <svg
              viewBox="0 0 160 160"
              role="img"
              aria-label={slices
                .map(
                  (s) =>
                    s.label + " " + s.count + " 个，占 " + percent(s.share),
                )
                .join("；")}
            >
              <circle
                cx="80"
                cy="80"
                r="58"
                fill="none"
                stroke="#eef2ee"
                strokeWidth="19"
              />
              {slices.map((s) => (
                <circle
                  key={s.key}
                  cx="80"
                  cy="80"
                  r="58"
                  pathLength="100"
                  fill="none"
                  stroke={s.color}
                  strokeWidth={focus === s.key ? 22 : 19}
                  strokeDasharray={s.length + " " + (100 - s.length)}
                  strokeDashoffset={-s.offset}
                  transform="rotate(-90 80 80)"
                  opacity={focus && focus !== s.key ? 0.4 : 1}
                  onClick={() => onFocus(focus === s.key ? null : s.key)}
                  style={{ cursor: "pointer" }}
                >
                  <title>
                    {s.label}：{s.count} 个（{percent(s.share)}）
                  </title>
                </circle>
              ))}
            </svg>
            <div className="donut-label">
              <strong>{stats.total}</strong>
              <span>累计真实 PR</span>
            </div>
          </div>
          <div className="direction-pie-legend">
            {slices.map((s) => (
              <button
                key={s.key}
                className={focus === s.key ? "selected" : ""}
                aria-pressed={focus === s.key}
                onClick={() => onFocus(focus === s.key ? null : s.key)}
                title={"查看" + s.label + "的 PR"}
              >
                <i style={{ background: s.color }} />
                <span>
                  <strong>{s.label}</strong>
                  <small>
                    {s.count} 个 PR
                    {s.tentative ? " · " + s.tentative + " 项分类待核实" : ""}
                  </small>
                </span>
                <b>{percent(s.share)}</b>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="chart-no-data">所选范围暂无真实 PR。</div>
      )}
      <p className="chart-footnote">
        点击方向查看对应
        PR；待审核记录包含在内，待分类和分类不一致也保留在分母中。
      </p>
    </section>
  );
}
export function DirectionTrend({
  stats,
  mode,
  onMode,
  focus,
}: {
  stats: Stats;
  mode: TrendMode;
  onMode: (mode: TrendMode) => void;
  focus: DirectionKey | null;
}) {
  const [hidden, setHidden] = useState<DirectionKey[]>([]),
    [hovered, setHovered] = useState("");
  const active = stats.activeDirections.filter((d) => !hidden.includes(d.key));
  const series = stats.series;
  const selected = series.find((d) => d.day === hovered) || series.at(-1);
  const left = 44,
    right = 618,
    top = 22,
    bottom = 204;
  const first = series[0]?.day,
    last = series.at(-1)?.day;
  const range = first && last ? utcDay(last) - utcDay(first) : 0;
  const x = (day: string) =>
    range
      ? left + ((utcDay(day) - utcDay(first!)) / range) * (right - left)
      : (left + right) / 2;
  const max = Math.max(
    0,
    ...series.flatMap((s) =>
      active.map((d) =>
        mode === "share" ? (s.shares[d.key] ?? 0) : s.counts[d.key],
      ),
    ),
  );
  const maximum = mode === "share" ? 100 : Math.max(2, Math.ceil(max * 1.2));
  const y = (value: number) => bottom - (value / maximum) * (bottom - top);
  const ticks =
    maximum <= 5
      ? Array.from({ length: maximum + 1 }, (_, i) => i)
      : [0, maximum / 2, maximum].filter(
          (v) => mode === "share" || Number.isInteger(v),
        );
  const xTicks = series.filter(
    (_, i) =>
      series.length <= 5 ||
      i === 0 ||
      i === series.length - 1 ||
      i % Math.ceil(series.length / 4) === 0,
  );
  const pointValues = useMemo(
    () =>
      active.map((d) => ({
        ...d,
        points: series.map((s) => ({
          day: s.day,
          value: mode === "share" ? s.shares[d.key] : s.counts[d.key],
        })),
      })),
    [stats, mode, hidden],
  );
  return (
    <section className="chart-panel direction-trend-panel">
      <div className="chart-heading">
        <div>
          <h2>优化方向变化趋势</h2>
          <p>
            {mode === "share"
              ? "各方向 PR 占当天全部 PR 的比例"
              : "各方向在每个报告日期的 PR 数量"}
          </p>
        </div>
        <div className="chart-toggle" aria-label="趋势显示方式">
          <button
            aria-pressed={mode === "count"}
            className={mode === "count" ? "active" : ""}
            onClick={() => onMode("count")}
          >
            数量
          </button>
          <button
            aria-pressed={mode === "share"}
            className={mode === "share" ? "active" : ""}
            onClick={() => onMode("share")}
          >
            占比
          </button>
        </div>
      </div>
      {series.length && stats.activeDirections.length ? (
        <>
          <div className="direction-trend-legend">
            {stats.activeDirections.map((d) => (
              <button
                key={d.key}
                className={hidden.includes(d.key) ? "hidden-series" : ""}
                aria-pressed={!hidden.includes(d.key)}
                onClick={() =>
                  setHidden(
                    hidden.includes(d.key)
                      ? hidden.filter((k) => k !== d.key)
                      : [...hidden, d.key],
                  )
                }
              >
                <i style={{ background: d.color }} />
                {d.label}
              </button>
            ))}
          </div>
          <div className="trend-svg-wrap">
            <svg
              viewBox="0 0 640 240"
              role="group"
              aria-label={
                "各优化方向" +
                (mode === "share" ? "占比" : "数量") +
                "趋势，" +
                series.length +
                "个已交付报告日期"
              }
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={left}
                    y1={y(t)}
                    x2={right}
                    y2={y(t)}
                    stroke="#e4ebe5"
                    strokeDasharray={t === 0 ? "0" : "3 4"}
                  />
                  <text
                    x={left - 11}
                    y={y(t) + 3}
                    textAnchor="end"
                    className="svg-axis"
                  >
                    {t}
                    {mode === "share" ? "%" : ""}
                  </text>
                </g>
              ))}
              {xTicks.map((s) => (
                <text
                  key={s.day}
                  x={x(s.day)}
                  y={bottom + 23}
                  textAnchor="middle"
                  className="svg-axis"
                >
                  {s.day.slice(5)}
                </text>
              ))}
              {pointValues.map((d, index) => (
                <g key={d.key} opacity={focus && focus !== d.key ? 0.22 : 1}>
                  {connectedSegments(d.points)
                    .filter((segment) => segment.length > 1)
                    .map((segment, i) => (
                      <path
                        key={i}
                        d={segment
                          .map(
                            (p, j) =>
                              (j ? "L" : "M") + x(p.day) + " " + y(p.value!),
                          )
                          .join(" ")}
                        fill="none"
                        stroke={d.color}
                        strokeWidth={focus === d.key ? 3 : 2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ))}
                  {d.points
                    .filter((p) => p.value !== null)
                    .map((p) => (
                      <circle
                        key={p.day}
                        cx={x(p.day)}
                        cy={y(p.value!)}
                        r={
                          series.length === 1
                            ? 4 + (active.length - index - 1) * 2.5
                            : 4
                        }
                        fill="white"
                        stroke={d.color}
                        strokeWidth="2.5"
                        tabIndex={0}
                        role="button"
                        aria-label={
                          p.day +
                          " " +
                          d.label +
                          " " +
                          (mode === "share"
                            ? percent(p.value)
                            : p.value + " 个 PR")
                        }
                        onMouseEnter={() => setHovered(p.day)}
                        onFocus={() => setHovered(p.day)}
                        onClick={() => setHovered(p.day)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setHovered(p.day);
                          }
                        }}
                      >
                        <title>
                          {p.day} · {d.label}：
                          {mode === "share"
                            ? percent(p.value)
                            : p.value + " 个"}
                        </title>
                      </circle>
                    ))}
                </g>
              ))}
            </svg>
            {!active.length && (
              <div className="trend-select-prompt">
                请选择至少一个方向显示。
              </div>
            )}
          </div>
          {series.length < 2 && (
            <div className="single-period-note">
              目前只有 {series[0].day}{" "}
              一个日期，先显示真实数据点；尚不能判断变化趋势。
            </div>
          )}
          {selected && (
            <div className="trend-readout">
              <strong>
                {selected.day}
                <span>当日 {selected.total} 个 PR</span>
              </strong>
              <div>
                {active.map((d) => (
                  <span key={d.key}>
                    <i style={{ background: d.color }} />
                    {d.label}
                    <b>
                      {mode === "share"
                        ? percent(selected.shares[d.key])
                        : selected.counts[d.key] + " 个"}
                    </b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="chart-no-data">所选范围暂无可绘制的真实方向数据。</div>
      )}
      <p className="chart-footnote">
        按报告日期统计，日期内去重；缺少日报的日期不补零、折线断开。占比分母含当天待分类
        PR。
      </p>
    </section>
  );
}

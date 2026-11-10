import { directionDefinitions, type DirectionKey } from "../optimization";
import type { wordStatistics } from "./word-statistics";

type Distribution = Pick<
  ReturnType<typeof wordStatistics>,
  "total" | "directions"
>;
export type DistributionMode = "overall" | "compare";
export const communitySources = [
  { key: "github:vllm-project/vllm", label: "vLLM" },
  { key: "github:vllm-project/vllm-ascend", label: "vLLM Ascend" },
] as const;
const percent = (value: number | null) =>
  value === null ? "—" : value.toFixed(1) + "%";

function Ring({
  stats,
  label,
  focus,
  onFocus,
}: {
  stats: Distribution;
  label: string;
  focus: DirectionKey | null;
  onFocus: (direction: DirectionKey | null) => void;
}) {
  let offset = 0;
  const slices = stats.directions
    .filter((d) => d.count > 0)
    .map((d) => {
      const length = stats.total ? (d.count / stats.total) * 100 : 0;
      const slice = { ...d, length, offset };
      offset += length;
      return slice;
    });
  return (
    <div className="direction-donut">
      <svg
        viewBox="0 0 160 160"
        role="img"
        aria-label={`${label}：${stats.total} 个关联 PR。${slices.map((d) => `${d.label} ${d.count} 个，占 ${percent(d.share)}`).join("；")}`}
      >
        <circle
          cx="80"
          cy="80"
          r="58"
          fill="none"
          stroke="#eef2ee"
          strokeWidth="19"
        />
        {slices.map((d) => (
          <circle
            key={d.key}
            cx="80"
            cy="80"
            r="58"
            pathLength="100"
            fill="none"
            stroke={d.color}
            strokeWidth={focus === d.key ? 22 : 19}
            strokeDasharray={`${d.length} ${100 - d.length}`}
            strokeDashoffset={-d.offset}
            transform="rotate(-90 80 80)"
            opacity={focus && focus !== d.key ? 0.4 : 1}
            onClick={() => onFocus(focus === d.key ? null : d.key)}
            style={{ cursor: "pointer" }}
          >
            <title>
              {label} · {d.label}：{d.count} 个（{percent(d.share)}）
            </title>
          </circle>
        ))}
      </svg>
      <div className="donut-label">
        <strong>{stats.total}</strong>
        <span>关联 PR</span>
      </div>
    </div>
  );
}

export default function DirectionDistribution({
  stats,
  communities,
  mode,
  onMode,
  focus,
  onFocus,
}: {
  stats: Distribution;
  communities: { key: string; label: string; stats: Distribution }[];
  mode: DistributionMode;
  onMode: (mode: DistributionMode) => void;
  focus: DirectionKey | null;
  onFocus: (direction: DirectionKey | null) => void;
}) {
  const directions = stats.directions.filter((d) => d.count > 0);
  const shared = directionDefinitions.filter((d) =>
    communities.some((c) =>
      c.stats.directions.some((s) => s.key === d.key && s.count > 0),
    ),
  );
  return (
    <section className="chart-panel direction-distribution-panel">
      <div className="chart-heading">
        <div>
          <h2>累计 PR 方向占比</h2>
          <p>
            {mode === "compare"
              ? "两个社区分别计算占比 · 共用分类与颜色"
              : "按一级标题分类 · 同一 PR 只计一次"}
          </p>
        </div>
        <div className="chart-toggle" role="group" aria-label="分布显示方式">
          <button
            type="button"
            aria-pressed={mode === "overall"}
            className={mode === "overall" ? "active" : ""}
            onClick={() => onMode("overall")}
          >
            整体
          </button>
          <button
            type="button"
            aria-pressed={mode === "compare"}
            className={mode === "compare" ? "active" : ""}
            onClick={() => onMode("compare")}
          >
            社区对比
          </button>
        </div>
      </div>
      {mode === "compare" ? (
        <>
          <div className="community-donuts">
            {communities.map((c) => (
              <figure key={c.key} className="community-donut-card">
                <figcaption>{c.label}</figcaption>
                <Ring
                  stats={c.stats}
                  label={c.label}
                  focus={focus}
                  onFocus={onFocus}
                />
                {!c.stats.total && (
                  <p className="community-no-data">当前范围无可统计 PR</p>
                )}
              </figure>
            ))}
          </div>
          <div className="community-shared-legend">
            <div className="community-legend-head">
              <span>一级标题</span>
              {communities.map((c) => (
                <span key={c.key}>{c.label}</span>
              ))}
            </div>
            {shared.map((d) => (
              <button
                type="button"
                key={d.key}
                className={focus === d.key ? "selected" : ""}
                aria-pressed={focus === d.key}
                title={`突出${d.label}的趋势`}
                onClick={() => onFocus(focus === d.key ? null : d.key)}
              >
                <span className="community-legend-name">
                  <i style={{ background: d.color }} />
                  <span>{d.label}</span>
                </span>
                {communities.map((c) => {
                  const row = c.stats.directions.find((s) => s.key === d.key)!;
                  return (
                    <span key={c.key} className="community-legend-value">
                      <b>{percent(row.share)}</b>
                      <small>{row.count} 个 PR</small>
                    </span>
                  );
                })}
              </button>
            ))}
            {!shared.length && (
              <p className="chart-no-data">所选范围暂无可统计的方向数据。</p>
            )}
          </div>
          <p className="community-comparison-note">
            两个图使用相同日期范围，各以本社区的 PR 总数为分母。
          </p>
        </>
      ) : stats.total ? (
        <div className="direction-pie-body">
          <Ring
            stats={stats}
            label="当前来源"
            focus={focus}
            onFocus={onFocus}
          />
          <div className="direction-pie-legend">
            {directions.map((d) => (
              <button
                key={d.key}
                type="button"
                className={focus === d.key ? "selected" : ""}
                aria-pressed={focus === d.key}
                title={`突出${d.label}的趋势`}
                onClick={() => onFocus(focus === d.key ? null : d.key)}
              >
                <i style={{ background: d.color }} />
                <span>
                  <strong>{d.label}</strong>
                  <small>
                    {d.count} 个 PR
                    {d.tentative ? ` · ${d.tentative} 项分类待核实` : ""}
                  </small>
                </span>
                <b>{percent(d.share)}</b>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="chart-no-data">所选范围暂无可统计的 PR。</p>
      )}
      <p className="chart-footnote">
        点击方向突出对应趋势，再次点击恢复全部方向；待审核、待分类和分类不一致记录均保留在统计中。
      </p>
    </section>
  );
}

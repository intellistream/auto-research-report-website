import { useSearchParams } from "react-router-dom";
import type { IndexedPR } from "./InferenceMap";
import {
  communitySources,
  directionDistribution,
  type Distribution,
} from "./direction-distribution";
import "./direction-distribution.css";

const percent = (value: number | null) =>
  value === null ? "—" : value.toFixed(1) + "%";

function Ring({ stats, label }: { stats: Distribution; label: string }) {
  let offset = 0;
  const slices = stats.directions
    .filter((d) => d.count > 0)
    .map((d) => {
      const length = (d.count / stats.total) * 100;
      const slice = { ...d, length, offset };
      offset += length;
      return slice;
    });
  return (
    <figure className="distribution-community">
      <figcaption>{label}</figcaption>
      <div className="distribution-ring">
        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label={`${label}：${stats.total} 个 PR。${slices.map((d) => `${d.label} ${d.count} 个，占 ${percent(d.share)}`).join("；")}`}
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
              strokeWidth="19"
              strokeDasharray={`${d.length} ${100 - d.length}`}
              strokeDashoffset={-d.offset}
              transform="rotate(-90 80 80)"
            >
              <title>
                {label} · {d.label}：{d.count} 个（{percent(d.share)}）
              </title>
            </circle>
          ))}
        </svg>
        <div className="distribution-ring-label">
          <strong>{stats.total}</strong>
          <span>累计 PR</span>
        </div>
      </div>
      {!stats.total && (
        <p className="distribution-empty">当前范围无可统计 PR</p>
      )}
    </figure>
  );
}

export default function DirectionDistribution({
  entries,
}: {
  entries: IndexedPR[];
}) {
  const [query, setQuery] = useSearchParams();
  const source = query.get("source") ?? "";
  const compare = query.get("distribution") === "compare" && !source;
  const stats = directionDistribution(entries);
  const communities = communitySources.map((community) => ({
    ...community,
    stats: directionDistribution(
      entries.filter((entry) => entry.workId.split("#")[0] === community.key),
    ),
  }));
  const groups = compare
    ? communities
    : [
        {
          key: "overall",
          label:
            communitySources.find((community) => community.key === source)
              ?.label ?? "全部来源",
          stats,
        },
      ];
  const directions = stats.directions.filter((d) => d.count > 0);
  function changeMode(comparing: boolean) {
    const next = new URLSearchParams(query);
    if (comparing) {
      next.set("distribution", "compare");
      next.delete("source");
    } else next.delete("distribution");
    setQuery(next, { replace: true });
  }
  return (
    <section
      className="direction-distribution"
      aria-labelledby="direction-distribution-title"
    >
      <div className="distribution-heading">
        <div>
          <h2 id="direction-distribution-title">累计 PR 方向占比</h2>
          <p>
            {compare
              ? "两个社区分别计算占比，共用分类与颜色。"
              : "按当前来源与日期范围，查看各优化方向的累计占比。"}
          </p>
        </div>
        <div
          className="distribution-toggle"
          role="group"
          aria-label="分布显示方式"
        >
          <button
            type="button"
            aria-pressed={!compare}
            onClick={() => changeMode(false)}
          >
            整体
          </button>
          <button
            type="button"
            aria-pressed={compare}
            onClick={() => changeMode(true)}
          >
            社区对比
          </button>
        </div>
      </div>
      <div className={"distribution-layout" + (compare ? " comparing" : "")}>
        <div className="distribution-rings">
          {groups.map((group) => (
            <Ring key={group.key} stats={group.stats} label={group.label} />
          ))}
        </div>
        {directions.length ? (
          <table className="distribution-table">
            <caption className="distribution-sr-only">
              各一级方向的累计 PR 数量与占比
            </caption>
            <thead>
              <tr>
                <th scope="col">一级方向</th>
                {groups.map((group) => (
                  <th key={group.key} scope="col">
                    {group.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {directions.map((direction) => (
                <tr key={direction.key}>
                  <th scope="row">
                    <span>
                      <i style={{ background: direction.color }} />
                      {direction.label}
                    </span>
                  </th>
                  {groups.map((group) => {
                    const row = group.stats.directions.find(
                      (d) => d.key === direction.key,
                    )!;
                    return (
                      <td key={group.key}>
                        <b>{percent(row.share)}</b>
                        <small>{row.count} 个 PR</small>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="distribution-empty" role="status">
            所选范围没有可统计的方向数据。
          </p>
        )}
      </div>
      <p className="distribution-note">
        {compare
          ? "两个图使用相同日期范围，各以本社区的 PR 总数为分母。"
          : "与每日趋势和推理流程共用筛选，同一 PR 按仓库与编号去重。"}
      </p>
    </section>
  );
}

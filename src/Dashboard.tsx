import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  GitPullRequest,
  AlertCircle,
  Database,
  Info,
  ChevronDown,
  X,
} from "lucide-react";
import { loadReport, loadRun } from "./data";
import { realCatalogItems, type ReportSnapshot } from "./statistics";
import {
  optimizationStatistics,
  directionDefinitions,
  type DirectionKey,
} from "./optimization";
import {
  DirectionPie,
  DirectionTrend,
  type TrendMode,
} from "./OptimizationCharts";
import { sourceNames, type Catalog, type CatalogItem } from "./types";
export default function Dashboard({ catalog }: { catalog: Catalog }) {
  const realItems = useMemo(() => realCatalogItems(catalog.items), [catalog]);
  const [state, setState] = useState<{
    snapshots: ReportSnapshot[];
    failed: string[];
    missingRuns: string[];
    loading: boolean;
  }>({ snapshots: [], failed: [], missingRuns: [], loading: true });
  const [params, setParams] = useSearchParams();
  const source = params.get("source") || "",
    from = params.get("from") || params.get("day") || "",
    to = params.get("to") || params.get("day") || "";
  const mode: TrendMode = params.get("metric") === "share" ? "share" : "count";
  const focus = (
    directionDefinitions.some((d) => d.key === params.get("direction"))
      ? params.get("direction")
      : null
  ) as DirectionKey | null;
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };
  const rangeChange = (key: "from" | "to", value: string) => {
    const next = new URLSearchParams(params);
    next.delete("day");
    value ? next.set(key, value) : next.delete(key);
    if (key === "from" && value && to && value > to) next.set("to", value);
    if (key === "to" && value && from && value < from) next.set("from", value);
    setParams(next, { replace: true });
  };
  useEffect(() => {
    let alive = true;
    setState({ snapshots: [], failed: [], missingRuns: [], loading: true });
    Promise.all(
      realItems
        .filter((i) => i.status === "available")
        .map(async (item) => {
          try {
            const report = await loadReport(item);
            let run;
            let missingRun = false;
            try {
              run = await loadRun(item);
            } catch {
              missingRun = true;
            }
            return { snapshot: { item, report, run }, missingRun };
          } catch {
            return { failed: item.id };
          }
        }),
    ).then((results) => {
      if (alive)
        setState({
          snapshots: results.flatMap((r) => (r.snapshot ? [r.snapshot] : [])),
          failed: results.flatMap((r) => (r.failed ? [r.failed] : [])),
          missingRuns: results.flatMap((r) =>
            r.missingRun && r.snapshot ? [r.snapshot.item.id] : [],
          ),
          loading: false,
        });
    });
    return () => {
      alive = false;
    };
  }, [realItems]);
  const stats = useMemo(
    () => optimizationStatistics(state.snapshots, source, from, to),
    [state.snapshots, source, from, to],
  );
  const days = [...new Set(realItems.map((i) => i.day))].sort();
  const active = stats.directions
    .filter((d) => d.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        directionDefinitions.findIndex((d) => d.key === a.key) -
          directionDefinitions.findIndex((d) => d.key === b.key),
    );
  const focused = stats.directions.find((d) => d.key === focus),
    prs = focus ? stats.prs.filter((p) => p.direction === focus) : stats.prs;
  const selectDirection = (key: DirectionKey | null) =>
    change("direction", key || "");
  const shownReports = realItems.filter(
    (i) => (!from || i.day >= from) && (!to || i.day <= to),
  );
  if (state.loading)
    return <div className="loading">正在汇总真实 PR 的一级分类…</div>;
  return (
    <div className="page dashboard optimization-dashboard">
      <div className="page-eyebrow">
        OPTIMIZATION LANDSCAPE <span>一级标题分类 / 真实 PR</span>
      </div>
      <div className="page-heading">
        <div>
          <h1>
            优化方向与趋势<span className="accent">。</span>
          </h1>
          <p>查看各方向的累计占比，以及 PR 数量与占比随时间的变化。</p>
        </div>
        <Link className="button secondary" to="/reports">
          日报档案 <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="dashboard-toolbar">
        <div className="data-origin">
          <span className="live-dot" />
          <strong>真实材料</strong>
          <span>{realItems.length} 份报告版本</span>
        </div>
        <div className="optimization-filters">
          <select
            aria-label="首页统计来源"
            value={source}
            onChange={(e) => change("source", e.target.value)}
          >
            <option value="">全部来源</option>
            <option value="upstream">vLLM</option>
            <option value="ascend">vLLM-Ascend</option>
          </select>
          <select
            aria-label="趋势起始日期"
            value={from}
            onChange={(e) => rangeChange("from", e.target.value)}
          >
            <option value="">起始日期不限</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span>至</span>
          <select
            aria-label="趋势结束日期"
            value={to}
            onChange={(e) => rangeChange("to", e.target.value)}
          >
            <option value="">结束日期不限</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!realItems.length ? (
        <div className="state-box">
          <Database size={30} />
          <h2>尚未接入真实报告</h2>
          <p>接入真实分类与日期数据后显示分布和趋势，首页不使用示例填充。</p>
        </div>
      ) : (
        <>
          <div className="scope-strip">
            <Info size={15} />
            <span>
              当前范围：{days.length === 1 ? days[0] : from || days[0]}
              {days.length > 1 ? " 至 " + (to || days.at(-1)) : ""}{" "}
              的已接入报告；目前仅接入历史试跑材料，不代表当天或全社区完整数据。
            </span>
          </div>
          {(state.failed.length > 0 || state.missingRuns.length > 0) && (
            <div className="notice warning" role="alert">
              <AlertCircle size={17} />
              <span>
                {state.failed.length > 0 &&
                  `${state.failed.length} 份报告未能读取，统计范围不完整。`}
                {state.missingRuns.length > 0 &&
                  `${state.missingRuns.length} 份运行记录缺失，未将其分类或审核标为已确认。`}
              </span>
            </div>
          )}
          {!state.snapshots.length ? (
            <div className="state-box">
              <h2>真实报告尚不可读取</h2>
              <p>请检查交付文件；不会使用示例补造分布。</p>
            </div>
          ) : (
            <>
              <div className="optimization-kpis">
                <div>
                  <span>
                    {state.failed.length ? "已读取 PR" : "累计真实 PR"}
                  </span>
                  <strong>
                    {stats.total}
                    <small>个</small>
                  </strong>
                </div>
                <div>
                  <span>已出现一级方向</span>
                  <strong>
                    {stats.assignedDirections}
                    <small>类</small>
                  </strong>
                </div>
                <div>
                  <span>已覆盖报告日期</span>
                  <strong>
                    {stats.series.length}
                    <small>天</small>
                  </strong>
                </div>
                <div>
                  <span>分类仍待核实</span>
                  <strong>
                    {stats.tentative}
                    <small>项</small>
                  </strong>
                </div>
              </div>
              <div className="optimization-primary-grid">
                <DirectionPie
                  stats={stats}
                  focus={focus}
                  onFocus={selectDirection}
                />
                <DirectionTrend
                  stats={stats}
                  mode={mode}
                  onMode={(value) =>
                    change("metric", value === "count" ? "" : value)
                  }
                  focus={focus}
                />
              </div>
              <section className="chart-panel direction-summary">
                <div className="chart-heading">
                  <div>
                    <h2>方向一览</h2>
                    <p>
                      点击方向查看对应 PR；最近变化仅比较两个连续的报告日期。
                    </p>
                  </div>
                  <span className="badge">
                    {stats.adjacentDates
                      ? stats.previousDay + " → " + stats.latestDay
                      : "暂无可比较的连续日期"}
                  </span>
                </div>
                <div className="direction-table-head">
                  <span>一级标题</span>
                  <span>累计 PR</span>
                  <span>累计占比</span>
                  <span>
                    最近变化{mode === "share" ? "（占比）" : "（数量）"}
                  </span>
                </div>
                {active.length ? (
                  active.map((d) => {
                    const change = stats.changes.find((c) => c.key === d.key)!;
                    const delta =
                      mode === "share" ? change.shareDelta : change.countDelta;
                    return (
                      <button
                        className={
                          "direction-table-row " +
                          (focus === d.key ? "selected" : "")
                        }
                        key={d.key}
                        aria-pressed={focus === d.key}
                        onClick={() =>
                          selectDirection(focus === d.key ? null : d.key)
                        }
                      >
                        <span className="direction-name">
                          <i style={{ background: d.color }} />
                          <span>
                            <strong>{d.label}</strong>
                            {d.tentative > 0 && (
                              <small>
                                {d.tentative} 项分类待核实，仍计入占比
                              </small>
                            )}
                          </span>
                        </span>
                        <strong>{d.count}</strong>
                        <span>{d.share?.toFixed(1)}%</span>
                        <span
                          className={
                            "direction-delta " +
                            (delta && delta > 0
                              ? "up"
                              : delta && delta < 0
                                ? "down"
                                : "")
                          }
                          title={
                            delta === null
                              ? "至少需要两个连续报告日期"
                              : undefined
                          }
                        >
                          {delta === null
                            ? "—"
                            : (delta > 0 ? "+" : "") +
                              (mode === "share"
                                ? delta.toFixed(1) + " 个百分点"
                                : delta + " 个")}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="chart-no-data">
                    所选日期与来源范围没有真实 PR。
                  </div>
                )}
                <p className="chart-footnote">
                  累计按仓库＋PR
                  编号去重；跨日出现可分别进入当日趋势。分类沿用研报一级标题。
                </p>
              </section>
              <section className="chart-panel dashboard-pr-panel">
                <div className="chart-heading">
                  <div>
                    <h2>
                      {focused ? focused.label + " · 对应 PR" : "各方向对应 PR"}{" "}
                      <span className="count-chip">{prs.length}</span>
                    </h2>
                    <p>从分布与趋势回到具体改动，查看正文、条件和原始来源。</p>
                  </div>
                  {focus ? (
                    <button
                      className="text-link"
                      onClick={() => selectDirection(null)}
                    >
                      <X size={13} />
                      全部方向
                    </button>
                  ) : (
                    <Link className="text-link" to="/reports">
                      查看日报 <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
                {prs.length ? (
                  <div className="dashboard-pr-list">
                    {prs.map((pr) => {
                      const direction = stats.directions.find(
                        (d) => d.key === pr.direction,
                      )!;
                      return (
                        <Link
                          key={pr.workId}
                          to={
                            "/reports/" +
                            pr.item.id +
                            (![
                              "unclassified",
                              "classification_conflict",
                            ].includes(pr.direction)
                              ? "?section=" + pr.direction
                              : "")
                          }
                          className="dashboard-pr-row"
                        >
                          <span
                            className="repo-symbol"
                            style={{
                              color: direction.color,
                              background: direction.color + "12",
                            }}
                          >
                            <GitPullRequest size={17} />
                          </span>
                          <span className="pr-detail">
                            <strong>{pr.title}</strong>
                            <small>
                              {sourceNames[pr.source]} · #
                              {pr.workId.split("#")[1]} · {pr.days.join(" / ")}
                            </small>
                          </span>
                          <span
                            className="direction-tag"
                            style={{ color: direction.color }}
                          >
                            {direction.label}
                          </span>
                          {!pr.classificationConfirmed && (
                            <span className="badge amber">分类待核实</span>
                          )}
                          <ArrowUpRight size={16} />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="empty-chapter">
                    这个方向在当前范围没有 PR，可切换其他方向。
                  </p>
                )}
              </section>
            </>
          )}
          <details className="chart-panel optimization-data-notes">
            <summary>
              <span>数据范围与状态</span>
              <small>
                含待核查 {stats.pending} 个 PR · 分析失败{" "}
                {stats.failures ?? "未完整交付"} 个
              </small>
              <ChevronDown size={15} />
            </summary>
            <p>
              待审核和分析失败的 PR
              不因状态被排除。分类按日报第三至第十章的一级标题统计；论文单列、不计入
              PR 占比。尚无一级标题的 PR
              进入“待分类”；多版本一级标题不一致则单列，避免重复计数。
            </p>
            <p>
              未核实与临时分类保留标记。缺少日期不补零；同一天多个报告版本按仓库＋PR
              编号去重。没有连续两天的数据时不计算升降。
            </p>
            <div className="source-summary">
              {stats.sources.map((s) => (
                <span key={s.key}>
                  {s.label}：{s.count} 个 PR
                </span>
              ))}
            </div>
            {shownReports.map((item) => (
              <RealReportLink key={item.id} item={item} />
            ))}
          </details>
        </>
      )}
    </div>
  );
}
function RealReportLink({ item }: { item: CatalogItem }) {
  return (
    <Link to={"/reports/" + item.id} className="real-report-link">
      <span>
        <strong>
          {item.day} · {item.title}
        </strong>
        <small>{item.notice}</small>
      </span>
      <ArrowUpRight size={18} />
    </Link>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, AlertCircle, Info } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { DirectionTrend, type TrendMode } from "../OptimizationCharts";
import { directionDefinitions, type DirectionKey } from "../optimization";
import { readJson, type Catalog, type Report } from "./docx-data";
import {
  selectedVersions,
  validateWordReport,
  wordStatistics,
} from "./word-statistics";
import DirectionDistribution, {
  communitySources,
  type DistributionMode,
} from "./DirectionDistribution";
import "./statistics-overview.css";

function useStatisticsReports(catalog: Catalog, from: string, to: string) {
  const selection = useMemo(
    () => selectedVersions(catalog, from, to),
    [catalog, from, to],
  );
  const signature = JSON.stringify(selection);
  const [state, setState] = useState<{
    signature: string;
    reports: Report[];
    failed: string[];
  }>();
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      selection.map(async ({ day, version }) => {
        try {
          if (!version) throw new Error("目录缺少当前版本");
          const data = await readJson<unknown>(version.path, controller.signal);
          return { report: validateWordReport(data, day, version) };
        } catch {
          return { failed: day };
        }
      }),
    ).then((results) => {
      if (!controller.signal.aborted)
        setState({
          signature,
          reports: results.flatMap((r) => (r.report ? [r.report] : [])),
          failed: results.flatMap((r) => (r.failed ? [r.failed] : [])),
        });
    });
    return () => controller.abort();
  }, [selection, signature]);
  return state?.signature === signature ? state : undefined;
}

export default function StatisticsOverview({ catalog }: { catalog: Catalog }) {
  const [params, setParams] = useSearchParams();
  const source = params.get("source") || "",
    from = params.get("from") || "",
    to = params.get("to") || "";
  const mode: TrendMode = params.get("metric") === "share" ? "share" : "count";
  const distributionMode: DistributionMode =
    params.get("distribution") === "compare" && !source ? "compare" : "overall";
  const focus =
    directionDefinitions.find((d) => d.key === params.get("direction"))?.key ??
    null;
  const days = Object.keys(catalog.days).sort();
  const state = useStatisticsReports(catalog, from, to);
  const stats = useMemo(
    () => wordStatistics(state?.reports ?? [], source),
    [state, source],
  );
  const communities = useMemo(
    () =>
      communitySources.map((community) => ({
        ...community,
        stats: wordStatistics(state?.reports ?? [], community.key),
      })),
    [state],
  );
  const distributionChange = (nextMode: DistributionMode) => {
    const next = new URLSearchParams(params);
    if (nextMode === "compare") {
      next.set("distribution", "compare");
      next.delete("source");
    } else next.delete("distribution");
    setParams(next, { replace: true });
  };
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key === "source" && value) next.delete("distribution");
    if (key === "from" && value && to && value > to) next.set("to", value);
    if (key === "to" && value && from && value < from) next.set("from", value);
    setParams(next, { replace: true });
  };
  const selectDirection = (key: DirectionKey | null) =>
    change("direction", key ?? "");
  const active = stats.directions
    .filter((d) => d.count)
    .sort((a, b) => b.count - a.count);
  return (
    <div className="dashboard optimization-dashboard word-statistics">
      <div className="docx-eyebrow">
        OPTIMIZATION LANDSCAPE <span>一级标题分类 / PR</span>
      </div>
      <div className="docx-overview-heading">
        <div>
          <h1>
            优化方向与趋势<span>。</span>
          </h1>
          <p>查看各方向的累计占比，以及 PR 数量与占比随时间的变化。</p>
        </div>
        <Link className="docx-secondary" to="/reports">
          日报档案 <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="docx-flow-toolbar">
        <div>
          <i /> <strong>手工定稿</strong> <span>{days.length} 份日报</span>
        </div>
        <div className="docx-flow-filters">
          <select
            aria-label="统计来源"
            value={source}
            onChange={(e) => change("source", e.target.value)}
          >
            <option value="">全部来源</option>
            <option value="github:vllm-project/vllm">vLLM</option>
            <option value="github:vllm-project/vllm-ascend">vLLM Ascend</option>
          </select>
          <select
            aria-label="趋势起始日期"
            value={from}
            onChange={(e) => change("from", e.target.value)}
          >
            <option value="">起始日期不限</option>
            {days.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <span>至</span>
          <select
            aria-label="趋势结束日期"
            value={to}
            onChange={(e) => change("to", e.target.value)}
          >
            <option value="">结束日期不限</option>
            {days.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="scope-strip">
        <Info size={15} />
        <span>
          统计已接入日报中明确关联的
          PR，包含原文收录的已合入、尚未合入和待核查条目；分类沿用日报一级标题。
        </span>
      </div>
      {!state ? (
        <p role="status" className="word-stats-state">
          正在汇总真实日报…
        </p>
      ) : (
        <>
          {state.failed.length > 0 && (
            <div className="word-stats-warning" role="alert">
              <AlertCircle size={18} />
              <span>
                {state.failed.length} 份日报读取或版本校验失败，当前统计不完整：
                {state.failed.join("、")}。
              </span>
            </div>
          )}
          {stats.unidentified > 0 && (
            <div className="word-stats-warning" role="alert">
              {stats.unidentified} 个工程条目无法识别 PR
              来源，未补造身份；当前计数存在缺口。
            </div>
          )}
          <div className="optimization-kpis">
            <div>
              <span>
                {state.failed.length ? "已读取关联 PR" : "累计关联 PR"}
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
              <span>论文条目 · 不限 PR 来源</span>
              <strong>
                {stats.papers}
                <small>篇</small>
              </strong>
            </div>
          </div>
          <p className="word-stats-basis">
            当前统计 {stats.primaryTotal} 个主 PR
            {stats.linkedOnly
              ? `及 ${stats.linkedOnly} 个仅作关联引用的 PR`
              : ""}
            ，均按仓库＋编号去重；论文单列。
          </p>
          <div className="optimization-primary-grid">
            <DirectionDistribution
              stats={stats}
              communities={communities}
              mode={distributionMode}
              onMode={distributionChange}
              focus={focus}
              onFocus={selectDirection}
            />
            <DirectionTrend
              adaptiveShareAxis
              stats={stats}
              focus={focus}
              mode={mode}
              onMode={(m) => change("metric", m === "count" ? "" : m)}
            />
          </div>
          <section className="chart-panel direction-summary">
            <div className="chart-heading">
              <div>
                <h2>方向一览</h2>
                <p>点击方向突出对应趋势；最近变化仅比较两个连续的报告日期。</p>
              </div>
              <span className="badge">
                {stats.adjacentDates
                  ? `${stats.previousDay} → ${stats.latestDay}`
                  : "暂无可比较的连续日期"}
              </span>
            </div>
            <div className="direction-table-head">
              <span>一级标题</span>
              <span>累计 PR</span>
              <span>累计占比</span>
              <span>最近变化{mode === "share" ? "（占比）" : "（数量）"}</span>
            </div>
            {active.map((d) => {
              const delta = stats.changes.find((c) => c.key === d.key)!;
              const value =
                mode === "share" ? delta.shareDelta : delta.countDelta;
              return (
                <button
                  key={d.key}
                  className={
                    "direction-table-row " + (focus === d.key ? "selected" : "")
                  }
                  aria-pressed={focus === d.key}
                  onClick={() =>
                    selectDirection(focus === d.key ? null : d.key)
                  }
                >
                  <span className="direction-name">
                    <i style={{ background: d.color }} />
                    <strong>{d.label}</strong>
                  </span>
                  <strong>{d.count}</strong>
                  <span>{d.share?.toFixed(1)}%</span>
                  <span
                    className={
                      "direction-delta " +
                      (value && value > 0
                        ? "up"
                        : value && value < 0
                          ? "down"
                          : "")
                    }
                  >
                    {value === null
                      ? "—"
                      : (value > 0 ? "+" : "") +
                        (mode === "share"
                          ? value.toFixed(1) + " 个百分点"
                          : value + " 个")}
                  </span>
                </button>
              );
            })}
            {!active.length && (
              <p className="chart-no-data">所选日期与来源范围没有 PR。</p>
            )}
            <p className="chart-footnote">
              累计按仓库＋PR
              编号去重；跨日出现可分别进入当日趋势。来源与日期筛选同时作用于两张图，选中方向不改变占比分母。
            </p>
          </section>
        </>
      )}
    </div>
  );
}

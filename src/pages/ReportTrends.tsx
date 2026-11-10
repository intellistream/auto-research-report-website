import { useState, type CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { IndexedPR } from "./InferenceMap";
import "./report-trends.css";

const directions = [
  ["startup", "模型准备"], ["scheduling", "请求调度"], ["prefill", "输入处理"],
  ["pd_transfer", "P/D 缓存交接"], ["decode", "循环生成"], ["speculative", "推测解码"],
  ["output_return", "输出返回"], ["resource_reclaim", "资源回收"],
] as const;
const conflict = ["classification_conflict", "分类不一致"] as const;
const dayMs = 86_400_000;
const shortDay = (day: string) => day.slice(5).replace("-", "/");

export function uniquePRs(observations: IndexedPR[]) {
  const byId = new Map<string, IndexedPR>();
  for (const item of observations) {
    const previous = byId.get(item.workId);
    if (!previous) byId.set(item.workId, item);
    else if (previous.stage !== item.stage) byId.set(item.workId, { ...previous, stage: conflict[0] });
  }
  return [...byId.values()];
}

function buildDays(days: string[], observations: IndexedPR[]) {
  const byDay = new Map(days.map((day) => [day, [] as IndexedPR[]]));
  for (const item of observations) byDay.get(item.day)?.push(item);
  if (!days.length) return [];
  const start = Date.parse(days.at(-1)!);
  const end = Date.parse(days[0]);
  const result = [];
  for (let timestamp = start; timestamp <= end; timestamp += dayMs) {
    const day = new Date(timestamp).toISOString().slice(0, 10);
    const rows = byDay.get(day);
    const entries = rows ? uniquePRs(rows) : undefined;
    const counts = new Map<string, number>();
    for (const item of entries ?? []) counts.set(item.stage, (counts.get(item.stage) ?? 0) + 1);
    result.push({ day, entries, counts });
  }
  return result;
}

export default function ReportTrends({ days, observations }: { days: string[]; observations: IndexedPR[] }) {
  const [mode, setMode] = useState<"count" | "share">("count");
  const [selection, setSelection] = useState<{ day: string; stage?: string }>();
  const series = buildDays(days, observations);
  if (!series.length) return <section className="report-trends"><h2>社区 PR 趋势</h2><p>所选日期范围内没有日报。</p></section>;

  const rows = series.some(({ counts }) => counts.has(conflict[0])) ? [...directions, conflict] : directions;
  const latest = series.at(-1)!;
  const peak = series.reduce((highest, day) => day.entries && day.entries.length >= (highest.entries?.length ?? 0) ? day : highest, latest);
  const value = (day: typeof latest, stage: string) => {
    if (!day.entries) return null;
    const count = day.counts.get(stage) ?? 0;
    return mode === "count" ? count : day.entries.length ? 100 * count / day.entries.length : null;
  };
  const max = Math.max(1, ...series.flatMap((day) => rows.map(([stage]) => value(day, stage) ?? 0)));
  const compare = (period: typeof series, stage: string) => {
    const total = period.reduce((sum, day) => sum + day.entries!.length, 0);
    return total ? 100 * period.reduce((sum, day) => sum + (day.counts.get(stage) ?? 0), 0) / total : null;
  };
  const lastTwoWeeks = series.slice(-14);
  const changes = lastTwoWeeks.length === 14 && lastTwoWeeks.every((day) => day.entries)
    ? directions.flatMap(([stage, label]) => {
      const before = compare(lastTwoWeeks.slice(0, 7), stage);
      const after = compare(lastTwoWeeks.slice(7), stage);
      return before === null || after === null ? [] : [{ label, delta: after - before }];
    }).sort((a, b) => b.delta - a.delta)
    : [];
  const rise = changes.find(({ delta }) => delta >= 0.05);
  const smallest = changes.at(-1);
  const fall = smallest && smallest.delta <= -0.05 ? smallest : undefined;
  const selected = series.find(({ day }) => day === selection?.day);
  const stage = rows.find(([key]) => key === selection?.stage);
  const evidence = selected?.entries?.filter((entry) => !stage || entry.stage === stage[0]);
  const format = (amount: number | null) => amount === null ? "—" : mode === "count" ? String(amount) : amount.toFixed(1) + "%";
  const shade = (amount: number) => ({ "--heat": Math.sqrt(amount / max) } as CSSProperties);
  return (
    <section className="report-trends" aria-labelledby="report-trends-title">
      <div className="report-trends-heading">
        <div><h2 id="report-trends-title">社区 PR 趋势</h2><p>先看每日总量，再看变化集中在哪些推理环节。</p></div>
        <div className="report-trends-toggle" role="group" aria-label="热图指标">
          <button type="button" aria-pressed={mode === "count"} onClick={() => setMode("count")}>数量</button>
          <button type="button" aria-pressed={mode === "share"} onClick={() => setMode("share")}>占比</button>
        </div>
      </div>
      <div className="report-trends-highlights">
        <div><span>最近一期 · {shortDay(latest.day)}</span><strong>{latest.entries?.length ?? 0} <small>PR</small></strong></div>
        <div><span>单日峰值 · {shortDay(peak.day)}</span><strong>{peak.entries?.length ?? 0} <small>PR</small></strong></div>
        <div><span>占比上升最多</span>{rise ? <><strong className="trend-rise"><ArrowUpRight size={19} /> +{rise.delta.toFixed(1)} <small>百分点</small></strong><b>{rise.label}</b></> : <strong>—</strong>}</div>
        <div><span>占比下降最多</span>{fall ? <><strong className="trend-fall"><ArrowDownRight size={19} /> {fall.delta.toFixed(1)} <small>百分点</small></strong><b>{fall.label}</b></> : <strong>—</strong>}</div>
      </div>
      <div className="report-trends-scroll" role="region" aria-label="每日 PR 柱图和方向热图，可横向滚动" tabIndex={0}>
        <table className="report-trends-grid">
          <caption className="trend-sr-only">每列一个日期，每行一个推理环节。点击柱或格子查看对应 PR。</caption>
          <thead><tr><th scope="col">日报日期</th>{series.map(({ day }) => <th key={day} scope="col"><time dateTime={day}>{shortDay(day)}</time></th>)}</tr></thead>
          <tbody>
            <tr className="report-trends-totals"><th scope="row">每日总量</th>{series.map(({ day, entries }) => (
              <td key={day}>{entries ? <button type="button" aria-pressed={selection?.day === day && !selection.stage}
                aria-label={`${day} 收录 ${entries.length} 个 PR`}
                onClick={() => setSelection({ day })}>
                <b>{entries.length}</b><i style={{ height: 58 * entries.length / Math.max(1, peak.entries?.length ?? 0) }} />
              </button> : <span title="未收录日报">—</span>}</td>
            ))}</tr>
            {rows.map(([key, label]) => <tr key={key}>
              <th scope="row">{label}</th>
              {series.map((day) => {
                const amount = value(day, key);
                const text = format(amount);
                return <td key={day.day}>{day.entries ? (
                  <button type="button" className={amount ? "report-heat-cell" : "report-heat-cell report-heat-empty"}
                    style={shade(amount ?? 0)} aria-pressed={selection?.day === day.day && selection.stage === key}
                    aria-label={`${day.day} ${label}：${text}${mode === "count" ? " 个 PR" : ""}`}
                    onClick={() => setSelection({ day: day.day, stage: key })}>{text}</button>
                ) : <span className="report-heat-gap" title="未收录日报">—</span>}</td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="report-trends-notes">
        <span className="report-trends-legend">低 <i /> 高</span>
        <span>点柱或格子查看 PR。每日按仓库与 PR 编号去重，缺报留空。</span>
        <span>{changes.length ? "占比变化对比末 7 天和之前 7 天。" : "占比变化需要两组连续且有 PR 的 7 天窗口。"}</span>
      </div>
      {selected && <div className="report-trends-evidence">
        <div><h3>{shortDay(selected.day)} · {stage?.[1] ?? "全部环节"} · {evidence?.length ?? 0} 个 PR</h3>
          <Link to={`/reports/${selected.day}`}>阅读当日日报 <ArrowUpRight size={14} /></Link></div>
        {evidence?.length ? <ul>{evidence.map((item) => (
          <li key={item.workId}><Link to={{ pathname: `/reports/${item.day}`, search: new URLSearchParams({ section: item.number, version: item.version }).toString() }}>
            <span>{item.workId.includes("vllm-ascend") ? "Ascend" : "vLLM"} #{item.workId.split("#").at(-1)}</span>{item.title}
          </Link></li>
        ))}</ul> : <p>当日所选范围没有收录 PR。</p>}
      </div>}
    </section>
  );
}

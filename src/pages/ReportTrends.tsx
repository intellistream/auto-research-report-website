import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
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
  const [query, setQuery] = useSearchParams();
  const mode = query.get("heat") === "share" ? "share" : "count";
  const selectedDay = query.get("chartDay");
  const selectedStage = query.get("chartStage");
  const scroll = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState("");
  const firstDay = days.at(-1);
  const lastDay = days[0];
  useEffect(() => {
    const region = scroll.current;
    if (region) region.scrollLeft = region.scrollWidth;
  }, [firstDay, lastDay]);
  const series = useMemo(() => buildDays(days, observations), [days, observations]);
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
  const selected = series.find(({ day, entries }) => day === selectedDay && entries);
  const stage = rows.find(([key]) => key === selectedStage);
  const activeDay = activeCell.slice(0, 10);
  const activeStage = activeCell.slice(10);
  const focusKey = series.some(({ day, entries }) => entries && day === activeDay)
    && (!activeStage || rows.some(([key]) => key === activeStage)) ? activeCell : latest.day;

  function updateChart(day: string, stageKey?: string) {
    const next = new URLSearchParams(query);
    next.set("chartDay", day);
    if (stageKey) next.set("chartStage", stageKey);
    else next.delete("chartStage");
    setQuery(next, { replace: true, preventScrollReset: true });
  }
  function updateMode(value: "count" | "share") {
    const next = new URLSearchParams(query);
    if (value === "share") next.set("heat", value);
    else next.delete("heat");
    setQuery(next, { replace: true, preventScrollReset: true });
  }
  function moveFocus(event: KeyboardEvent<HTMLTableElement>) {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const cell = target.closest("td");
    const column = cell?.cellIndex ?? 0;
    const row = cell?.parentElement;
    if (!(row instanceof HTMLTableRowElement)) return;
    const horizontal = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const vertical = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!horizontal && !vertical) return;
    event.preventDefault();
    if (horizontal) {
      for (let index = column + horizontal; index > 0 && index < row.cells.length; index += horizontal) {
        const button = row.cells[index].querySelector("button");
        if (button) {
          button.focus();
          break;
        }
      }
    } else {
      const next = event.currentTarget.rows[row.rowIndex + vertical];
      next?.cells[column]?.querySelector("button")?.focus();
    }
  }
  const evidence = selected?.entries?.filter((entry) => !stage || entry.stage === stage[0]);
  const format = (amount: number | null) => amount === null ? "—" : mode === "count" ? String(amount) : amount.toFixed(1) + "%";
  const shade = (amount: number) => ({ "--heat": amount / max } as CSSProperties);
  return (
    <section className="report-trends" aria-labelledby="report-trends-title">
      <div className="report-trends-heading">
        <div><h2 id="report-trends-title">社区 PR 趋势</h2><p>每日收录量与各推理环节的分布。</p></div>
        <div className="report-trends-toggle" role="group" aria-label="热图指标">
          <button type="button" aria-pressed={mode === "count"} onClick={() => updateMode("count")}>数量</button>
          <button type="button" aria-pressed={mode === "share"} onClick={() => updateMode("share")}>占比</button>
        </div>
      </div>
      <div className="report-trends-highlights">
        <div><span>最近一期 · {shortDay(latest.day)}</span><strong>{latest.entries?.length ?? 0} <small>PR</small></strong></div>
        <div><span>单日峰值 · {shortDay(peak.day)}</span><strong>{peak.entries?.length ?? 0} <small>PR</small></strong></div>
        <div><span>占比上升最多</span>{rise ? <><strong className="trend-rise"><ArrowUpRight size={19} aria-hidden /> +{rise.delta.toFixed(1)} <small>百分点</small></strong><b>{rise.label}</b></> : <strong>—</strong>}</div>
        <div><span>占比下降最多</span>{fall ? <><strong className="trend-fall"><ArrowDownRight size={19} aria-hidden /> {fall.delta.toFixed(1)} <small>百分点</small></strong><b>{fall.label}</b></> : <strong>—</strong>}</div>
      </div>
      <p className="report-trends-guide">横向滚动查看日期。选择柱或格子查看下方的 PR。</p>
      <div className="report-trends-scroll" ref={scroll} role="region" aria-label="每日 PR 柱图和方向热图" tabIndex={0}>
        <table className="report-trends-grid" onKeyDown={moveFocus}>
          <caption className="trend-sr-only">每列一个日期，每行一个推理环节。用方向键移动，按回车查看对应 PR。</caption>
          <thead><tr><th scope="col">日报日期</th>{series.map(({ day }) => <th key={day} scope="col"><time dateTime={day}>{shortDay(day)}</time></th>)}</tr></thead>
          <tbody>
            <tr className="report-trends-totals"><th scope="row">每日总量</th>{series.map(({ day, entries }) => (
              <td key={day}>{entries ? <button type="button" aria-pressed={selectedDay === day && !stage}
                tabIndex={focusKey === day ? 0 : -1} onFocus={() => setActiveCell(day)}
                aria-label={`${day} 收录 ${entries.length} 个 PR`}
                onClick={() => updateChart(day)}>
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
                    style={shade(amount ?? 0)} aria-pressed={selectedDay === day.day && stage?.[0] === key}
                    tabIndex={focusKey === day.day + key ? 0 : -1} onFocus={() => setActiveCell(day.day + key)}
                    aria-label={`${day.day} ${label}：${text}${mode === "count" ? " 个 PR" : ""}`}
                    onClick={() => updateChart(day.day, key)}>{text}</button>
                ) : <span className="report-heat-gap" title="未收录日报">—</span>}</td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="report-trends-notes">
        <span className="report-trends-legend">低 <i /> 高</span>
        <span>每日按仓库与 PR 编号去重，缺报以横线表示。</span>
        <span>{changes.length ? "占比变化对比末 7 天和之前 7 天。" : "占比变化需要两组连续且有 PR 的 7 天窗口。"}</span>
      </div>
      <span className="trend-sr-only" role="status">{selected && `${selected.day} 的 ${evidence?.length ?? 0} 个 PR 已显示在图表下方`}</span>
      {selected && <div className="report-trends-evidence">
        <div><h3>{shortDay(selected.day)} · {stage?.[1] ?? "全部环节"} · {evidence?.length ?? 0} 个 PR</h3>
          <Link to={`/reports/${selected.day}`}>阅读当日日报 <ArrowUpRight size={14} aria-hidden /></Link></div>
        {evidence?.length ? <ul>{evidence.map((item) => (
          <li key={item.workId}><Link to={{ pathname: `/reports/${item.day}`, search: new URLSearchParams({ section: item.number, version: item.version }).toString() }}>
            <span>{item.workId.includes("vllm-ascend") ? "Ascend" : "vLLM"} #{item.workId.split("#").at(-1)}</span>{item.title}
          </Link></li>
        ))}</ul> : <p>当日所选范围没有收录 PR。</p>}
      </div>}
    </section>
  );
}

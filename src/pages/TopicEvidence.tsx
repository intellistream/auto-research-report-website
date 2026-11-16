import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import type { Entry, Topic } from "./TopicPages";
import { evidenceTimeline, safeTopicSource, type ResearchReport } from "./topic-report";
import "./topic-research-report.css";

export function EvidenceTimeline({ topic, report }: { topic: Topic; report: ResearchReport }) {
  const rows = evidenceTimeline(topic, report);
  if (!rows.length) return null;
  const maximum = Math.max(1, ...rows.map((row) => row.synthesized + row.pending));
  const cell = 640 / rows.length;
  return <figure className="survey-trend">
    <div className="survey-chart-heading"><h3>工程证据的持续积累</h3><div className="survey-chart-legend"><span><i className="synthesized" />已综合</span><span><i className="pending" />待研究</span></div></div>
    <svg viewBox="0 0 680 185" role="img" aria-label="按日报收录日统计的专题 PR 证据数量，区分已综合和待研究">
      <line x1="25" y1="145" x2="665" y2="145" stroke="#dbe5df" />
      {rows.map((row, index) => {
        const height = (row.synthesized + row.pending) / maximum * 130;
        const reviewed = row.synthesized / maximum * 130;
        const x = 25 + index * cell + cell * .18;
        return <g key={row.day}><title>{`${row.day}：已综合 ${row.synthesized} 条，待研究 ${row.pending} 条`}</title><rect x={x} y={145 - height} width={cell * .64} height={height} rx="2" fill="#e0e9e2" /><rect x={x} y={145 - reviewed} width={cell * .64} height={reviewed} rx="2" fill="#367b61" />{(index === 0 || index === rows.length - 1 || index % Math.max(1, Math.ceil(rows.length / 6)) === 0) && <text x={x + cell * .32} y="165" textAnchor="middle" fill="#6b7d72" fontSize="10">{row.day.slice(5)}</text>}</g>;
      })}
      <text x="21" y="12" fill="#6b7d72" fontSize="10">{maximum} 条</text>
    </svg>
    <figcaption>数量来自日报取材索引，反映证据积累与研究进度；不用于比较技术性能或判断领域热度。</figcaption>
    <details className="survey-chart-data"><summary>查看图表数据</summary><div className="survey-table-wrap"><table><thead><tr><th>日报收录日</th><th>已综合 PR</th><th>待研究 PR</th></tr></thead><tbody>{rows.map((row) => <tr key={row.day}><td>{row.day}</td><td>{row.synthesized}</td><td>{row.pending}</td></tr>)}</tbody></table></div></details>
  </figure>;
}

export function EvidenceList({ entries, labels }: { entries: Entry[]; labels: Record<string, string> }) {
  const [query, setQuery] = useSearchParams();
  const repo = query.get("repo") ?? "", label = query.get("label") ?? "";
  const rows = entries.filter((entry) => (!repo || entry.repository === repo) && (!label || entry.label === label));
  function filter(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value); else next.delete(key);
    setQuery(next, { replace: true });
  }
  return <>
    <div className="topic-filters"><label>社区<select value={repo} onChange={(event) => filter("repo", event.target.value)}><option value="">全部社区</option><option value="vllm">vLLM</option><option value="vllm-ascend">vLLM Ascend</option></select></label><label>子方向<select value={label} onChange={(event) => filter("label", event.target.value)}><option value="">全部方向</option>{Object.entries(labels).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label><span role="status">{rows.length} 条线索</span></div>
    {!rows.length ? <p className="survey-muted">当前筛选下没有取材条目。</p> : <ul className="topic-entries">{rows.map((entry) => {
      const search = new URLSearchParams({ version: entry.version, section: entry.number }).toString();
      const source = safeTopicSource(entry.url);
      return <li key={entry.workId} className="topic-evidence-row"><div className="topic-meta"><time dateTime={entry.day}>{entry.day}</time><span>{entry.repository === "vllm" ? "vLLM" : "vLLM Ascend"} #{entry.workId.split("#")[1]}</span><span className="topic-tag">{labels[entry.label] ?? entry.label}</span></div><h3><Link to={{ pathname: `/reports/${entry.day}`, search }}>{entry.title}</Link></h3>{entry.summary && <p>{entry.summary}</p>}<div className="topic-links"><Link to={{ pathname: `/reports/${entry.day}`, search }}>日报原文 <ArrowRight size={13} /></Link>{source && <a href={source} target="_blank" rel="noreferrer">GitHub PR <ArrowUpRight size={13} /></a>}</div></li>;
    })}</ul>}
  </>;
}

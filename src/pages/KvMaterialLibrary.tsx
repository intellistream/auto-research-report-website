import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  filterResearch, kvResearch, researchReviewLabels, researchTimeline, researchTopicFilter,
  type DailyReference, type ResearchEntry,
} from "./kv-research";
import study from "./kv-cache-study.json";

export function DailyCitations({ references }: { references?: DailyReference[] }) {
  if (!references?.length) return null;
  return <details className="kv-daily-citations">
    <summary>日报引用（{references.length}）</summary>
    <ul>{references.map((reference) =>
      <li key={reference.day + reference.version + reference.section}>
        <Link to={{
          pathname: `/reports/${reference.day}`,
          search: new URLSearchParams({ version: reference.version, section: reference.section }).toString(),
        }}>{reference.day} · {reference.section} <ArrowRight size={12} aria-hidden="true" /></Link>
      </li>)}</ul>
  </details>;
}

function MaterialCard({ entry }: { entry: ResearchEntry }) {
  const status = entry.merged ? "已合并"
    : entry.state === "closed" ? "已关闭" : entry.draft ? "草稿" : "开放中";
  const compared = study.methods.some((method) => method.workId === entry.id);
  const community = entry.repository === "vllm" ? "vLLM" : "vLLM Ascend";
  return <li className="kv-material-card" data-material-id={entry.id}>
    <div className="kv-material-meta">
      <span>{entry.kind === "pr" ? `${community} #${entry.id.split("#")[1]}` : "论文"}</span>
      <span>{entry.kind === "pr" ? "创建于" : "版本日期"} <time dateTime={entry.sourceDay}>{entry.sourceDay}</time></span>
      {entry.kind === "pr" && <span className="kv-pr-status">{status}</span>}
    </div>
    <h3><a href={entry.url} target="_blank" rel="noreferrer">{entry.title} <ArrowUpRight size={14} aria-hidden="true" /></a></h3>
    <p>{entry.summary}</p>
    <div className="kv-material-topics" aria-label="关联研究问题">
      {entry.topics.map((id) => <Link
        key={id}
        className={entry.primaryTopic === id ? "primary" : ""}
        to={{ search: `view=evidence&topic=${id}` }}
      >{kvResearch.taxonomy.find((topic) => topic.id === id)?.label}</Link>)}
    </div>
    <div className="kv-material-links">
      <a href={entry.url} target="_blank" rel="noreferrer">{entry.kind === "pr" ? "原始 PR" : "原始论文"} <ArrowUpRight size={12} aria-hidden="true" /></a>
      {entry.paper && <Link to={{ search: `view=papers&part=kv-paper-${entry.paper.slug}` }}>阅读简介 <ArrowRight size={12} aria-hidden="true" /></Link>}
      {compared && <Link to={{ search: `view=compare&part=kv-pr-${entry.id.split("#")[1]}` }}>专题方法对比 <ArrowRight size={12} aria-hidden="true" /></Link>}
      <span>{researchReviewLabels[entry.reviewLevel]}</span>
    </div>
    <details className="kv-material-basis">
      <summary>归属依据与来源版本</summary>
      <p>{entry.rationale}</p>
      <p className="kv-muted">审阅于 {entry.checkedAt}</p>
      {entry.sourceVersion && <code>{entry.sourceVersion}</code>}
    </details>
    <DailyCitations references={entry.dailyReferences} />
  </li>;
}

function BoundaryMaterials({ decision }: { decision: "excluded" | "pending" }) {
  const entries = kvResearch.entries.filter((entry) => entry.decision === decision);
  if (!entries.length) return null;
  return <details className="kv-boundary-materials">
    <summary>{decision === "excluded" ? "本轮未纳入的候选" : "归属待核实的候选"}（{entries.length}）</summary>
    <ul>{entries.map((entry) => <li key={entry.id}>
      <a href={entry.url} target="_blank" rel="noreferrer">{entry.title} <ArrowUpRight size={12} aria-hidden="true" /></a>
      <p>{entry.rationale}</p>
    </li>)}</ul>
  </details>;
}

export default function KvMaterialLibrary() {
  const [query, setQuery] = useSearchParams();
  const rows = filterResearch(kvResearch.entries, query);
  const included = filterResearch(kvResearch.entries, new URLSearchParams());
  const prCount = included.filter((entry) => entry.kind === "pr").length;
  const paperCount = included.filter((entry) => entry.kind === "paper").length;
  const topic = researchTopicFilter(query);
  const month = query.get("month") ?? "";
  const trendQuery = new URLSearchParams(query);
  trendQuery.delete("month");
  const months = researchTimeline(filterResearch(kvResearch.entries, trendQuery));
  const maximum = Math.max(1, ...months.map((row) => row.count));

  function filter(key: string, value: string) {
    const next = new URLSearchParams(query);
    next.set("view", "evidence");
    next.delete("label");
    if (key !== "month") next.delete("month");
    if (key === "month" && value) next.set("kind", "pr");
    if (value) next.set(key, value);
    else next.delete(key);
    setQuery(next, { replace: true });
  }

  return <article className="kv-study kv-research-library">
    <header className="kv-study-intro">
      <h2>PR 与趋势</h2>
      <p>从原始 PR 与论文查看问题、方法和来源依据，按关联研究主题筛选。</p>
      <p className="kv-muted">材料库更新于 {kvResearch.asOf}。{kvResearch.reviewNote}</p>
    </header>
    <dl className="kv-review-summary">
      <div><dt>纳入 PR</dt><dd>{prCount}</dd></div>
      <div><dt>纳入论文</dt><dd>{paperCount}</dd></div>
      <div><dt>研究问题组</dt><dd>{kvResearch.taxonomy.length}</dd></div>
    </dl>
    <div className="topic-filters kv-research-filters">
      <label>研究问题<select value={topic} onChange={(event) => filter("topic", event.target.value)}>
        <option value="">全部问题</option>
        {kvResearch.taxonomy.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>材料类型<select value={query.get("kind") ?? ""} onChange={(event) => filter("kind", event.target.value)}>
        <option value="">全部材料</option><option value="pr">PR</option><option value="paper">论文</option>
      </select></label>
      <label>来源社区<select value={query.get("repo") ?? ""} onChange={(event) => filter("repo", event.target.value)}>
        <option value="">全部来源</option><option value="vllm">vLLM</option><option value="vllm-ascend">vLLM Ascend</option>
      </select></label>
      <button type="button" onClick={() => setQuery({ view: "evidence" }, { replace: true })}>清除筛选</button>
      <span role="status">{rows.length} 份材料</span>
    </div>
    <p className="kv-muted">同一材料可以关联多个研究问题，主题数量存在交叉。材料总量按来源身份去重。</p>
    {months.length > 0 && <figure className="kv-source-trend">
      <div className="kv-section-heading"><h3>收录 PR 的创建时间分布</h3>
        {month && <button type="button" onClick={() => filter("month", "")}>全部月份</button>}
      </div>
      <div className="kv-month-scroll" role="region" aria-label="按月统计的 PR 数量，可横向滚动" tabIndex={0}>
        <ol className="kv-month-bars">{months.map((row) => <li key={row.month}>
          <button
            type="button"
            aria-pressed={month === row.month}
            aria-label={`${row.month} 创建，${row.count} 条 PR`}
            onClick={() => filter("month", month === row.month ? "" : row.month)}
          >
            <strong>{row.count}</strong>
            <i style={{ height: `${Math.max(3, row.count / maximum * 110)}px` }} aria-hidden="true" />
            <span>{row.month}</span>
          </button>
        </li>)}</ol>
      </div>
      <figcaption>按已纳入 PR 的创建月份汇总，日期换算为北京时间。每个 PR 计一次，点击月份查看对应材料。</figcaption>
      <details className="kv-chart-data"><summary>查看图表数据</summary>
        <table><thead><tr><th>创建月份</th><th>PR 数量</th></tr></thead>
          <tbody>{months.map((row) => <tr key={row.month}><td>{row.month}</td><td>{row.count}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>}
    {month && <p className="kv-muted">当前月份筛选为 {month}。</p>}
    <section aria-labelledby="kv-materials-title">
      <h3 id="kv-materials-title">专题材料</h3>
      {!rows.length ? <p role="status">当前筛选下没有材料。</p>
        : <ul className="kv-material-list">{rows.map((entry) => <MaterialCard key={entry.id} entry={entry} />)}</ul>}
    </section>
    <BoundaryMaterials decision="excluded" />
    <BoundaryMaterials decision="pending" />
  </article>;
}

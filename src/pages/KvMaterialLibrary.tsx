import { Link, useSearchParams } from "react-router-dom";
import {
  kvResearch, researchReviewLabels, researchTimeline, researchTopicFilter,
  type DailyReference, type ResearchEntry,
} from "./kv-research";
import {
  communityEntries, filterCommunity, hasVersionChange, kvCommunity,
  prState, prStateLabels, snapshotFor, storyFor,
} from "./kv-community";
import study from "./kv-cache-study.json";

export function DailyCitations({ references }: { references?: DailyReference[] }) {
  if (!references?.length) return null;
  return <details className="kv-daily-citations">
    <summary>日报引用（{references.length}）</summary>
    <ul>{references.map(reference =>
      <li key={reference.day + reference.version + reference.section}>
        <Link to={{
          pathname: "/reports/" + reference.day,
          search: new URLSearchParams({ version: reference.version, section: reference.section }).toString(),
        }}>{reference.day} · {reference.section}</Link>
      </li>)}</ul>
  </details>;
}

function MaterialCard({ entry }: { entry: ResearchEntry }) {
  const snapshot = snapshotFor(entry.id);
  const state = prState(snapshot ?? entry);
  const story = storyFor(entry.id);
  const changed = snapshot && hasVersionChange(snapshot);
  const compared = study.methods.some(method => method.workId === entry.id);
  const community = entry.repository === "vllm" ? "vLLM" : "vLLM Ascend";
  return <li className="kv-material-card" data-material-id={entry.id}>
    <div className="kv-material-meta">
      <span>{community} #{entry.id.split("#")[1]}</span>
      <span>创建于 <time dateTime={entry.sourceDay!}>{entry.sourceDay}</time></span>
      <span className={"kv-pr-status " + state}>{prStateLabels[state]}</span>
      <span>状态核对 {snapshot?.checkedAt ?? entry.checkedAt}</span>
    </div>
    <h3><a href={entry.url} target="_blank" rel="noreferrer">{entry.title}</a></h3>
    <p>{entry.summary}</p>
    <p className="kv-material-review">{researchReviewLabels[entry.reviewLevel]} · 机制简介核对 {entry.checkedAt}
      {changed && <> · <strong>代码版本已变更，旧简介需结合本期进展阅读</strong></>}
    </p>
    <div className="kv-material-topics" aria-label="关联研究问题">
      {entry.topics.map(id => <Link key={id} className={entry.primaryTopic === id ? "primary" : ""}
        to={{search:"view=evidence&topic=" + id}}>{kvResearch.taxonomy.find(topic => topic.id === id)?.label}</Link>)}
    </div>
    <div className="kv-material-links">
      <a href={entry.url} target="_blank" rel="noreferrer">原始 PR</a>
      {story && <Link to={{search:"view=report&part=kv-update-" + story.slug}}>阅读本期分析</Link>}
      {compared && <Link to={{search:"view=compare&part=kv-pr-" + entry.id.split("#")[1]}}>阅读调度专项分析</Link>}
      <Link to={{search:"view=survey&topic=" + entry.primaryTopic}}>相关论文方法</Link>
    </div>
    <details className="kv-material-basis"><summary>归属依据与来源版本</summary>
      <p>{entry.rationale}</p>
      <p>机制简介依据的 head：<code>{entry.sourceVersion}</code></p>
      {snapshot && <p>本期核对的 head：<code>{snapshot.headSha}</code></p>}
      {story && <p>{story.basis}</p>}
    </details>
    <DailyCitations references={entry.dailyReferences} />
  </li>;
}

function BoundaryMaterials() {
  const entries = kvResearch.entries.filter(entry => entry.kind === "pr" && entry.decision === "excluded");
  return <details className="kv-boundary-materials">
    <summary>历史审阅中未纳入的候选（{entries.length}）</summary>
    <ul>{entries.map(entry => <li key={entry.id}><a href={entry.url} target="_blank" rel="noreferrer">{entry.title}</a><p>{entry.rationale}</p></li>)}</ul>
  </details>;
}

export default function KvMaterialLibrary() {
  const [query, setQuery] = useSearchParams();
  const rows = filterCommunity(query);
  const topic = researchTopicFilter(query);
  const month = query.get("month") ?? "";
  const trendQuery = new URLSearchParams(query);
  trendQuery.delete("month");
  const months = researchTimeline(filterCommunity(trendQuery));
  const maximum = Math.max(1, ...months.map(row => row.count));

  function filter(key: string, value: string) {
    const next = new URLSearchParams(query);
    for (const field of ["label", "kind", "part", "edition", "collection"]) next.delete(field);
    next.set("view", "evidence");
    if (topic) next.set("topic", topic);
    if (key !== "month") next.delete("month");
    if (value) next.set(key, value); else next.delete(key);
    setQuery(next, {replace:true});
  }

  return <article className="kv-study kv-research-library">
    <header className="kv-study-intro">
      <p className="kv-direction">社区 PR · 查询与趋势</p>
      <h2>PR 列表与趋势</h2>
      <p>按研究问题查找实现，分别查看当前状态、机制解读和来源版本。</p>
      <p className="kv-muted">状态核对至 {kvCommunity.edition}。本期技术判断见<Link to={{search:"view=report"}}>动态报告</Link>；每条简介保留自己的分析日期。</p>
    </header>
    <dl className="kv-review-summary">
      <div><dt>已收录 PR</dt><dd>{communityEntries.length}</dd></div>
      <div><dt>本期新纳入</dt><dd>{kvCommunity.newEntries.length}</dd></div>
      <div><dt>研究问题组</dt><dd>{kvResearch.taxonomy.length}</dd></div>
    </dl>
    <div className="topic-filters kv-research-filters kv-community-filters" role="search" aria-label="检索社区 PR">
      <label>研究问题<select aria-label="PR 研究问题" value={topic} onChange={e => filter("topic", e.target.value)}>
        <option value="">全部问题</option>{kvResearch.taxonomy.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>来源社区<select value={query.get("repo") ?? ""} onChange={e => filter("repo", e.target.value)}>
        <option value="">全部来源</option><option value="vllm">vLLM</option><option value="vllm-ascend">vLLM Ascend</option>
      </select></label>
      <label>PR 状态<select value={query.get("state") ?? ""} onChange={e => filter("state", e.target.value)}>
        <option value="">全部状态</option>{Object.entries(prStateLabels).map(([id,label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>
      <label>本期跟踪<select value={query.get("review") ?? ""} onChange={e => filter("review", e.target.value)}>
        <option value="">全部已收录</option><option value="edition">有本期分析</option><option value="changed">既有 PR 版本变化</option>
      </select></label>
      <label className="kv-community-search">检索 PR<input type="search" value={query.get("q") ?? ""} placeholder="编号、标题或机制关键词" onChange={e => filter("q", e.target.value)} /></label>
      <button type="button" onClick={() => setQuery({view:"evidence"},{replace:true})}>清除筛选</button>
    </div>
    <p role="status" aria-live="polite">当前 {rows.length} 条 PR{topic && <> · {kvResearch.taxonomy.find(item=>item.id===topic)?.label ?? topic}</>}{month && <> · 创建月份 {month}</>}</p>
    <p className="kv-muted">同一 PR 可关联多个研究问题，数量按 PR 身份去重。已合并表示实现状态，证据范围与机制核对日期单独展示。</p>
    {months.length > 0 && <figure className="kv-source-trend">
      <div className="kv-section-heading"><h3>收录 PR 的创建时间分布</h3>{month && <button type="button" onClick={()=>filter("month","")}>全部月份</button>}</div>
      <div className="kv-month-scroll" role="region" aria-label="按月统计的 PR 数量，可横向滚动" tabIndex={0}>
        <ol className="kv-month-bars">{months.map(row => <li key={row.month}>
          <button type="button" aria-pressed={month===row.month} aria-label={row.month + " 创建，" + row.count + " 条 PR"} onClick={()=>filter("month",month===row.month?"":row.month)}>
            <strong>{row.count}</strong><i style={{height:Math.max(3,row.count/maximum*110) + "px"}} aria-hidden="true"/><span>{row.month}</span>
          </button></li>)}</ol>
      </div>
      <figcaption>按当前问题、社区、状态与关键词筛选后的 PR 创建月份统计，北京时间，每条计一次。它反映已收录材料的时间分布；本期进展在动态报告中分析。</figcaption>
      <details className="kv-chart-data"><summary>查看图表数据</summary><table><thead><tr><th>创建月份</th><th>PR 数量</th></tr></thead><tbody>{months.map(row=><tr key={row.month}><td>{row.month}</td><td>{row.count}</td></tr>)}</tbody></table></details>
    </figure>}
    <section aria-labelledby="kv-materials-title"><h3 id="kv-materials-title">PR 记录</h3>
      {!rows.length ? <p role="status">当前筛选下没有 PR。</p> : <ul className="kv-material-list">{rows.map(entry=><MaterialCard key={entry.id} entry={entry}/>)}</ul>}
    </section>
    <BoundaryMaterials />
  </article>;
}

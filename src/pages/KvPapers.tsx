import { ArrowUpRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { filterPapers, kvResearch, paperViewQuery, researchTopicFilter, type PaperEntry } from "./kv-research";
import { safeTopicSource } from "./topic-report";
import "./kv-papers.css";

function PaperCard({ entry }: { entry: PaperEntry }) {
  const { paper } = entry;
  const source = safeTopicSource(entry.url);
  return <li className="kv-reading-card" id={`kv-paper-${paper.slug}`} data-paper-id={entry.id} tabIndex={-1}>
    <div className="kv-reading-meta"><span>{paper.venue}</span><span>{entry.sourceVersion}</span></div>
    <h3>{entry.title}</h3>
    <p className="kv-reading-original" lang="en">{entry.originalTitle}</p>
    <div className="kv-material-topics" aria-label="论文关联研究问题">{entry.topics.map((id) =>
      <Link key={id} className={id === entry.primaryTopic ? "primary" : ""} to={{ search: `view=papers&topic=${id}` }}>
        {kvResearch.taxonomy.find((topic) => topic.id === id)?.label}
      </Link>)}</div>
    <dl className="kv-reading-fields">
      <div><dt>解决什么</dt><dd>{paper.problem}</dd></div>
      <div><dt>核心方法</dt><dd>{paper.method}</dd></div>
      <div><dt>适用与代价</dt><dd>{paper.boundary}</dd></div>
    </dl>
    <div className="kv-reading-links">
      {source && <a href={source} target="_blank" rel="noreferrer">原始论文 <ArrowUpRight size={13} aria-hidden="true" /></a>}
      <Link to={{ search: `view=papers&part=kv-paper-${paper.slug}` }} aria-label={`定位 ${paper.shortName} 简介`}>本篇链接</Link>
    </div>
    <details className="kv-reading-basis"><summary>原文核对范围</summary>
      <p>{paper.readingScope}</p>
      <p>版本日期 <time dateTime={entry.sourceDay}>{entry.sourceDay}</time> · 核对于 {entry.checkedAt}</p>
      <ul>{paper.sources.map((item) => {
        const url = safeTopicSource(item.url);
        return url ? <li key={item.url}><a href={url} target="_blank" rel="noreferrer">{item.label} <ArrowUpRight size={12} aria-hidden="true" /></a></li> : null;
      })}</ul>
    </details>
  </li>;
}

export default function KvPapers() {
  const [query, setQuery] = useSearchParams();
  const all = filterPapers(kvResearch.entries, new URLSearchParams());
  const papers = filterPapers(kvResearch.entries, query);
  function filter(key: string, value: string) {
    const next = paperViewQuery(query);
    next.delete("part");
    if (value) next.set(key, value);
    else next.delete(key);
    setQuery(next, { replace: true });
  }
  return <article className="kv-study kv-papers">
    <header className="kv-study-intro">
      <p className="kv-direction">论文阅读 · 首批 {all.length} 篇</p>
      <h2>从论文理解 KV Cache</h2>
      <p>先看缓存怎样分配与复用，再看容量不足时怎样压缩、淘汰和恢复。每篇简述问题、方法与适用条件，可直接打开原文。</p>
      <p className="kv-muted">首批选题来自文献整理，简介经公开原论文核对。以下为阅读归纳，尚未进行独立实验。</p>
      <p className="kv-reading-start">建议先读 <Link to={{ search: "view=papers&part=kv-paper-pagedattention" }}>PagedAttention</Link> 和 <Link to={{ search: "view=papers&part=kv-paper-sglang" }}>SGLang</Link>，理解分页管理与前缀复用，再按研究问题选择。</p>
    </header>
    <div className="topic-filters kv-paper-filters" role="search" aria-label="检索 KV 论文">
      <label>研究问题<select aria-label="论文研究问题" value={researchTopicFilter(query)} onChange={(event) => filter("topic", event.target.value)}>
        <option value="">全部问题</option>
        {kvResearch.taxonomy.map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}
      </select></label>
      <label className="kv-paper-search"><span>检索论文</span><input type="search" value={query.get("q") ?? ""} placeholder="论文名或关键词" onChange={(event) => filter("q", event.target.value)} /></label>
      <button type="button" onClick={() => setQuery({ view: "papers" }, { replace: true })}>清除筛选</button>
      <span role="status" aria-live="polite">{papers.length} 篇论文</span>
    </div>
    {papers.length ? <ul className="kv-reading-list">{papers.map((entry) => <PaperCard key={entry.id} entry={entry} />)}</ul>
      : <p className="kv-paper-empty" role="status">当前筛选下没有论文，可以清除筛选或更换关键词。</p>}
    <p className="kv-muted">同一论文可关联多个研究问题，总量按论文身份去重。会议年份与所引用的预印本版本日期分别标明。</p>
  </article>;
}

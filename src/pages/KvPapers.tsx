import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  filterPapers, kvResearch, paperCollectionFilter, paperViewQuery, researchSourceDate, researchTopicFilter,
  type PaperCollection, type PaperEntry,
} from "./kv-research";
import { safeTopicSource } from "./topic-report";
import "./kv-papers.css";

function PaperRecommendations({ papers }: { papers: PaperEntry[] }) {
  return <section className="kv-paper-recommendations" aria-labelledby="kv-paper-recommendations-title">
    <div className="kv-section-heading">
      <div>
        <h3 id="kv-paper-recommendations-title">推荐先读</h3>
        <p>先理解分页和前缀复用，再按关心的问题选读。</p>
      </div>
      <Link className="kv-action" to={{ search: "view=papers&collection=recommended" }}>
        只看这 {papers.length} 篇 <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
    <ul className="kv-paper-recommendation-list">
      {papers.map(({ id, paper }) => <li key={id}>
        <Link to={{ search: `view=papers&part=kv-paper-${paper.slug}` }}>{paper.shortName}</Link>
        <p>{paper.recommendedReason}</p>
      </li>)}
    </ul>
  </section>;
}

function PaperCard({ entry, collection }: { entry: PaperEntry; collection: PaperCollection }) {
  const { paper } = entry;
  const id = `kv-paper-${paper.slug}`;
  const source = safeTopicSource(entry.url);
  const date = researchSourceDate(entry);
  const isSurvey = paper.format === "survey";
  return <li className="kv-reading-card" id={id} data-paper-id={entry.id} tabIndex={-1}>
    <div className="kv-reading-meta">
      <span>{paper.venue}</span><span>{entry.sourceVersion}</span>
      {paper.collection === "notes-supplement" && <span className="kv-paper-badge">笔记增补</span>}
      {isSurvey && <span className="kv-paper-badge">综述</span>}
    </div>
    <h3>{entry.title}</h3>
    <p className="kv-reading-original" lang="en">{entry.originalTitle}</p>
    {collection === "recommended" && <p className="kv-paper-reading-tip">{paper.recommendedReason}</p>}
    <div className="kv-material-topics" aria-label="论文关联研究问题">
      {entry.topics.map((topicId) => {
        const search = new URLSearchParams({ view: "papers", topic: topicId });
        if (collection) search.set("collection", collection);
        return <Link key={topicId} className={topicId === entry.primaryTopic ? "primary" : ""} to={{ search: search.toString() }}>
          {kvResearch.taxonomy.find((topic) => topic.id === topicId)?.label}
        </Link>;
      })}
    </div>
    <dl className="kv-reading-fields">
      <div><dt>{isSurvey ? "关注什么" : "研究问题"}</dt><dd>{paper.problem}</dd></div>
      <div><dt>{isSurvey ? "综述内容" : "核心方法"}</dt><dd>{paper.method}</dd></div>
      <div><dt>{isSurvey ? "阅读提示" : "适用条件与局限"}</dt><dd>{paper.boundary}</dd></div>
    </dl>
    <div className="kv-reading-links">
      {source && <a href={source} target="_blank" rel="noreferrer">原始论文 <ArrowUpRight size={13} aria-hidden="true" /></a>}
      <Link to={{ search: `view=papers&part=${id}` }} aria-label={`定位 ${paper.shortName} 简介`}>本篇链接</Link>
    </div>
    <details className="kv-reading-basis"><summary>原文核对范围</summary>
      <p>{paper.readingScope}</p>
      <p>{entry.sourceDay ? "版本日期" : "发表月份"} <time dateTime={date}>{date}</time> · 核对日期 {entry.checkedAt}</p>
      <ul>{paper.sources.map((item) => {
        const url = safeTopicSource(item.url);
        return url ? <li key={item.url}><a href={url} target="_blank" rel="noreferrer">{item.label} <ArrowUpRight size={12} aria-hidden="true" /></a></li> : null;
      })}</ul>
    </details>
  </li>;
}

export default function KvPapers() {
  const [query, setQuery] = useSearchParams();
  const collection = paperCollectionFilter(query);
  const topic = researchTopicFilter(query);
  const keyword = query.get("q") ?? "";
  const all = filterPapers(kvResearch.entries, new URLSearchParams());
  const recommended = all.filter(({ paper }) => paper.recommendedReason);
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
      <p className="kv-direction">论文阅读 · {all.length} 篇</p>
      <h2>从论文理解 KV Cache</h2>
      <p>按研究问题查找论文，了解每篇的方法与适用条件，再跳到原文核对细节。</p>
    </header>
    {!collection && !topic && !keyword.trim() && recommended.length > 0 &&
      <PaperRecommendations papers={recommended} />}
    <div className="topic-filters kv-paper-filters" role="search" aria-label="检索 KV 论文">
      <label>研究问题<select aria-label="论文研究问题" value={topic} onChange={(event) => filter("topic", event.target.value)}>
        <option value="">全部问题</option>
        {kvResearch.taxonomy.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>收录范围<select aria-label="论文收录范围" value={collection} onChange={(event) => filter("collection", event.target.value)}>
        <option value="">全部论文</option>
        <option value="recommended">推荐先读</option>
        <option value="notes-supplement">笔记增补</option>
      </select></label>
      <label className="kv-paper-search">
        <span>检索论文</span>
        <input type="search" value={keyword} placeholder="论文名或关键词" onChange={(event) => filter("q", event.target.value)} />
      </label>
      <button type="button" onClick={() => setQuery({ view: "papers" }, { replace: true })}>清除筛选</button>
      <span role="status" aria-live="polite">{papers.length} 篇论文</span>
    </div>
    {papers.length ? <ul className="kv-reading-list">
      {papers.map((entry) => <PaperCard key={entry.id} entry={entry} collection={collection} />)}
    </ul> : <p className="kv-paper-empty" role="status">当前筛选下没有论文，可以清除筛选或更换关键词。</p>}
    <p className="kv-muted">简介依据公开原文整理。展开“原文核对范围”可查看所读章节和版本日期。</p>
  </article>;
}

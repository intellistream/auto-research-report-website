import { ArrowRight, ArrowUpRight, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  filterPapers, kvResearch, paperCollectionFilter, paperViewQuery, researchSourceDate, researchTopicFilter,
  type PaperCollection, type PaperEntry,
} from "./kv-research";
import { revealTopicPart, safeTopicSource } from "./topic-report";
import "./kv-papers.css";

const paperFiltersPart = "kv-papers-filters";

const collectionLabels: Record<PaperCollection, string> = {
  "": "全部论文",
  recommended: "推荐先读",
  "notes-supplement": "笔记增补",
};

function PaperFilterLink({ search, children }: { search: URLSearchParams; children: ReactNode }) {
  const [current] = useSearchParams();
  const target = paperViewQuery(search);
  target.set("part", paperFiltersPart);
  return <Link to={{ search: target.toString() }} onClick={(event) => {
    // The topic view handles new anchors. The same anchor can be selected again after scrolling.
    if (current.get("part") === paperFiltersPart && event.button === 0 &&
      !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      requestAnimationFrame(() =>
        revealTopicPart(document, paperFiltersPart, window.matchMedia("(prefers-reduced-motion: reduce)").matches));
    }
  }}>{children}</Link>;
}

function PaperRecommendations({ papers }: { papers: PaperEntry[] }) {
  return <section className="kv-paper-recommendations" aria-labelledby="kv-paper-recommendations-title">
    <div className="kv-section-heading">
      <div>
        <h3 id="kv-paper-recommendations-title">推荐先读</h3>
        <p>先理解分页和前缀复用，再按关心的问题选读。</p>
      </div>
      <span className="kv-paper-recommendation-action">
        <PaperFilterLink search={new URLSearchParams({ view: "papers", collection: "recommended" })}>
          只看这 {papers.length} 篇 <ArrowRight size={14} aria-hidden="true" />
        </PaperFilterLink>
      </span>
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
  const topics = kvResearch.taxonomy.filter(({ id }) => entry.topics.includes(id));
  const primary = topics.find(({ id }) => id === entry.primaryTopic);
  const related = topics.filter(({ id }) => id !== entry.primaryTopic);
  return <li className="kv-reading-card" id={id} data-paper-id={entry.id} tabIndex={-1}>
    <div className="kv-reading-meta">
      <span>{paper.venue}</span><span>{entry.sourceVersion}</span>
      {paper.collection === "notes-supplement" && <span className="kv-paper-badge">笔记增补</span>}
      {isSurvey && <span className="kv-paper-badge">综述</span>}
    </div>
    <h3>{entry.title}</h3>
    <p className="kv-reading-original" lang="en">{entry.originalTitle}</p>
    {collection === "recommended" && <p className="kv-paper-reading-tip">{paper.recommendedReason}</p>}
    {topics.length > 0 && <dl className="kv-paper-topics">
      {primary && <div><dt>主主题</dt><dd>{primary.label}</dd></div>}
      {related.length > 0 && <div><dt>关联主题</dt><dd>{related.map(({ label }) => label).join("、")}</dd></div>}
    </dl>}
    {topics.length > 0 && <details className="kv-paper-related">
      <summary>查看同主题论文</summary>
      <ul aria-label="按研究问题筛选">
        {[...(primary ? [primary] : []), ...related].map(({ id: topicId, label }) => {
          const search = new URLSearchParams({ view: "papers", topic: topicId });
          if (collection) search.set("collection", collection);
          return <li key={topicId}><PaperFilterLink search={search}>{label}</PaperFilterLink></li>;
        })}
      </ul>
    </details>}
    {paper.takeaway && <p className="kv-reading-takeaway">
      <strong>核心要点</strong>
      {paper.takeaway}
    </p>}
    <dl className="kv-reading-fields">
      <div><dt>{isSurvey ? "关注什么" : "研究问题"}</dt><dd>{paper.problem}</dd></div>
      <div>
        <dt>{isSurvey ? "综述内容" : "核心方法"}</dt>
        <dd className="kv-reading-method">
          {paper.method.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </dd>
      </div>
      {paper.result && <div><dt>论文结果</dt><dd>{paper.result}</dd></div>}
      <div><dt>{isSurvey ? "阅读提示" : "适用条件与局限"}</dt><dd>{paper.boundary}</dd></div>
    </dl>
    <div className="kv-reading-links">
      {source && <a href={source} target="_blank" rel="noreferrer">原始论文 <ArrowUpRight size={13} aria-hidden="true" /></a>}
      <Link to={{ search: `view=papers&part=${id}` }} aria-label={`定位 ${paper.shortName} 解读`}>本篇链接</Link>
      {primary && <Link to={{ search: `view=survey&topic=${primary.id}` }}>查看主主题的方法比较</Link>}
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
  const topicLabel = kvResearch.taxonomy.find(({ id }) => id === topic)?.label;
  const all = filterPapers(kvResearch.entries, new URLSearchParams());
  const recommended = all.filter(({ paper }) => paper.recommendedReason);
  const papers = filterPapers(kvResearch.entries, query);

  function filter(key: string, value: string) {
    const next = paperViewQuery(query);
    if (next.get("part") !== paperFiltersPart) next.delete("part");
    if (value) next.set(key, value);
    else next.delete(key);
    setQuery(next, { replace: true });
  }

  return <article className="kv-study kv-papers">
    <header className="kv-study-intro">
      <p className="kv-direction">论文阅读 · {all.length} 篇</p>
      <h2>从论文理解 KV Cache</h2>
      <p>每篇解读说明问题从哪里来、方法怎样运行，以及结论在什么条件下成立。</p>
      <p><Link to={{ search: "view=survey" }}>比较不同论文的方法与条件</Link></p>
    </header>
    {!collection && !topic && !keyword.trim() && recommended.length > 0 &&
      <PaperRecommendations papers={recommended} />}
    <div id={paperFiltersPart} className="topic-filters kv-paper-filters" role="search" aria-label="检索 KV 论文" tabIndex={-1}>
      <label>研究问题<select aria-label="论文研究问题" value={topic} onChange={(event) => filter("topic", event.target.value)}>
        <option value="">全部问题</option>
        {kvResearch.taxonomy.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>收录范围<select aria-label="论文收录范围" value={collection} onChange={(event) => filter("collection", event.target.value)}>
        <option value="">{collectionLabels[""]}</option>
        <option value="recommended">{collectionLabels.recommended}</option>
        <option value="notes-supplement">{collectionLabels["notes-supplement"]}</option>
      </select></label>
      <label className="kv-paper-search">
        <span>检索论文</span>
        <input type="search" value={keyword} placeholder="论文名或关键词" onChange={(event) => filter("q", event.target.value)} />
      </label>
      {(collection || topic || keyword) && <PaperFilterLink search={new URLSearchParams()}>清除筛选</PaperFilterLink>}
    </div>
    <div className="kv-paper-result-bar">
      <div className="kv-paper-result-summary" role="status" aria-live="polite">
        <div className="kv-paper-result-heading">
          <span>当前主题</span>
          <strong className="kv-paper-result-topic">{topicLabel ?? (topic ? "未知研究问题" : "全部研究问题")}</strong>
        </div>
        <div className="kv-paper-result-meta">
          <span>
            {papers.length} 篇论文
            {collection && <> · {collectionLabels[collection]}</>}
          </span>
          {keyword.trim() && <span className="kv-paper-result-keyword" title={keyword.trim()}>关键词 {keyword.trim()}</span>}
        </div>
      </div>
      <PaperFilterLink search={query}><SlidersHorizontal size={14} aria-hidden="true" /> 调整筛选</PaperFilterLink>
    </div>
    {papers.length ? <ul className="kv-reading-list">
      {papers.map((entry) => <PaperCard key={entry.id} entry={entry} collection={collection} />)}
    </ul> : <p className="kv-paper-empty">当前筛选下没有论文，可以清除筛选或更换关键词。</p>}
    <p className="kv-muted">解读依据公开原文整理。展开“原文核对范围”可查看对应章节和版本日期。</p>
  </article>;
}

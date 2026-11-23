import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import KvMaterialLibrary from "./KvMaterialLibrary";
import KvPapers from "./KvPapers";
import KvResearchOverview from "./KvResearchOverview";
import KvBasics from "./KvBasics";
import KvCommunityReport from "./KvCommunityReport";
import { KvMethodComparison, KvHistoricalReport } from "./KvCacheStudy";
import { filterPapers, kvResearch, paperViewQuery, researchTopicFilter } from "./kv-research";
import { communityEntries } from "./kv-community";
import { revealTopicPart } from "./topic-report";
import "./kv-sections.css";

const sections = [
  { id: "guide", label: "KV 入门", purpose: "理解缓存怎样工作" },
  { id: "papers", label: "论文", purpose: "掌握方法与适用条件" },
  { id: "report", label: "社区 PR", purpose: "跟踪实现进展与变化" },
] as const;

export function kvTopicView(query: URLSearchParams) {
  const view = query.get("view");
  // Old material-library paper links now land in the dedicated reading section.
  if (view === "evidence" && query.get("kind") === "paper") return "papers";
  if (["guide", "papers", "survey", "compare", "report", "evidence"].includes(view ?? "")) return view!;
  if (!view && ["repo", "label", "topic", "kind", "month"].some((key) => query.has(key))) {
    return query.get("kind") === "paper" ? "papers" : "evidence";
  }
  return "guide";
}

export function KvCacheTopicCard() {
  const papers = filterPapers(kvResearch.entries, new URLSearchParams());
  return <li className="topic-card survey-directory-card">
    <div className="survey-card-top"><span className="survey-status">独立专题</span></div>
    <h2><Link to="/topics/kv-cache">KV Cache <ArrowUpRight size={16} aria-hidden="true" /></Link></h2>
    <p>理解 KV 的工作过程，比较论文方法，跟踪社区实现与验证进展。</p>
    <div className="topic-meta"><span>{communityEntries.length} 条 PR</span><span>{papers.length} 篇论文</span></div>
    <div className="kv-topic-card-sections">{sections.map(({ id, label }) =>
      <Link key={id} to={{ pathname: "/topics/kv-cache", search: `view=${id}` }}>{label}</Link>)}</div>
  </li>;
}

export default function KvCacheTopic() {
  const [query] = useSearchParams();
  const view = kvTopicView(query);
  const part = query.get("part");
  const edition = query.get("edition");
  const section = view === "guide" ? "guide" : ["papers", "survey"].includes(view) ? "papers" : "report";
  const topic = researchTopicFilter(query);
  useEffect(() => {
    if (!part) { window.scrollTo(0, 0); return; }
    const frame = requestAnimationFrame(() => revealTopicPart(
      document, part, window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ));
    return () => cancelAnimationFrame(frame);
  }, [view, part, edition]);

  function paperSearch() {
    const next = paperViewQuery(query);
    next.delete("part");
    return next.toString();
  }

  return <div className="kv-topic">
    <Link className="topic-back" to="/topics"><ArrowLeft size={16} aria-hidden="true" /> 专题目录</Link>
    <header className="topic-heading kv-topic-heading">
      <p className="kv-topic-kicker">独立技术专题</p>
      <h1>{kvResearch.title}</h1>
      <p>从基础知识出发，理解论文方法，跟踪社区实现的进展与边界。</p>
    </header>
    <nav className="kv-topic-nav kv-primary-nav" aria-label="KV Cache 三大板块">
      {sections.map(({ id, label, purpose }) =>
        <Link key={id} to={{ search: `view=${id}` }} aria-current={section === id ? "page" : undefined}>
          <strong>{label}</strong><span>{purpose}</span>
        </Link>)}
    </nav>
    {section === "papers" && <nav className="kv-subnav" aria-label="论文板块页面">
      <Link to={{ search: paperSearch() }} aria-current={view === "papers" ? "page" : undefined}>论文解读</Link>
      <Link to={{ search: `view=survey${topic ? `&topic=${topic}` : ''}` }} aria-current={view === "survey" ? "page" : undefined}>方法比较</Link>
    </nav>}
    {section === "report" && <nav className="kv-subnav" aria-label="社区 PR 板块页面">
      <Link to={{ search: "view=report" }} aria-current={view === "report" || view === "compare" ? "page" : undefined}>动态报告</Link>
      <Link to={{ search: `view=evidence${topic ? `&topic=${topic}` : ''}` }} aria-current={view === "evidence" ? "page" : undefined}>PR 列表与趋势</Link>
    </nav>}
    {view === "guide" && <KvBasics />}
    {view === "papers" && <KvPapers />}
    {view === "survey" && <KvResearchOverview />}
    {view === "compare" && <KvMethodComparison />}
    {view === "report" && (edition === "2026-11-17" ? <KvHistoricalReport /> : <KvCommunityReport />)}
    {view === "evidence" && <KvMaterialLibrary />}
  </div>;
}

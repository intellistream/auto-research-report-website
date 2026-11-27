import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import TopicDirectoryCard from "./TopicDirectoryCard";
import { Link, useSearchParams } from "react-router-dom";
import KvMaterialLibrary from "./KvMaterialLibrary";
import KvPapers from "./KvPapers";
import KvResearchOverview from "./KvResearchOverview";
import KvTopicOverview from "./KvTopicOverview";
import KvBasics from "./KvBasics";
import KvCommunityReport from "./KvCommunityReport";
import KvPrTrends from "./KvPrTrends";
import { KvMethodComparison } from "./KvCacheStudy";
import { filterPapers, kvResearch, paperViewQuery, researchTopicFilter } from "./kv-research";
import { communityEntries } from "./kv-community";
import { revealTopicPart } from "./topic-report";
import { parseKvGuideState, withKvGuideState } from "./kv-guide-state";
import "./kv-sections.css";

const sections = [
  { id: "guide", label: "导引", purpose: "理解缓存怎样工作" },
  { id: "papers", label: "论文", purpose: "掌握方法与适用条件" },
  { id: "report", label: "社区进展", purpose: "跟踪实现进展与变化" },
  { id: "overview", label: "综合分析", purpose: "把握整体进展与待解问题" },
] as const;

export function kvTopicView(query: URLSearchParams) {
  const view = query.get("view");
  // Old material-library paper links now land in the dedicated reading section.
  if (view === "evidence" && query.get("kind") === "paper") return "papers";
  if (["guide", "papers", "survey", "overview", "compare", "report", "trends", "evidence"].includes(view ?? "")) return view!;
  if (!view && ["repo", "label", "topic", "kind", "month"].some((key) => query.has(key))) {
    return query.get("kind") === "paper" ? "papers" : "evidence";
  }
  return "guide";
}

export function KvCacheTopicCard() {
  const papers = filterPapers(kvResearch.entries, new URLSearchParams());
  const vllmCount = communityEntries.filter(entry => entry.repository === "vllm").length;
  const ascendCount = communityEntries.filter(entry => entry.repository === "vllm-ascend").length;
  return (
    <TopicDirectoryCard
      title="KV Cache"
      description="理解 KV 的工作过程，比较论文方法，把握整体进展与待解问题。"
      path="/topics/kv-cache"
      summary={`${communityEntries.length} 条工程 PR`}
      detail={`${papers.length} 篇论文`}
      repositories={{ vllm: vllmCount, "vllm-ascend": ascendCount }}
      sections={sections.map(section => ({ ...section, search: `view=${section.id}` }))}
    />
  );
}

export default function KvCacheTopic() {
  const [query] = useSearchParams();
  const view = kvTopicView(query);
  const part = query.get("part");
  const edition = query.get("edition");
  const week = query.get("week");
  const section = view === "guide" ? "guide" : ["papers", "survey"].includes(view) ? "papers" : view === "overview" ? "overview" : "report";
  const topic = researchTopicFilter(query);
  useEffect(() => {
    if (!part) { window.scrollTo(0, 0); return; }
    const frame = requestAnimationFrame(() => revealTopicPart(
      document, part, window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ));
    return () => cancelAnimationFrame(frame);
  }, [view, part, edition, week]);

  function sectionSearch(view: string, selectedTopic?: string) {
    const next = new URLSearchParams({ view });
    if (selectedTopic) next.set("topic", selectedTopic);
    return withKvGuideState(next, parseKvGuideState(query).state).toString();
  }

  function paperSearch() {
    const next = paperViewQuery(query);
    next.delete("part");
    return next.toString();
  }

  return <div className={"kv-topic" + (view === "guide" ? " kv-topic-is-guide" : "")}>
    <Link className="topic-back" to="/topics"><ArrowLeft size={16} aria-hidden="true" /> 专题目录</Link>
    <header className="topic-heading kv-topic-heading">
      <p className="kv-topic-kicker">独立技术专题</p>
      <h1>{kvResearch.title}</h1>
      <p>从基础知识出发，理解论文方法，把握整体进展，跟踪社区实现的变化与边界。</p>
    </header>
    <nav className="kv-topic-nav kv-primary-nav" aria-label="KV Cache 专题板块">
      {sections.map(({ id, label, purpose }) =>
        <Link key={id} to={{ search: sectionSearch(id) }} aria-current={section === id ? "page" : undefined}>
          <strong>{label}</strong><span>{purpose}</span>
        </Link>)}
    </nav>
    {section === "papers" && <nav className="kv-subnav" aria-label="论文板块页面">
      <Link to={{ search: paperSearch() }} aria-current={view === "papers" ? "page" : undefined}>论文解读</Link>
      <Link to={{ search: sectionSearch("survey", topic) }} aria-current={view === "survey" ? "page" : undefined}>方法比较</Link>
    </nav>}
    {section === "report" && <nav className="kv-subnav" aria-label="社区进展 板块页面">
      <Link to={{ search: sectionSearch("report") }} aria-current={view === "report" || view === "compare" ? "page" : undefined}>每周总结</Link>
      <Link to={{ search: sectionSearch("trends") }} aria-current={view === "trends" ? "page" : undefined}>PR 趋势分析</Link>
      <Link to={{ search: sectionSearch("evidence", topic) }} aria-current={view === "evidence" ? "page" : undefined}>全部 PR</Link>
    </nav>}
    {view === "guide" && <KvBasics />}
    {view === "papers" && <KvPapers />}
    {view === "survey" && <KvResearchOverview />}
    {view === "overview" && <KvTopicOverview />}
    {view === "compare" && <KvMethodComparison />}
    {view === "report" && <KvCommunityReport />}
    {view === "trends" && <KvPrTrends />}
    {view === "evidence" && <KvMaterialLibrary />}
  </div>;
}

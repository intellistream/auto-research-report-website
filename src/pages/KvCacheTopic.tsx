import { useEffect } from "react";
import TopicDetailLayout, { TopicSectionNav } from "./TopicDetailLayout";
import TopicDirectoryCard from "./TopicDirectoryCard";
import { useSearchParams } from "react-router-dom";
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

const path = "/topics/kv-cache";
const sections = [
  { id: "guide", label: "导引" },
  { id: "papers", label: "论文" },
  { id: "report", label: "社区进展" },
  { id: "overview", label: "综合分析" },
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
      title={kvResearch.title}
      description="理解 KV 的工作过程，比较论文方法，把握整体进展与待解问题。"
      path={path}
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

  return <TopicDetailLayout
    className="kv-topic"
    title={kvResearch.title}
    subtitle="从基础知识出发，理解论文方法，把握整体进展，跟踪社区实现的变化与边界。"
    sections={sections.map(({ id, label }) => ({
      label,
      to: { pathname: path, search: sectionSearch(id) },
      current: section === id ? "page" : undefined,
    }))}
  >
    {section === "papers" && <TopicSectionNav
      secondary
      label="论文板块页面"
      sections={[
        { label: "论文解读", to: { search: paperSearch() }, current: view === "papers" ? "page" : undefined },
        { label: "方法比较", to: { search: sectionSearch("survey", topic) }, current: view === "survey" ? "page" : undefined },
      ]}
    />}
    {section === "report" && <TopicSectionNav
      secondary
      label="社区进展 板块页面"
      sections={[
        { label: "每周总结", to: { search: sectionSearch("report") }, current: view === "report" || view === "compare" ? "page" : undefined },
        { label: "PR 趋势分析", to: { search: sectionSearch("trends") }, current: view === "trends" ? "page" : undefined },
        { label: "全部 PR", to: { search: sectionSearch("evidence", topic) }, current: view === "evidence" ? "page" : undefined },
      ]}
    />}
    {view === "guide" && <KvBasics />}
    {view === "papers" && <KvPapers />}
    {view === "survey" && <KvResearchOverview />}
    {view === "overview" && <KvTopicOverview />}
    {view === "compare" && <KvMethodComparison />}
    {view === "report" && <KvCommunityReport />}
    {view === "trends" && <KvPrTrends />}
    {view === "evidence" && <KvMaterialLibrary />}
  </TopicDetailLayout>;
}

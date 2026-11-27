import { useEffect } from "react";
import TopicDetailLayout from "./TopicDetailLayout";
import TopicDirectoryCard from "./TopicDirectoryCard";
import { useSearchParams } from "react-router-dom";
import AclGraphGuide from "./AclGraphGuide";
import AclGraphAnalysis from "./AclGraphAnalysis";
import { ACLGRAPH_PROBLEMS, findAclGraphCardById, getAclGraphAnalysisStats, type AclGraphProblem } from "./aclgraph-analysis";

const title = "ACL Graph";
const subtitle = "昇腾推理图执行：捕获、重放与动态状态";
const path = "/topics/aclgraph";
const description = "从导引理解捕获、重放与动态状态，再在专题剖析中按核心问题辨析 Research Gap、论文方法与社区 PR。";
const sections = [
  { id: "guide", label: "导引", search: "" },
  { id: "analysis", label: "专题剖析", search: "view=analysis" },
] as const;

export function resolveAclGraphSearch(query: URLSearchParams, problems: readonly AclGraphProblem[] = ACLGRAPH_PROBLEMS) {
  const view = query.get("view");
  const part = query.get("part");
  const section = view === "analysis" || view === "report" || view === "evidence"
    || (view === null && (query.has("read") || Boolean(part?.startsWith("survey-"))))
    ? "analysis" : "guide";
  const normalizedParams = new URLSearchParams();
  for (const [key, value] of query) {
    if (/^utm_/i.test(key)) normalizedParams.append(key, value);
  }
  let problemId: string | undefined;
  let cardId: string | undefined;
  if (section === "analysis") {
    normalizedParams.set("view", "analysis");
    const rawCard = query.get("card");
    const entry = rawCard ? findAclGraphCardById(rawCard, problems) : undefined;
    const rawProblem = query.get("problem");
    problemId = entry?.problem.id ?? (problems.some(problem => problem.id === rawProblem) ? rawProblem ?? undefined : undefined);
    cardId = entry?.card.id;
    if (problemId) normalizedParams.set("problem", problemId);
    if (cardId) normalizedParams.set("card", cardId);
  }
  return { section, problemId, cardId, normalizedParams, needsNormalize: normalizedParams.toString() !== query.toString() };
}

export function AclGraphTopicCard() {
  const stats = getAclGraphAnalysisStats();
  return (
    <TopicDirectoryCard
      title={title}
      description={description}
      path={path}
      status="技术专题 · 问题驱动剖析"
      summary={`${stats.problems} 大核心问题 · ${stats.prs} 条工程 PR`}
      detail={`${stats.papers} 篇论文 · ${stats.fulltextPapers} 篇全文精读`}
      repositories={{ vllm: stats.upstreamPrs, "vllm-ascend": stats.ascendPrs }}
      sections={sections}
    />
  );
}

export default function AclGraphTopic() {
  const [query, setQuery] = useSearchParams();
  const resolved = resolveAclGraphSearch(query);
  const section = resolved.section;
  const hasAnalysisTarget = Boolean(resolved.problemId || resolved.cardId);
  useEffect(() => {
    if (typeof window !== "undefined" && !hasAnalysisTarget) window.scrollTo(0, 0);
  }, [section, hasAnalysisTarget]);
  useEffect(() => {
    if (resolved.needsNormalize) setQuery(resolved.normalizedParams, { replace: true });
  }, [resolved.needsNormalize, resolved.normalizedParams, setQuery]);

  return <TopicDetailLayout title={title} subtitle={subtitle} sections={sections.map(({ id, label, search }) => ({
    label,
    to: { pathname: path, search },
    current: section === id ? "page" : undefined,
  }))}>
    {section === "guide" && <AclGraphGuide />}
    {section === "analysis" && <AclGraphAnalysis />}
  </TopicDetailLayout>;
}

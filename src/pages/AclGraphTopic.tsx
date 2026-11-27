import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import AclGraphGuide from "./AclGraphGuide";
import AclGraphAnalysis from "./AclGraphAnalysis";
import { ACLGRAPH_PROBLEMS, findAclGraphCardById, getAclGraphAnalysisStats, type AclGraphProblem } from "./aclgraph-analysis";
import "./aclgraph-topic.css";

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

export function AclGraphTopicCard(_props: { topic?: Topic }) {
  const stats = getAclGraphAnalysisStats();
  return (
    <li className="topic-directory-card">
      <div className="survey-card-top">
        <span className="survey-status">技术专题 · 问题驱动剖析</span>
        <span className="topic-meta">{stats.problems} 大核心问题 · {stats.prs} 条工程 PR</span>
      </div>
      <h2>
        <Link to={path}>
          {title} <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </h2>
      <p className="eng-dir-desc">{description}</p>
      <p className="topic-meta">{stats.papers} 篇论文 · {stats.fulltextPapers} 篇全文精读</p>
      <div className="eng-dir-bar-wrap">
        <div className="eng-dir-ratio-bar" aria-hidden="true">
          <span className="bar-vllm" style={{ width: `${stats.prs ? 100 * stats.upstreamPrs / stats.prs : 0}%` }} />
          <span className="bar-ascend" style={{ width: `${stats.prs ? 100 * stats.ascendPrs / stats.prs : 0}%` }} />
        </div>
        <div className="eng-dir-counts">
          <span>
            <i className="dot-vllm" /> vLLM <strong>{stats.upstreamPrs}</strong>
          </span>
          <span><i className="dot-ascend" /> vLLM Ascend <strong>{stats.ascendPrs}</strong></span>
        </div>
      </div>
      <div className="acl-topic-card-sections">
        {sections.map(({ id, label, search }) => (
          <Link key={id} to={{ pathname: path, search }}>
            {label}
          </Link>
        ))}
      </div>
    </li>
  );
}

export default function AclGraphTopic(_props: { topic: Topic }) {
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

  return <div className="acl-topic">
    <Link className="topic-back" to="/topics"><ArrowLeft size={16} aria-hidden="true" /> 专题目录</Link>
    <header className="acl-topic-header">
      <p className="acl-topic-kicker">技术专题</p>
      <h1>{title}</h1>
      <p className="acl-topic-subtitle">{subtitle}</p>
    </header>
    <nav className="acl-topic-nav" aria-label="ACL Graph 专题分区">
      {sections.map(({ id, label, search }) =>
        <Link key={id} to={{ pathname: path, search }} aria-current={section === id ? "page" : undefined}>{label}</Link>)}
    </nav>
    {section === "guide" && <AclGraphGuide />}
    {section === "analysis" && <AclGraphAnalysis />}
  </div>;
}

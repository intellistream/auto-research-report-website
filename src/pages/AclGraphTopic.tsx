import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import AclGraphGuide from "./AclGraphGuide";
import TopicAcademicPaper from "./TopicAcademicPaper";
import TopicResearchReport from "./TopicResearchReport";
import "./aclgraph-topic.css";

const title = "ACL Graph";
const subtitle = "昇腾推理图执行：捕获、回放与动态状态";
const path = "/topics/aclgraph";
const sections = [
  { id: "guide", label: "导引", search: "" },
  { id: "paper", label: "综述", search: "view=paper" },
  { id: "report", label: "动态报告", search: "view=report" },
] as const;

export function AclGraphTopicCard({ topic }: { topic?: Topic }) {
  const ascendCount = topic?.counts.byRepository["vllm-ascend"] ?? topic?.counts.total ?? 11;
  return (
    <li className="topic-directory-card">
      <div className="survey-card-top">
        <span className="survey-status">技术专题 · 旗舰综述</span>
        {topic && (
          <span className="topic-meta">
            {topic.counts.total} 条工程证据 · 截至 {topic.coverage.lastDay}
          </span>
        )}
      </div>
      <h2>
        <Link to={path}>
          {title} <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </h2>
      <p className="eng-dir-desc">{topic?.description || subtitle}</p>
      <div className="eng-dir-bar-wrap">
        <div className="eng-dir-ratio-bar" aria-hidden="true">
          <span className="bar-ascend" style={{ width: "100%" }} />
        </div>
        <div className="eng-dir-counts">
          <span>
            <i className="dot-ascend" /> vLLM Ascend <strong>{ascendCount}</strong>
          </span>
          <span>含综述稿与动态报告</span>
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

export default function AclGraphTopic({ topic }: { topic: Topic }) {
  const [query, setQuery] = useSearchParams();
  const view = query.get("view");
  const part = query.get("part");
  const legacyEvidence = view === "evidence";
  // Some shared report links predate the view parameter.
  const reportView = legacyEvidence || view === "report" || (!view && (query.has("read") || part?.startsWith("survey-")));
  const section = view === "paper" ? "paper" : reportView ? "report" : "guide";
  useEffect(() => { window.scrollTo(0, 0); }, [section]);
  useEffect(() => {
    if (!legacyEvidence) return;
    const next = new URLSearchParams(query);
    next.set("view", "report");
    next.set("part", part === "survey-appendix" ? part : "survey-pr-trends");
    setQuery(next, { replace: true });
  }, [legacyEvidence, part, query, setQuery]);

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
    {section === "paper" && (topic.academicPaper
      ? <TopicAcademicPaper key={topic.academicPaper.version} topic={topic} paper={topic.academicPaper} embedded />
      : <p>综述准备中。</p>)}
    {section === "report" && (topic.report
      ? <TopicResearchReport key={topic.report.version} topic={topic} report={topic.report} embedded />
      : <p>动态报告准备中。</p>)}
  </div>;
}

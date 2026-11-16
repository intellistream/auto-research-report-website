import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import AclGraphGuide from "./AclGraphGuide";
import TopicAcademicPaper from "./TopicAcademicPaper";
import TopicResearchReport from "./TopicResearchReport";
import { EvidenceList, EvidenceTimeline } from "./TopicEvidence";
import { revealTopicPart } from "./topic-report";
import "./aclgraph-topic.css";

const title = "ACL Graph";
const subtitle = "昇腾推理图执行：捕获、回放与动态状态";
const path = "/topics/aclgraph";
const sections = [
  { id: "guide", label: "导引", search: "" },
  { id: "paper", label: "综述", search: "view=paper" },
  { id: "report", label: "动态报告", search: "view=report" },
  { id: "evidence", label: "PR 与趋势", search: "view=evidence" },
] as const;

export function AclGraphTopicCard() {
  return <li className="topic-card survey-directory-card">
    <div className="survey-card-top"><span className="survey-status">技术专题</span></div>
    <h2><Link to={path}>{title} <ArrowUpRight size={16} aria-hidden="true" /></Link></h2>
    <p>{subtitle}</p>
    <div className="acl-topic-card-sections">{sections.map(({ id, label, search }) =>
      <Link key={id} to={{ pathname: path, search }}>{label}</Link>)}</div>
  </li>;
}

export default function AclGraphTopic({ topic }: { topic: Topic }) {
  const [query] = useSearchParams();
  const view = query.get("view");
  const part = query.get("part");
  // Some shared report links predate the view parameter.
  const reportView = view === "report" || (!view && (query.has("read") || part?.startsWith("survey-")));
  const section = view === "evidence" || (reportView && part === "survey-appendix") ? "evidence"
    : view === "paper" ? "paper" : reportView ? "report" : "guide";
  useEffect(() => { window.scrollTo(0, 0); }, [section]);
  useEffect(() => {
    if (section !== "evidence" || part !== "survey-appendix") return;
    const frame = requestAnimationFrame(() => revealTopicPart(document, part, window.matchMedia("(prefers-reduced-motion: reduce)").matches));
    return () => cancelAnimationFrame(frame);
  }, [section, part]);

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
    {section === "guide" && <AclGraphGuide topic={topic} />}
    {section === "paper" && (topic.academicPaper
      ? <TopicAcademicPaper key={topic.academicPaper.version} topic={topic} paper={topic.academicPaper} embedded />
      : <p>综述准备中。</p>)}
    {section === "report" && (topic.report
      ? <TopicResearchReport key={topic.report.version} topic={topic} report={topic.report} embedded />
      : <p>动态报告准备中。</p>)}
    {section === "evidence" && <div className="acl-topic-evidence survey-page">
      <h2>PR 与趋势</h2>
      <p>追踪开发进展，按社区和子方向筛选 PR，并回到原始 PR 或对应日报。</p>
      {topic.report && <EvidenceTimeline topic={topic} report={topic.report} />}
      <section id="survey-appendix" tabIndex={-1} aria-labelledby="acl-pr-title">
        <h3 id="acl-pr-title">PR 取材索引</h3>
        <p className="survey-muted">覆盖 {topic.coverage.firstDay} 至 {topic.coverage.lastDay}，共 {topic.entries.length} 条线索。收录用于定位来源，可能包含尚未纳入报告分析的条目。</p>
        <EvidenceList entries={topic.entries} labels={topic.labels} />
      </section>
    </div>}
  </div>;
}

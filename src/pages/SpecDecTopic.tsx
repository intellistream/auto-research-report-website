import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import SpecDecGuide from "./SpecDecGuide";
import TopicResearchReport from "./TopicResearchReport";
import { EvidenceList, EvidenceTimeline } from "./TopicEvidence";
import { revealTopicPart } from "./topic-report";
import "./aclgraph-topic.css";

const path = "/topics/speculative-decoding";
const views = [
  { id: "guide", label: "机制导引", search: "" },
  { id: "report", label: "动态研究报告", search: "view=report" },
  { id: "evidence", label: "PR 与趋势", search: "view=evidence" },
] as const;

export function SpecDecTopicCard({ topic }: { topic: Topic }) {
  return <li className="topic-card survey-directory-card">
    <div className="survey-card-top"><span className="survey-status">技术专题 · 持续研究</span></div>
    <h2><Link to={path}>推测解码 <ArrowUpRight size={16} aria-hidden="true" /></Link></h2>
    <p>从候选生成、Target 验证、接受/拒绝到状态提交：算法方法、社区实现与性能归因。</p>
    <div className="acl-topic-card-sections">
      {views.map(({ id, label, search }) => <Link key={id} to={{ pathname: path, search }}>{label}</Link>)}
    </div>
    <div className="topic-meta"><span>{topic.entries.length} 条 PR 线索</span><span>来源截至 {topic.coverage.lastDay}</span></div>
  </li>;
}

export default function SpecDecTopic({ topic }: { topic: Topic }) {
  const [query] = useSearchParams();
  const view = query.get("view");
  const part = query.get("part");
  const reportView = view === "report" || (!view && (query.has("read") || part?.startsWith("survey-")));
  const section = view === "evidence" || (reportView && part === "survey-appendix")
    ? "evidence" : reportView ? "report" : "guide";
  useEffect(() => { window.scrollTo(0, 0); }, [section]);
  useEffect(() => {
    if (section !== "evidence" || part !== "survey-appendix") return;
    const frame = requestAnimationFrame(() => revealTopicPart(document, part, window.matchMedia("(prefers-reduced-motion: reduce)").matches));
    return () => cancelAnimationFrame(frame);
  }, [section, part]);

  return <div className="acl-topic">
    <Link className="topic-back" to="/topics"><ArrowLeft size={16} aria-hidden="true" /> 专题目录</Link>
    <header className="acl-topic-header">
      <p className="acl-topic-kicker">技术专题 · 持续演进</p>
      <h1>Speculative Decoding</h1>
      <p className="acl-topic-subtitle">从 Draft / Verify / Acceptance 到状态正确性与 Serving 加速</p>
    </header>
    <nav className="acl-topic-nav" aria-label="推测解码专题分区">
      {views.map(({ id, label, search }) =>
        <Link key={id} to={{ pathname: path, search }} aria-current={section === id ? "page" : undefined}>{label}</Link>)}
    </nav>
    {section === "guide" && <SpecDecGuide topic={topic} />}
    {section === "report" && (topic.report
      ? <TopicResearchReport key={topic.report.version} topic={topic} report={topic.report} embedded />
      : <p>动态研究报告尚未发布。</p>)}
    {section === "evidence" && <div className="acl-topic-evidence survey-page">
      <h2>PR 与趋势</h2>
      <p>完整保留社区原先分类的 {topic.entries.length} 条 PR；这里是技术演进线索，不是仅由已综合 PR 构成的论文参考文献表。</p>
      {topic.report && <EvidenceTimeline topic={topic} report={topic.report} />}
      <section id="survey-appendix" tabIndex={-1} aria-labelledby="spec-pr-title">
        <h3 id="spec-pr-title">工程线索与日报回溯</h3>
        <p className="survey-muted">来源归档覆盖 {topic.coverage.firstDay} 至 {topic.coverage.lastDay}。按社区或既有分类筛选，点击链接可回到原始 PR 与日报。</p>
        <EvidenceList entries={topic.entries} labels={topic.labels} />
      </section>
    </div>}
  </div>;
}

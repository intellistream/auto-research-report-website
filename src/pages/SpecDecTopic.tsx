import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import SpecDecGuide from "./SpecDecGuide";
import SpecDecSurvey from "./SpecDecSurvey";
import TopicResearchReport from "./TopicResearchReport";
import { validatedSurvey } from "./topic-survey";
import { safeTopicSource } from "./topic-report";
import "./aclgraph-topic.css";

const path = "/topics/speculative-decoding";
const sections = [
  { id: "guide", label: "导引", search: "" },
  { id: "paper", label: "综述", search: "view=paper" },
  { id: "report", label: "动态报告", search: "view=report" },
] as const;

export function SpecDecTopicCard({ topic }: { topic: Topic }) {
  return <li className="topic-card survey-directory-card">
    <div className="survey-card-top"><span className="survey-status">技术专题</span></div>
    <h2><Link to={path}>Speculative Decoding <ArrowUpRight size={16} aria-hidden="true" /></Link></h2>
    <p>候选生成、并行验证、状态正确性与动态 Serving 的系统优化。</p>
    <div className="acl-topic-card-sections">{sections.map(({ id, label, search }) =>
      <Link key={id} to={{ pathname: path, search }}>{label}</Link>)}</div>
    <p className="topic-meta">{topic.entries.length} 条社区 PR 线索</p>
  </li>;
}

export default function SpecDecTopic({ topic }: { topic: Topic }) {
  const [query, setQuery] = useSearchParams();
  const view = query.get("view");
  const part = query.get("part");
  const legacyEvidence = view === "evidence";
  const reportView = legacyEvidence || view === "report" || (!view && (query.has("read") || part?.startsWith("survey-")));
  const section = view === "paper" ? "paper" : reportView ? "report" : "guide";
  const baseline = validatedSurvey(topic)?.candidateBaseline;
  const knownIds = new Set(baseline ?? topic.entries.map(entry => entry.workId));
  const newCandidates = baseline ? topic.entries.filter(entry => !knownIds.has(entry.workId)) : [];

  useEffect(() => { window.scrollTo(0, 0); }, [section]);
  useEffect(() => {
    if (!legacyEvidence) return;
    const next = new URLSearchParams(query);
    next.set("view", "report");
    next.set("part", part === "survey-appendix" ? "survey-appendix" : "survey-pr-trends");
    setQuery(next, { replace: true });
  }, [legacyEvidence, part, query, setQuery]);

  return <div className="acl-topic">
    <Link className="topic-back" to="/topics"><ArrowLeft size={16} aria-hidden="true" /> 专题目录</Link>
    <header className="acl-topic-header">
      <p className="acl-topic-kicker">技术专题</p>
      <h1>Speculative Decoding</h1>
      <p className="acl-topic-subtitle">大语言模型推测解码：提案、验证、合法状态与 Serving</p>
    </header>
    <nav className="acl-topic-nav" aria-label="推测解码专题分区">
      {sections.map(({ id, label, search }) =>
        <Link key={id} to={{ pathname: path, search }} aria-current={section === id ? "page" : undefined}>{label}</Link>)}
    </nav>
    {section === "guide" && <SpecDecGuide topic={topic} />}
    {section === "paper" && <SpecDecSurvey topic={topic} />}
    {section === "report" && (topic.report ? <>
      <aside className="specdec-research-assets" aria-label="研究来源与固定实现">
        <strong>研究资料</strong>
        <a target="_blank" rel="noreferrer" href={`${import.meta.env.BASE_URL}word-reports/topic-reports/${topic.id}/${topic.report.version}/source-ledger.json`}>105 条 PR 候选账本 ↗</a>
        <a target="_blank" rel="noreferrer" href={`${import.meta.env.BASE_URL}word-reports/topic-reports/${topic.id}/${topic.report.version}/evidence-ledger.json`}>10 条核心 PR 核验记录 ↗</a>
        <a target="_blank" rel="noreferrer" href={`${import.meta.env.BASE_URL}word-reports/topic-reports/${topic.id}/${topic.report.version}/implementation-audit.md`}>固定源码与支持矩阵 ↗</a>
      </aside>
      {newCandidates.length > 0 && <details className="specdec-new-candidates">
        <summary>新入候选：{newCandidates.length} 条 PR 尚未综合入本版研究判断</summary>
        <p>这是基于当前冻结候选池的新增线索，仅进入待核队列；不代表已确认性能收益或改写 RQ 结论。</p>
        <ol>{newCandidates.map(entry => <li key={entry.workId}>
          <span>{entry.day} · {topic.labels[entry.label] ?? entry.label}</span>{" "}
          {safeTopicSource(entry.url)
            ? <a href={safeTopicSource(entry.url)} target="_blank" rel="noreferrer">{entry.title} ↗</a>
            : entry.title}
        </li>)}</ol>
      </details>}
      <TopicResearchReport key={topic.report.version} topic={topic} report={topic.report} embedded />
    </> : <p>动态报告准备中。</p>)}
  </div>;
}

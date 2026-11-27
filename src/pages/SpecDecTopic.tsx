import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import TopicDirectoryCard from "./TopicDirectoryCard";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import SpecDecGuide from "./SpecDecGuide";
import TopicAcademicPaper from "./TopicAcademicPaper";
import SpecDecCommunity from "./SpecDecCommunity";
import "./aclgraph-topic.css";

const path = "/topics/speculative-decoding";
const sections = [
  { id: "guide", label: "机制模型", search: "" },
  { id: "paper", label: "综述", search: "view=paper" },
  { id: "report", label: "动态报告", search: "view=report" },
] as const;

export function SpecDecTopicCard({ topic }: { topic: Topic }) {
  return (
    <TopicDirectoryCard
      title="Speculative Decoding"
      description="候选生成、并行验证、状态正确性与动态 Serving 的系统优化。"
      path={path}
      summary={`${topic.entries.length} 条社区 PR 线索`}
      repositories={topic.counts.byRepository}
      sections={sections}
    />
  );
}

export default function SpecDecTopic({ topic }: { topic: Topic }) {
  const [query] = useSearchParams();
  const view = query.get("view");
  const part = query.get("part");
  const reportView = view === "evidence" || view === "report" || (!view && (query.has("read") || part?.startsWith("survey-")));
  const section = view === "paper" ? "paper" : reportView ? "report" : "guide";
  useEffect(() => { if (!part) window.scrollTo(0, 0); }, [section]);

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
    {section === "paper" && (topic.academicPaper
      ? <TopicAcademicPaper key={topic.academicPaper.version} topic={topic} paper={topic.academicPaper} embedded />
      : <p role="status">综述全文准备中。</p>)}
    {section === "report" && <SpecDecCommunity topic={topic}/> }
  </div>;
}

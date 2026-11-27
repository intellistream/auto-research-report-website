import { useEffect } from "react";
import TopicDetailLayout from "./TopicDetailLayout";
import TopicDirectoryCard from "./TopicDirectoryCard";
import { useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import SpecDecGuide from "./SpecDecGuide";
import TopicAcademicPaper from "./TopicAcademicPaper";
import SpecDecCommunity from "./SpecDecCommunity";

const title = "Speculative Decoding";
const path = "/topics/speculative-decoding";
const sections = [
  { id: "guide", label: "机制模型", search: "" },
  { id: "paper", label: "综述", search: "view=paper" },
  { id: "report", label: "动态报告", search: "view=report" },
] as const;

export function SpecDecTopicCard({ topic }: { topic: Topic }) {
  return (
    <TopicDirectoryCard
      title={title}
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

  return <TopicDetailLayout
    className="specdec-topic"
    title={title}
    subtitle="大语言模型推测解码：提案、验证、合法状态与 Serving"
    navLabel="推测解码专题分区"
    sections={sections.map(({ id, label, search }) => ({
      label,
      to: { pathname: path, search },
      current: section === id ? "page" : undefined,
    }))}
  >
    {section === "guide" && <SpecDecGuide topic={topic} />}
    {section === "paper" && (topic.academicPaper
      ? <TopicAcademicPaper key={topic.academicPaper.version} topic={topic} paper={topic.academicPaper} embedded />
      : <p role="status">综述全文准备中。</p>)}
    {section === "report" && <SpecDecCommunity topic={topic}/> }
  </TopicDetailLayout>;
}

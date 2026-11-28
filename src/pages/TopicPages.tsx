import { BookOpen } from "lucide-react";
import PipelineReorderingTopic, { PipelineReorderingTopicCard } from "./PipelineReorderingTopic";
import { pipelineStats } from "./pipeline-reordering";
import { Link, useParams, useSearchParams } from "react-router-dom";
import "./topics.css";
import RelatedGroupMods from "../features/group-mods/RelatedGroupMods";
import TopicResearchReport, { TopicReportCard } from "./TopicResearchReport";
import type { ResearchReport } from "./topic-report";
import TopicAcademicPaper, { AcademicPaperCard } from "./TopicAcademicPaper";
import type { AcademicPaper } from "./academic-paper";
import type { TopicSurvey } from "./topic-survey";
import KvCacheTopic, { KvCacheTopicCard } from "./KvCacheTopic";
import { communityEntries } from "./kv-community";
import ControlPlaneTopic, { ControlPlaneCard } from "./ControlPlaneTopic";
import AclGraphTopic, { AclGraphTopicCard } from "./AclGraphTopic";
import { getAclGraphAnalysisStats } from "./aclgraph-analysis";
import SpecDecTopic, { SpecDecTopicCard } from "./SpecDecTopic";
import EngineeringTopicWorkbench, { EngineeringTopicCard } from "./EngineeringTopicWorkbench";

export type Entry = {
  workId: string;
  title: string;
  repository: "vllm" | "vllm-ascend";
  url: string;
  day: string;
  version: string;
  number: string;
  label: string;
  reason: string;
  method: "manual" | "rule";
  summary: string;
  stage?: string;
};

export type Topic = {
  id: string;
  title: string;
  description: string;
  labels: Record<string, string>;
  coverage: { firstDay: string; lastDay: string; days: number; prs: number };
  counts: { total: number; byRepository: Record<string, number> };
  entries: Entry[];
  report?: ResearchReport;
  academicPaper?: AcademicPaper;
  survey?: TopicSurvey;
};

export type TopicIndex = { schemaVersion: 1 | 2; topics: Topic[] };

export default function TopicPages({ index, error }: { index?: TopicIndex; error?: string }) {
  const { topicId } = useParams();
  const [query] = useSearchParams();
  const view = query.get("view");

  if (topicId === "pipeline-reordering") return <div className="topic-page"><PipelineReorderingTopic /></div>;
  if (topicId === "kv-cache") return <div className="topic-page"><RelatedGroupMods topicId="kv-cache" /><KvCacheTopic /></div>;
  const validIndex = index && [1, 2].includes(index.schemaVersion) && Array.isArray(index.topics);
  if (topicId && error) return <div className="overview-status-card error" role="alert">暂无可用的专题索引。<Link to="/reports">查看日报档案</Link></div>;
  if (topicId && !index) return <div className="overview-status-card" role="status">正在加载专题…</div>;
  if (topicId && !validIndex) return <div className="overview-status-card error" role="alert">专题索引格式不受支持。</div>;
  const archiveTopics = validIndex ? index.topics.filter(row => row.id !== "kv-cache") : [];

  const topic = archiveTopics.find((row) => row.id === topicId);
  if (topicId && !topic) {
    return (
      <div className="overview-status-card">
        没有找到该专题。<Link to="/topics">查看全部专题</Link>
      </div>
    );
  }

  const totalTopicPRs = archiveTopics.reduce((sum, t) => sum + (t.id === "aclgraph" ? getAclGraphAnalysisStats().prs : (t.counts?.total ?? 0)), communityEntries.length + pipelineStats.prs);

  return (
    <div className="topic-page">
      {topic && <RelatedGroupMods topicId={topic.id} />}
      {topic ? (
        topic.id === "distributed-inference-control-plane" ? (
          <ControlPlaneTopic topic={topic} />
        ) : topic.id === "aclgraph" ? (
          <AclGraphTopic />
        ) : topic.id === "speculative-decoding" ? (
          <SpecDecTopic topic={topic} />
        ) : topic.academicPaper && (view !== "report" || !topic.report) ? (
          <TopicAcademicPaper key={topic.academicPaper.version} topic={topic} paper={topic.academicPaper} reportAvailable={index?.schemaVersion === 2 && Boolean(topic.report)} />
        ) : index?.schemaVersion === 2 && topic.report ? (
          <TopicResearchReport key={topic.report.version} topic={topic} report={topic.report} />
        ) : (
          <EngineeringTopicWorkbench key={topic.id} topic={topic} />
        )
      ) : (
        <>
          <header className="topic-heading topic-dir-hero">
            <div>
              <span className="docx-eyebrow">
                <BookOpen size={14} aria-hidden /> TECHNICAL TOPICS
              </span>
              <h1>技术专题</h1>
              <p>综合前沿论文与多期社区工程证据，深入理解关键推理技术机制、优化路线与适用边界。</p>
            </div>
            <div className="topic-dir-summary">
              <div>
                <strong>{archiveTopics.length + 2}</strong>
                <span>核心专题</span>
              </div>
              <div>
                <strong>{totalTopicPRs}</strong>
                <span>专题工程证据</span>
              </div>
            </div>
          </header>

          <ul className="topic-directory">
            <KvCacheTopicCard />
            {archiveTopics.map((row) =>
              row.id === "distributed-inference-control-plane" ? (
                <ControlPlaneCard key={row.id} topic={row} />
              ) : row.id === "aclgraph" ? (
                <AclGraphTopicCard key={row.id} />
              ) : row.id === "speculative-decoding" ? (
                <SpecDecTopicCard key={row.id} topic={row} />
              ) : row.academicPaper ? (
                <AcademicPaperCard key={row.id} topic={row} paper={row.academicPaper} />
              ) : row.report && index?.schemaVersion === 2 ? (
                <TopicReportCard key={row.id} topic={row} report={row.report} />
              ) : (
                <EngineeringTopicCard key={row.id} topic={row} />
              ),
            )}
            <PipelineReorderingTopicCard />
          </ul>
          {error && <p className="overview-status-card error" role="alert">其他专题索引暂不可用。</p>}
          {!error && !index && <p className="overview-status-card" role="status">正在加载其他专题…</p>}
          {!error && index && !validIndex && <p className="overview-status-card error" role="alert">其他专题索引格式不受支持。</p>}
        </>
      )}
    </div>
  );
}

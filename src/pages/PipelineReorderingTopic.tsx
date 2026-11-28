import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import TopicDetailLayout from "./TopicDetailLayout";
import TopicDirectoryCard from "./TopicDirectoryCard";
import AclGraphAnalysis from "./AclGraphAnalysis";
import PipelineReorderingGuide from "./PipelineReorderingGuide";
import {
  PIPELINE_DESCRIPTION, PIPELINE_PATH, PIPELINE_PROBLEMS, PIPELINE_PROVENANCE,
  PIPELINE_TITLE, PIPELINE_UPDATED_AT, pipelineSections, pipelineStats, resolvePipelineSearch,
} from "./pipeline-reordering";
import "./pipeline-reordering.css";

export function PipelineReorderingTopicCard() {
  return <TopicDirectoryCard
    title={PIPELINE_TITLE}
    description={PIPELINE_DESCRIPTION}
    path={PIPELINE_PATH}
    status="技术专题 · 首版雏形"
    summary={pipelineStats.problems + " 个核心问题 · " + pipelineStats.prs + " 条工程 PR"}
    detail={pipelineStats.papers + " 篇论文 · 主机衔接、微批重叠、资源争用、多卡一致性"}
    repositories={{ vllm: pipelineStats.upstreamPrs, "vllm-ascend": pipelineStats.ascendPrs }}
    sections={pipelineSections}
  />;
}

export default function PipelineReorderingTopic() {
  const [query, setQuery] = useSearchParams();
  const { section, params, needsNormalize, hasTarget } = resolvePipelineSearch(query);
  useEffect(() => {
    if (needsNormalize) setQuery(params, { replace: true });
  }, [needsNormalize, params, setQuery]);
  useEffect(() => {
    if (!hasTarget && typeof window !== "undefined") window.scrollTo(0, 0);
  }, [section, hasTarget]);

  return <TopicDetailLayout
    title={PIPELINE_TITLE}
    subtitle="首版雏形 · 从主机与设备衔接，到微批计算、通信与多卡依赖"
    className="pipeline-topic"
    navLabel="流水线重排专题分区"
    sections={pipelineSections.map(({ id, label, search }) => ({
      label, to: { pathname: PIPELINE_PATH, search }, current: section === id ? "page" : undefined,
    }))}
  >
    {section === "guide" ? <PipelineReorderingGuide /> : <>
      <div className="pipeline-scope-note"><strong>首版取材范围</strong><p>{PIPELINE_PROVENANCE.note} 资料整理日期：{PIPELINE_UPDATED_AT}。</p></div>
      <AclGraphAnalysis
        problems={PIPELINE_PROBLEMS}
        heading="从等待定位问题，对照论文方法与社区工程证据"
        eyebrow="PIPELINE REORDERING · 问题驱动剖析"
        testId="pipeline-reordering-analysis"
      />
    </>}
  </TopicDetailLayout>;
}

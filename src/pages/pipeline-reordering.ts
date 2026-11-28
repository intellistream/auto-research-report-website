import data from "./pipeline-reordering-data.json";
import { findAclGraphCardById, getAclGraphAnalysisStats, type AclGraphProblem } from "./aclgraph-analysis";

export const PIPELINE_PATH = "/topics/pipeline-reordering";
export const PIPELINE_TITLE = "流水线重排";
export const PIPELINE_DESCRIPTION = "在依赖正确的前提下，重新安排主机、计算与通信的执行时机，减少推理中的等待和空泡。";
export const PIPELINE_PROBLEMS = data.problems as AclGraphProblem[];
export const PIPELINE_PROVENANCE = data.provenance;
export const PIPELINE_UPDATED_AT = data.updatedAt;
export const pipelineStats = getAclGraphAnalysisStats(PIPELINE_PROBLEMS);
export const pipelineSections = [
  { id: "guide", label: "导引", search: "" },
  { id: "analysis", label: "专题剖析", search: "view=analysis" },
] as const;

export function resolvePipelineSearch(query: URLSearchParams) {
  const rawCard = query.get("card");
  const entry = rawCard ? findAclGraphCardById(rawCard, PIPELINE_PROBLEMS) : undefined;
  const rawProblem = query.get("problem");
  const problemId = entry?.problem.id ?? PIPELINE_PROBLEMS.find(p => p.id === rawProblem)?.id;
  const section = query.get("view") === "analysis" || entry || problemId ? "analysis" : "guide";
  const params = new URLSearchParams();
  for (const [key, value] of query) if (/^utm_/i.test(key)) params.append(key, value);
  if (section === "analysis") {
    params.set("view", "analysis");
    if (problemId) params.set("problem", problemId);
    if (entry) params.set("card", entry.card.id);
  }
  return { section, params, needsNormalize: params.toString() !== query.toString(), hasTarget: Boolean(entry || problemId) };
}

export type PipelineScenario = "balanced" | "communication" | "contention";
export const pipelineScenarios = {
  balanced: { label: "资源互补", compute: 4, communication: 3, penalty: 0 },
  communication: { label: "通信占优", compute: 3, communication: 6, penalty: 0 },
  contention: { label: "资源争用", compute: 4, communication: 3, penalty: 5 },
} as const;
export type PipelineTask = { id: "compute-a" | "comm-a" | "compute-b" | "comm-b"; lane: "compute" | "communication"; batch: "A" | "B"; start: number; end: number };

/** Two independent microbatches, one compute engine and one communication engine.
 * Each batch's communication waits for its own compute. B can compute during A's communication.
 * penalty illustrates B's slowdown during overlap; it is not a measured backend model.
 */
export function buildPipelineSchedule(compute: number, communication: number, overlap: boolean, penalty = 0) {
  if (![compute, communication].every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(penalty) || penalty < 0) {
    throw new RangeError("Pipeline durations must be positive and the overlap penalty nonnegative.");
  }
  const bStart = overlap ? compute : compute + communication;
  const bEnd = bStart + compute + (overlap ? penalty : 0);
  const commBStart = Math.max(compute + communication, bEnd);
  const tasks: PipelineTask[] = [
    { id: "compute-a", lane: "compute", batch: "A", start: 0, end: compute },
    { id: "comm-a", lane: "communication", batch: "A", start: compute, end: compute + communication },
    { id: "compute-b", lane: "compute", batch: "B", start: bStart, end: bEnd },
    { id: "comm-b", lane: "communication", batch: "B", start: commBStart, end: commBStart + communication },
  ];
  return { tasks, total: commBStart + communication };
}

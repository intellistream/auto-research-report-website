import data from "./kv-research.json";

export type ResearchTopicId = "reuse" | "representation" | "lifecycle" | "movement" | "scheduling";
export type DailyReference = { day: string; version: string; section: string };
export type ResearchEntry = {
  id: string;
  kind: "pr" | "paper";
  repository?: "vllm" | "vllm-ascend";
  title: string;
  originalTitle?: string;
  summary: string;
  url: string;
  sourceDay: string;
  sourceVersion?: string;
  createdAt?: string;
  updatedAt?: string;
  state?: string;
  merged?: boolean;
  draft?: boolean;
  headSha?: string;
  decision: "included" | "excluded" | "pending";
  primaryTopic: ResearchTopicId | null;
  topics: ResearchTopicId[];
  rationale: string;
  reviewLevel: "pr-description" | "pr-code" | "paper-abstract" | "paper-section" | "pending";
  checkedAt: string;
  dailyReferences?: DailyReference[];
};
export type ResearchLibrary = {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  asOf: string;
  revision: number;
  scope: string;
  collectionNote: string;
  reviewNote: string;
  taxonomy: {
    id: ResearchTopicId;
    label: string;
    question: string;
    description: string;
    check: string;
    source: string;
  }[];
  entries: ResearchEntry[];
};

export const kvResearch = data as ResearchLibrary;
export const researchReviewLabels = {
  "pr-description": "已审阅 PR 说明",
  "pr-code": "已核对说明与代码",
  "paper-abstract": "已阅读论文摘要",
  "paper-section": "已阅读相关章节",
  pending: "来源待核实",
};

const legacyTopics: Record<string, ResearchTopicId> = {
  reuse: "reuse",
  layout: "representation",
  management: "lifecycle",
  offload: "movement",
  transfer: "movement",
};

export function researchTopicFilter(query: URLSearchParams): string {
  return query.get("topic") ?? legacyTopics[query.get("label") ?? ""] ?? "";
}

export function filterResearch(entries: ResearchEntry[], query: URLSearchParams): ResearchEntry[] {
  const topic = researchTopicFilter(query);
  const kind = query.get("kind") ?? "";
  const repository = query.get("repo") ?? "";
  const month = query.get("month") ?? "";
  const unique = new Map(entries.map((entry) => [entry.id, entry]));
  return [...unique.values()].filter((entry) =>
    entry.decision === "included" &&
    (!topic || entry.topics.includes(topic as ResearchTopicId)) &&
    (!kind || entry.kind === kind) &&
    (!repository || entry.repository === repository) &&
    (!month || entry.sourceDay.startsWith(month)))
    .sort((left, right) => right.sourceDay.localeCompare(left.sourceDay) || left.id.localeCompare(right.id));
}

export function researchTimeline(entries: ResearchEntry[]) {
  const months = new Map<string, number>();
  const unique = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of unique.values()) {
    if (entry.kind !== "pr" || entry.decision !== "included") continue;
    const month = entry.sourceDay.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + 1);
  }
  return [...months].sort(([left], [right]) => left.localeCompare(right))
    .map(([month, count]) => ({ month, count }));
}

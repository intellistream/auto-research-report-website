import data from "./kv-research.json";

export type ResearchTopicId = "reuse" | "representation" | "lifecycle" | "movement" | "scheduling";
export type DailyReference = { day: string; version: string; section: string };
export type PaperFinding = {
  id: string;
  kind: "author-experiment" | "author-theory" | "author-method";
  statement: string;
  conditions: string;
  location: string;
  url: string;
  limit: string;
};
export type PaperReading = {
  slug: string;
  shortName: string;
  venue: string;
  year: number;
  order: number;
  collection?: "notes-supplement";
  recommendedReason?: string;
  readingTask?: { goal: string; startAt: string };
  mechanism?: { input: string; process: string; state: string; output: string };
  findings?: PaperFinding[];
  evidenceReview?: { checkedAt: string; coverage: string; notCovered: string };
  format?: "survey";
  takeaway?: string;
  problem: string;
  problemBasis?: "reading-notes" | "primary-paper";
  method: string;
  result?: string;
  boundary: string;
  readingScope: string;
  sources: { label: string; url: string }[];
};
export type ResearchEntry = {
  id: string;
  kind: "pr" | "paper";
  repository?: "vllm" | "vllm-ascend";
  title: string;
  originalTitle?: string;
  summary: string;
  url: string;
  sourceDay: string | null;
  sourceMonth?: string;
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
  paper?: PaperReading;
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

export function researchSourceDate(entry: ResearchEntry): string {
  return entry.sourceDay ?? entry.sourceMonth ?? "";
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
    (!month || researchSourceDate(entry).startsWith(month)))
    .sort((left, right) => researchSourceDate(right).localeCompare(researchSourceDate(left)) || left.id.localeCompare(right.id));
}

export function researchTimeline(entries: ResearchEntry[]) {
  const months = new Map<string, number>();
  const unique = new Map(entries.map((entry) => [entry.id, entry]));
  for (const entry of unique.values()) {
    if (entry.kind !== "pr" || entry.decision !== "included" || !entry.sourceDay) continue;
    const month = entry.sourceDay.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + 1);
  }
  return [...months].sort(([left], [right]) => left.localeCompare(right))
    .map(([month, count]) => ({ month, count }));
}

export type PaperEntry = ResearchEntry & { kind: "paper"; paper: PaperReading };

export type PaperCollection = "" | "recommended" | "notes-supplement";

export function paperCollectionFilter(query: URLSearchParams): PaperCollection {
  const value = query.get("collection");
  return value === "recommended" || value === "notes-supplement" ? value : "";
}

// Paper reading shares the material inventory, with its own search and topic scope.
export function paperViewQuery(query: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(query);
  const topic = researchTopicFilter(query);
  for (const key of ["repo", "month", "kind", "label", "state", "review", "edition", "week"]) next.delete(key);
  if (topic) next.set("topic", topic);
  next.set("view", "papers");
  return next;
}

export function filterPapers(entries: ResearchEntry[], query: URLSearchParams): PaperEntry[] {
  const scope = new URLSearchParams({ kind: "paper" });
  const topic = researchTopicFilter(query);
  if (topic) scope.set("topic", topic);
  const collection = paperCollectionFilter(query);
  const term = (query.get("q") ?? "").normalize("NFKC").trim().toLocaleLowerCase();
  return filterResearch(entries, scope)
    .filter((entry): entry is PaperEntry => entry.kind === "paper" && !!entry.paper)
    .filter(({ paper }) => {
      if (collection === "recommended") return Boolean(paper.recommendedReason);
      return !collection || paper.collection === collection;
    })
    .filter((entry) => !term || [entry.title, entry.originalTitle, entry.summary, entry.paper.shortName,
      entry.paper.takeaway, entry.paper.problem, entry.paper.method, entry.paper.result, entry.paper.boundary,
      entry.paper.readingTask?.goal,
      ...(entry.paper.findings ?? []).flatMap((finding) => [finding.statement, finding.conditions, finding.location])].join(" ").normalize("NFKC").toLocaleLowerCase().includes(term))
    .sort((left, right) => left.paper.order - right.paper.order || left.id.localeCompare(right.id));
}

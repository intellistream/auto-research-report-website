import type { IndexedPR } from "./InferenceMap";

export type IndexedChapter = {
  day: string;
  version: string;
  stage: string;
  title: string;
  chapter_summary: string;
  sources: string[];
  workIds: string[];
};
export type ChapterSummaries = Partial<Record<string, IndexedChapter>>;
export type FlowIndex = { schemaVersion: 1; entries: IndexedPR[]; chapters?: IndexedChapter[] };

const names: Record<string, string> = {
  "github:vllm-project/vllm": "vLLM",
  "github:vllm-project/vllm-ascend": "vLLM Ascend",
  unknown: "来源待核对",
};

export function summarySources(sources: string[]): string {
  return [...new Set(sources.map((source) => names[source] ?? (source.startsWith("paper:") || source.startsWith("arxiv:") ? "研究论文" : source)))].join(" / ") || "未附条目来源";
}

export function hasChapterSummary(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 180;
}

/** Pick one dated quotation, never a synthesis of the current PR population. */
export function selectChapterSummaries(
  rows: unknown,
  entries: IndexedPR[],
  currentVersions: Record<string, string>,
  days: string[],
  source: string,
): ChapterSummaries {
  const selected: ChapterSummaries = {};
  if (!Array.isArray(rows) || !Array.isArray(entries)) return selected;
  const activeDays = new Set(days);
  for (const row of rows) {
    if (!row || typeof row !== "object" || !activeDays.has(row.day) || currentVersions[row.day] !== row.version ||
        typeof row.stage !== "string" || typeof row.title !== "string" || !hasChapterSummary(row.chapter_summary) ||
        !Array.isArray(row.sources) || !row.sources.every((item: unknown) => typeof item === "string") ||
        !Array.isArray(row.workIds) || !row.workIds.length || !row.workIds.every((item: unknown) => typeof item === "string")) continue;
    const evidence = entries.filter((entry) => entry.day === row.day && entry.version === row.version && entry.stage === row.stage);
    const workIds = new Set<string>(row.workIds);
    const evidenceIds = new Set(evidence.map((entry) => entry.workId));
    if (!evidenceIds.size || evidenceIds.size !== workIds.size || [...evidenceIds].some((id) => !workIds.has(id))) continue;
    const sources = new Set([...workIds].map((id) => id.split("#")[0]));
    const declared = new Set<string>(row.sources);
    if ([...sources].some((item) => !declared.has(item)) || [...declared].some((item) => item !== "unknown" && !sources.has(item))) continue;
    // A whole mixed-source chapter is not a summary of one selected community.
    if (source && (declared.size !== 1 || !declared.has(source))) continue;
    if (!selected[row.stage] || row.day > selected[row.stage]!.day) selected[row.stage] = row;
  }
  return selected;
}

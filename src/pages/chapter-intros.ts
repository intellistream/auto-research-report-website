import type { IndexedPR } from "./InferenceMap";

export type IndexedChapter = {
  day: string;
  version: string;
  stage: string;
  title: string;
  intro: string;
  sources: string[];
  workIds: string[];
};
export type ChapterIntros = Partial<Record<string, IndexedChapter>>;
export type FlowIndex = { schemaVersion: 1; entries: IndexedPR[]; chapters?: IndexedChapter[] };

export function hasChapterIntro(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Pick one dated quotation, never a synthesis of the current PR population. */
export function selectChapterIntros(
  rows: unknown,
  entries: IndexedPR[],
  currentVersions: Record<string, string>,
  days: string[],
  source: string,
): ChapterIntros {
  const selected: ChapterIntros = {};
  if (!Array.isArray(rows) || !Array.isArray(entries)) return selected;
  const activeDays = new Set(days);
  for (const row of rows) {
    if (!row || typeof row !== "object" || !activeDays.has(row.day) || currentVersions[row.day] !== row.version ||
        typeof row.stage !== "string" || typeof row.title !== "string" || !hasChapterIntro(row.intro) ||
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

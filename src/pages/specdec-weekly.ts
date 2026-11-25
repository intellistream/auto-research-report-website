import type { Entry, Topic } from "./TopicPages";
import first from "../../topics/speculative-decoding/weekly/2026-11-22.json";

export type WeeklySource = Entry & { headSha: string; mergedAt: string; checkedAt: string; review: string; files: string[] };
export type WeeklyFigure = { title: string; unit: string; rows: { label: string; value: number }[]; scale: number; precision: number; sourceId: string; note: string };
export type WeeklyEdition = {
  schemaVersion: number; id: string; periodStart: string; periodEnd: string; checkedAt: string; indexCommit: string;
  title: string; overview: string; scope: string;
  stories: { slug: string; title: string; lead: string; paragraphs: string[]; keyEvidence: string; figure?: WeeklyFigure; sourceIds: string[]; metrics: { sourceId: string; environment: string; result: string; boundary: string }[]; assessment: string }[];
  otherIds: string[]; synthesis: { title: string; body: string; design: string; measure: string; decision: string; sourceIds: string[] }[]; sources: WeeklySource[];
};
export const weeklyEditions: WeeklyEdition[] = [first as WeeklyEdition].sort((a,b)=>b.id.localeCompare(a.id));
export const latestEdition = weeklyEditions[0];
export const legacyEdition = "2026-11-18";
export function weeklyView(query: URLSearchParams) {
  if (query.get("view") === "evidence") return "evidence";
  if (query.get("edition") === legacyEdition || (!query.has("edition") && (query.has("read") || query.get("part")?.startsWith("survey-")))) return "legacy";
  if (query.get("tab") === "archive") return "archive";
  return "weekly";
}
export function selectedEdition(query: URLSearchParams) {
  return query.has("edition") ? weeklyEditions.find(e=>e.id===query.get("edition")) : latestEdition;
}
export function filterWeeklyLibrary(topic: Topic, query: URLSearchParams, includeFacetFilters = true) {
  const term = (query.get("q") ?? "").normalize("NFKC").trim().toLowerCase();
  const week = query.get("week");
  const edition = weeklyEditions.find(e=>e.id===week);
  const members = edition && new Set(edition.sources.map(s=>s.workId));
  const unique = edition ? edition.sources : [...new Map(topic.entries.map(e=>[e.workId,e])).values()];
  return unique.filter(e=>(!week || !!members?.has(e.workId))
    && (!includeFacetFilters || ((!query.get("repo") || e.repository===query.get("repo")) && (!query.get("label") || e.label===query.get("label"))))
    && (!term || [e.workId,e.title,e.summary,e.number,topic.labels[e.label]].join(" ").normalize("NFKC").toLowerCase().includes(term)));
}
export const prLabel = (source: Entry) => (source.repository==="vllm" ? "vLLM" : "Ascend")+" #"+source.workId.split("#")[1];

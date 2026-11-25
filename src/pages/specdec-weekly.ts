import type { Entry, Topic } from "./TopicPages";

export type WeeklySource = Entry & { headSha: string; baseSha: string; headRepo: string; mergedAt: string | null; state: string; merged: boolean; draft: boolean; createdAt: string; updatedAt: string; checkedAt: string; review: string; files: string[] };
export type WeeklyFigure = { title: string; unit: string; rows: { label: string; value: number }[]; scale: number; precision: number; sourceId: string; note: string };
export type WeeklyEdition = {
  schemaVersion: number; id: string; periodStart: string; periodEnd: string; checkedAt: string; indexCommit: string;
  title: string; overview: string; scope: string;
  stories: { slug: string; title: string; lead: string; paragraphs: string[]; keyEvidence: string; figure?: WeeklyFigure; sourceIds: string[]; metrics: { sourceId: string; environment: string; result: string; boundary: string }[]; assessment: string }[];
  otherIds: string[]; otherGroups: { title: string; body: string; sourceIds: string[] }[];
  tracking: { fromEdition: string; fromSlug: string; body: string; sourceIds: string[] }[];
  synthesis: { title: string; body: string; design: string; measure: string; decision: string; sourceIds: string[] }[]; sources: WeeklySource[];
};
const editionFiles = import.meta.glob<WeeklyEdition>("../../topics/speculative-decoding/weekly/*.json", { eager: true, import: "default" });
export const weeklyEditions = Object.values(editionFiles).sort((a,b)=>b.id.localeCompare(a.id));
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

export function sourceStatus(source: WeeklySource) {
  return source.merged ? "已合并" : source.state === "closed" ? "已关闭（未合并）" : source.draft ? "草稿" : "开放中";
}
export function shanghaiDay(iso: string) {
  return new Date(Date.parse(iso)+8*60*60*1000).toISOString().slice(0,10);
}
export function priorMergeEvents(edition: WeeklyEdition) {
  return weeklyEditions.filter(e=>e.periodEnd<edition.periodStart).flatMap(prior=>prior.sources
    .filter(s=>s.merged && s.mergedAt && shanghaiDay(s.mergedAt)>=edition.periodStart && shanghaiDay(s.mergedAt)<=edition.periodEnd)
    .map(source=>({source,prior}))).sort((a,b)=>a.source.mergedAt!.localeCompare(b.source.mergedAt!));
}
// Editorial watchlist: unresolved mechanisms, not all open PRs or a live status feed.
const watchNumbers = ["64950","20254","21281","66612","66595","21430","21444"];
export function outstandingWatchlist() {
  return watchNumbers.flatMap(number=>{
    for(const edition of weeklyEditions){
      const source=edition.sources.find(s=>s.workId.endsWith("#"+number));
      if(source && !source.merged && source.state==="open") {
        const story=edition.stories.find(s=>s.sourceIds.includes(source.workId));
        if(story)return [{source,edition,story}];
      }
    }
    return [];
  });
}

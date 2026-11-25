import data from "./kv-community.json";
import { filterResearch, kvResearch, type ResearchEntry, type ResearchTopicId } from "./kv-research";

export type PRSnapshot = {
  id: string; url: string; number: number; repository: string; title: string;
  state: string; merged: boolean; draft: boolean; headSha: string;
  createdAt: string; updatedAt: string; mergedAt: string | null; closedAt: string | null; checkedAt: string;
  baseline: { checkedAt: string; state: string; merged: boolean; draft: boolean; headSha: string } | null;
};
export type CommunitySource = { label: string; url: string };
export type CommunityEvidenceCheck = {
  id: string; number: number; url: string; checkedAt: string; headSha: string; baseSha: string;
  previousHeadSha: string; state: string; merged: boolean; draft: boolean; note: string;
  codeUrl: string; descriptionUrl: string;
};
export type CommunityStory = {
  slug: string; id: string; change: string; title: string; changeText: string;
  mechanism: string; evidence: string; analysis: string; next: string; basis: string;
  readingScope: string; topic: ResearchTopicId; paperSlugs: string[];
  sourceVersion: string; sourceCheckedAt: string; claimSources: CommunitySource[];
};
export const kvCommunity = data as unknown as {
  schemaVersion: 1; edition: string; baselineDate: string; periodStart: string; periodEnd: string;
  title: string; summary: string; scopeNote: string; verification: string;
  snapshots: PRSnapshot[]; newEntries: ResearchEntry[]; stories: CommunityStory[]; focusIds: string[];
  search: { terms: string[]; perQueryLimit: number; returned: number; unique: number; capped: boolean;
    candidates: { url: string; title: string; number: number }[];
    repositories: string[]; sort: string; selectionNote: string;
    queries: { query: string; limit: number; returned: number; truncated: boolean }[] };
  evidenceReview: { checkedAt: string; scope: string; verification: string; checks: CommunityEvidenceCheck[] };
  observations: { title: string; body: string; storySlugs: string[] }[];
  followUps: { title: string; body: string; ids: string[] }[];
};

export const communityEntries = [...new Map([
  ...kvResearch.entries.filter(entry => entry.kind === "pr" && entry.decision === "included"),
  ...kvCommunity.newEntries,
].map(entry => [entry.id, entry])).values()];

export const snapshotFor = (id: string) => kvCommunity.snapshots.find(item => item.id === id);
export const evidenceCheckFor = (id: string) => kvCommunity.evidenceReview.checks.find(item => item.id === id);
export const checksWithNewVersion = kvCommunity.evidenceReview.checks.filter(item => item.headSha !== item.previousHeadSha);
export const storyFor = (id: string) => kvCommunity.stories.find(item => item.id === id);
export const hasVersionChange = (snapshot: PRSnapshot) =>
  !!snapshot.baseline && snapshot.headSha !== snapshot.baseline.headSha;
export function prState(item: { merged?: boolean; draft?: boolean; state?: string }) {
  return item.merged ? "merged" : item.state === "closed" ? "closed" : item.draft ? "draft" : "open";
}
export const prStateLabels: Record<string, string> = {
  merged: "已合并", closed: "已关闭（未合并）", draft: "草稿", open: "开放中",
};
export const baselineSnapshots = kvCommunity.snapshots.filter(item => item.baseline);
export const versionChanges = baselineSnapshots.filter(hasVersionChange);
export const stateChanges = baselineSnapshots.filter(item => prState(item) !== prState(item.baseline!));
export function communityDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}

export function filterCommunity(query: URLSearchParams) {
  const scope = new URLSearchParams(query);
  scope.set("kind", "pr");
  const state = query.get("state");
  const review = query.get("review");
  const term = (query.get("q") ?? "").normalize("NFKC").trim().toLocaleLowerCase();
  return filterResearch(communityEntries, scope).filter(entry => {
    const snapshot = snapshotFor(entry.id);
    return (!state || prState(snapshot ?? entry) === state)
      && (!review || (review === "edition" ? !!storyFor(entry.id)
        : review === "changed" ? !!snapshot && hasVersionChange(snapshot) : true))
      && (!term || [entry.id, entry.title, entry.originalTitle, entry.summary].join(" ").normalize("NFKC").toLocaleLowerCase().includes(term));
  });
}

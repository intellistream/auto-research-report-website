import data from "./kv-weekly.json";
import { communityEntries, kvCommunity, type PRSnapshot } from "./kv-community";
import { parseKvGuideState, withKvGuideState } from "./kv-guide-state";

export type WeeklySource = {
  id: string; kind: "pr" | "paper" | "proposal"; workId: string; label: string;
  url: string; version: string; checkedAt: string; scope: string; readingSearch?: string;
};
export type WeeklyQuestion = {
  id: string; title: string; problemTitle: string; weeklyInsight: string; classification: string; experimentStatus: string;
  basis: string; change: string; scene: string; bottleneck: string;
  evidence: { sourceIds: string[]; finding: string; boundary: string }[];
  gap: string; hypothesis: string; minimum: { label: string; body: string }[];
  value: string; cost: string; uncertainty: string;
  relatedWork: { checkedAt: string; coverage: string; pending: string };
};
export type WeeklyProgress = {
  id: string; title: string; body: string; problem: string; mechanism: string;
  evidence: string; implication: string; next: string; sourceIds: string[];
};
export type WeeklyReport = {
  week: string; title: string; status: "retrospective" | "partial";
  compiledAt: string; materialThrough: string; note: string; summary: string;
  questions: WeeklyQuestion[]; progress: WeeklyProgress[];
};
export type WeeklyRevision = {
  id: string; workId: string; kind: "mechanism" | "test-only" | "unclassified";
  fromCheckedAt: string; toCheckedAt: string; fromVersion: string; toVersion: string;
  description: string; sourceIds: string[];
};
export const kvWeekly = data as {
  schemaVersion: number; timeZone: string; weekStartsOn: string; scope: string;
  reports: WeeklyReport[]; sources: WeeklySource[]; revisions: WeeklyRevision[];
};
export const weeklyReports = [...kvWeekly.reports].sort((a, b) => a.week.localeCompare(b.week));
export const latestWeeklyReport = weeklyReports[weeklyReports.length - 1];
export const weeklySource = (id: string) => kvWeekly.sources.find(source => source.id === id);

const dayMs = 86_400_000;
export function calendarDay(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
}
export function weekForDay(day: string): string | undefined {
  const date = calendarDay(day);
  if (!date) return;
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}
export function shanghaiDay(instant: string): string | undefined {
  // An event must be an instant with an explicit offset, never a browser-local date.
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(instant)
    || !calendarDay(instant.slice(0, 10))) return;
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
export const weekForInstant = (instant: string) => {
  const day = shanghaiDay(instant);
  return day ? weekForDay(day) : undefined;
};
export function weekRange(week: string) {
  const day = calendarDay(week);
  if (!day || weekForDay(week) !== week) return;
  return { start: week, end: new Date(day.getTime() + 6 * dayMs).toISOString().slice(0, 10) };
}
export function weekLabel(week: string) {
  const range = weekRange(week);
  return range ? range.start + " — " + range.end : week;
}
export function weeklySearch(query: URLSearchParams, week: string, part?: string): string {
  const next = new URLSearchParams({ view: "report", week });
  if (part) next.set("part", part);
  return withKvGuideState(next, parseKvGuideState(query).state).toString();
}
export function resolveWeeklyReport(query: URLSearchParams):
  | { kind: "archive"; edition: "2026-11-17" | "2026-11-23" }
  | { kind: "weekly"; report: WeeklyReport; notice?: string } {
  const week = query.get("week");
  const edition = query.get("edition");
  if (!week && (edition === "2026-11-17" || edition === "2026-11-23")) return { kind: "archive", edition };
  if (!week && !edition && /^kv-update-/.test(query.get("part") ?? "")) return { kind: "archive", edition: "2026-11-23" };
  const report = weeklyReports.find(item => item.week === week) ?? latestWeeklyReport;
  const notice = week && week !== report.week ? "未找到该周周报，当前展示最新已有周报。"
    : !week && edition ? "未找到该期报告，当前展示最新已有周报。" : undefined;
  return { kind: "weekly", report, notice };
}

export type WeeklyEvent = {
  id: string; workId: string; kind: "created" | "merged" | "revised";
  day?: string; interval?: string; version: string; note: string; sourceIds: string[];
};
export function weeklyEvents(week: string, snapshots: PRSnapshot[] = kvCommunity.snapshots,
  revisions: WeeklyRevision[] = kvWeekly.revisions): WeeklyEvent[] {
  if (!weekRange(week)) return [];
  const events = new Map<string, WeeklyEvent>();
  for (const snapshot of snapshots) {
    for (const [kind, instant] of [["created", snapshot.createdAt], ["merged", snapshot.mergedAt]] as const) {
      if (!instant || weekForInstant(instant) !== week) continue;
      const id = snapshot.id + ":" + kind;
      events.set(id, { id, workId: snapshot.id, kind, day: shanghaiDay(instant),
        version: snapshot.headSha, note: "事件来自 " + (kind === "created" ? "createdAt" : "mergedAt")
          + "；状态/head 为 " + snapshot.checkedAt + " 快照，未断言事件发生时的 head。", sourceIds: [] });
    }
  }
  for (const revision of revisions) {
    // A cross-week observation interval cannot establish which week a mechanism changed.
    if (revision.kind !== "mechanism" || revision.fromVersion === revision.toVersion
      || weekForDay(revision.fromCheckedAt) !== week || weekForDay(revision.toCheckedAt) !== week) continue;
    const id = revision.id;
    events.set(id, { id, workId: revision.workId, kind: "revised", interval: revision.fromCheckedAt + " 至 " + revision.toCheckedAt,
      version: revision.toVersion, note: revision.description, sourceIds: revision.sourceIds });
  }
  return [...events.values()].sort((a, b) => (a.day ?? a.interval ?? "").localeCompare(b.day ?? b.interval ?? "") || a.id.localeCompare(b.id));
}
export function weeklyEventCounts(events: WeeklyEvent[]) {
  return Object.fromEntries((["created", "merged", "revised"] as const).map(kind =>
    [kind, new Set(events.filter(event => event.kind === kind).map(event => event.workId)).size])) as Record<WeeklyEvent["kind"], number>;
}
export const eventLabels = { created: "本周新建", merged: "本周合入", revised: "旧 PR 实质修订" };
export const materialPart = (id: string) => "kv-material-" + id.replace(/^github:/, "").replace(/[^a-zA-Z0-9-]/g, "-");
export function materialSearch(id: string) {
  return new URLSearchParams({ view: "evidence", q: id, part: materialPart(id) }).toString();
}
export const materialFor = (id: string) => communityEntries.find(entry => entry.id === id);
export function reportSourceIds(report: WeeklyReport) {
  return [...new Set([...report.questions.flatMap(question => question.evidence.flatMap(row => row.sourceIds)),
    ...report.progress.flatMap(row => row.sourceIds),
    ...weeklyEvents(report.week).flatMap(row => row.sourceIds)])];
}

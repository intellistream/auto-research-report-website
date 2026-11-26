import { communityEntries, hasVersionChange, kvCommunity, type PRSnapshot } from "./kv-community";
import { kvResearch, type ResearchEntry } from "./kv-research";
import { calendarDay, shanghaiDay } from "./kv-weekly";

export const trendWindow = { start: kvCommunity.periodStart, end: kvCommunity.periodEnd };
export const trendTopicLabels = {
  movement: "放置与传输", lifecycle: "容量与生命周期", representation: "表示、布局与压缩",
  reuse: "复用与匹配", scheduling: "缓存感知调度",
};
export function inTrendWindow(day?: string) {
  return !!day && !!calendarDay(day) && day >= trendWindow.start && day <= trendWindow.end;
}

// Join by stable PR identity. A later targeted review is not a new collection snapshot.
export function buildTrendRows(entries: ResearchEntry[] = communityEntries, snapshots: PRSnapshot[] = kvCommunity.snapshots) {
  const snapshotMap = new Map(snapshots.map(row => [row.id, row]));
  const newIds = new Set(kvCommunity.newEntries.map(row => row.id));
  return [...new Map(entries.filter(row => row.kind === "pr" && row.decision === "included")
    .map(row => [row.id, row])).values()].map(entry => {
    const snapshot = snapshotMap.get(entry.id);
    return {
      entry, snapshot,
      createdDay: shanghaiDay(snapshot?.createdAt ?? entry.createdAt ?? ""),
      mergedDay: snapshot?.merged && snapshot.mergedAt ? shanghaiDay(snapshot.mergedAt) : undefined,
      added: newIds.has(entry.id),
      changed: !!snapshot && hasVersionChange(snapshot),
    };
  });
}
export type TrendRow = ReturnType<typeof buildTrendRows>[number];
export const trendRows = buildTrendRows();
export const trendStats = {
  total: trendRows.length,
  vllm: trendRows.filter(row => row.entry.repository === "vllm").length,
  ascend: trendRows.filter(row => row.entry.repository === "vllm-ascend").length,
  added: trendRows.filter(row => row.added).length,
  created: trendRows.filter(row => inTrendWindow(row.createdDay)).length,
  merged: trendRows.filter(row => inTrendWindow(row.mergedDay)).length,
  baseline: trendRows.filter(row => row.snapshot?.baseline).length,
  changed: trendRows.filter(row => row.changed).length,
};
export const trendTopics = kvResearch.taxonomy.map(topic => {
  const rows = trendRows.filter(row => row.entry.primaryTopic === topic.id);
  return {
    ...topic, shortLabel: trendTopicLabels[topic.id], count: rows.length,
    added: rows.filter(row => row.added).length,
    share: trendStats.total ? rows.length / trendStats.total * 100 : 0,
    vllm: rows.filter(row => row.entry.repository === "vllm").length,
    ascend: rows.filter(row => row.entry.repository === "vllm-ascend").length,
    merged: rows.filter(row => inTrendWindow(row.mergedDay)).length,
  };
}).sort((a, b) => b.count - a.count);

export function buildTrendDays(rows: TrendRow[] = trendRows) {
  const start = calendarDay(trendWindow.start), end = calendarDay(trendWindow.end);
  if (!start || !end || start > end) return [];
  const days: { day: string; created: number; merged: number }[] = [];
  for (let time = start.getTime(); time <= end.getTime(); time += 86_400_000) {
    const day = new Date(time).toISOString().slice(0, 10);
    days.push({ day, created: rows.filter(row => row.createdDay === day).length,
      merged: rows.filter(row => row.mergedDay === day).length });
  }
  return days;
}
export const trendDays = buildTrendDays();

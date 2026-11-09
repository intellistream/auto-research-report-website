import {
  entriesOf,
  sortReports,
  type CatalogItem,
  type Report,
  type RunData,
  type Source,
  type ChapterKey,
} from "./types";
export type ReportSnapshot = {
  item: CatalogItem;
  report: Report;
  run?: RunData;
};
type Observation = {
  item: CatalogItem;
  workId: string;
  source: Exclude<Source, "paper">;
  title: string;
  needsReview: boolean | null;
  analysis: "failed" | "not_failed" | "unknown";
  chapter?: ChapterKey;
};
export type PRStatistic = {
  workId: string;
  source: Exclude<Source, "paper">;
  title: string;
  item: CatalogItem;
  review: "pending" | "unflagged" | "mixed" | "unknown";
  analysisFailed: boolean;
  analysisKnown: boolean;
  days: string[];
  chapters: ChapterKey[];
  versions: number;
};
export function realCatalogItems(items: CatalogItem[]) {
  return sortReports(items.filter((i) => !i.synthetic));
}
export function aggregateStatistics(
  snapshots: ReportSnapshot[],
  sourceFilter = "",
  dayFilter = "",
) {
  const observations: Observation[] = [];
  const real = snapshots.filter(
    (s) => s.item.synthetic === false && s.report.synthetic === false,
  );
  for (const { item, report, run } of real) {
    if (dayFilter && item.day !== dayFilter) continue;
    const add = (o: Observation) => {
      if (!sourceFilter || o.source === sourceFilter) observations.push(o);
    };
    for (const e of entriesOf(report)) {
      if (e.card.source_type === "paper") continue;
      const outcome = run?.outcomes?.[e.card.card_id];
      add({
        item,
        workId: e.card.work_id,
        source: e.card.source_type,
        title: e.card.content.title_zh,
        needsReview: !!e.card.needs_review,
        chapter: e.card.content.chapter,
        analysis:
          outcome?.analysis === "failed"
            ? "failed"
            : outcome?.analysis === "card_delivered"
              ? "not_failed"
              : "unknown",
      });
    }
    // Pending inventory may contain work with no rendered body; retain it in the total.
    for (const row of report.pending_prs || []) {
      const workId =
        "github:" + row.candidate.repository + "#" + row.candidate.pr_number;
      const rendered = observations.find(
        (o) => o.item.id === item.id && o.workId === workId,
      );
      if (rendered) {
        if (row.status === "pending" && rendered.needsReview === false)
          add({ ...rendered, needsReview: true });
        continue;
      }
      add({
        item,
        workId,
        source:
          row.candidate.repository === "vllm-project/vllm-ascend"
            ? "ascend"
            : "upstream",
        title: row.candidate.title,
        needsReview: row.status === "pending" ? true : null,
        analysis: "unknown",
      });
    }
  }
  const byWork = new Map<string, Observation[]>();
  for (const o of observations)
    byWork.set(o.workId, [...(byWork.get(o.workId) || []), o]);
  const prs: PRStatistic[] = [...byWork]
    .map(([workId, rows]) => {
      const sorted = [...rows].sort(
        (a, b) =>
          b.item.day.localeCompare(a.item.day) ||
          a.item.id.localeCompare(b.item.id),
      );
      const known = new Set(
        rows.map((r) => r.needsReview).filter((v) => v !== null),
      );
      const review: PRStatistic["review"] =
        known.size > 1
          ? "mixed"
          : known.has(true)
            ? "pending"
            : known.has(false)
              ? "unflagged"
              : "unknown";
      return {
        workId,
        source: sorted[0].source,
        title: sorted[0].title,
        item: sorted[0].item,
        review,
        analysisFailed: rows.some((r) => r.analysis === "failed"),
        analysisKnown: rows.every((r) => r.analysis !== "unknown"),
        days: [...new Set(rows.map((r) => r.item.day))].sort(),
        chapters: [
          ...new Set(rows.flatMap((r) => (r.chapter ? [r.chapter] : []))),
        ],
        versions: new Set(rows.map((r) => r.item.id)).size,
      };
    })
    .sort((a, b) => a.workId.localeCompare(b.workId));
  const days = [
    ...new Set(
      real
        .filter((s) => !dayFilter || s.item.day === dayFilter)
        .map((s) => s.item.day),
    ),
  ].sort();
  const daily = days.map((day) => {
    const dailyPRs = prs.filter((p) => p.days.includes(day));
    return {
      day,
      total: dailyPRs.length,
      pending: dailyPRs.filter((p) =>
        observations.some(
          (o) =>
            o.workId === p.workId &&
            o.item.day === day &&
            o.needsReview === true,
        ),
      ).length,
    };
  });
  return {
    prs,
    total: prs.length,
    pending: prs.filter((p) => p.review === "pending" || p.review === "mixed")
      .length,
    failures: prs.some((p) => !p.analysisKnown)
      ? null
      : prs.filter((p) => p.analysisFailed).length,
    knownFailures: prs.filter((p) => p.analysisFailed).length,
    days: days.length,
    reports: real.filter((s) => !dayFilter || s.item.day === dayFilter).length,
    daily,
    sources: (
      [
        { key: "upstream", label: "vLLM" },
        { key: "ascend", label: "vLLM-Ascend" },
      ] as const
    ).map((s) => ({
      ...s,
      count: prs.filter((p) => p.source === s.key).length,
    })),
    review: (
      [
        { key: "pending", label: "待人工核查" },
        { key: "unflagged", label: "未标记待核查" },
        { key: "mixed", label: "跨版本状态不一致" },
        { key: "unknown", label: "状态未交付" },
      ] as const
    ).map((s) => ({
      ...s,
      count: prs.filter((p) => p.review === s.key).length,
    })),
    papers: new Set(
      real.flatMap((s) =>
        entriesOf(s.report)
          .filter((e) => e.card.source_type === "paper")
          .map((e) => e.card.work_id),
      ),
    ).size,
  };
}

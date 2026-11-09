import { entriesOf, chapterKeys, type ChapterKey } from "./types";
import {
  aggregateStatistics,
  type ReportSnapshot,
  type PRStatistic,
} from "./statistics";
export const directionDefinitions = [
  { key: "startup", label: "服务启动与模型准备", color: "#668d73" },
  { key: "scheduling", label: "请求接入与调度", color: "#3c806d" },
  { key: "prefill", label: "Prefill 输入上下文处理", color: "#b3935e" },
  { key: "pd_transfer", label: "P/D 分离部署的缓存交接", color: "#6595a1" },
  { key: "decode", label: "Decode 常规生成", color: "#8e7faf" },
  { key: "speculative", label: "推测解码", color: "#b47c8b" },
  { key: "output_return", label: "输出返回与状态更新", color: "#7090bc" },
  { key: "resource_reclaim", label: "资源回收与缓存保留", color: "#a2a05d" },
  { key: "unclassified", label: "待分类", color: "#acb6ae" },
  { key: "classification_conflict", label: "分类不一致", color: "#b87d68" },
] as const;
export type DirectionKey = (typeof directionDefinitions)[number]["key"];
type DirectionObservation = {
  workId: string;
  day: string;
  chapter: ChapterKey | null;
  confirmed: boolean;
};
export type DirectionPR = PRStatistic & {
  direction: DirectionKey;
  classificationConfirmed: boolean;
};
export type TrendDay = {
  day: string;
  total: number;
  counts: Record<DirectionKey, number>;
  shares: Record<DirectionKey, number | null>;
};
function resolve(rows: DirectionObservation[]) {
  const valid = rows.filter((r) => r.chapter && r.chapter !== "papers");
  const labels = [...new Set(valid.map((r) => r.chapter!))];
  if (labels.length > 1)
    return {
      direction: "classification_conflict" as DirectionKey,
      confirmed: false,
    };
  if (!labels.length)
    return { direction: "unclassified" as DirectionKey, confirmed: false };
  return {
    direction: labels[0] as DirectionKey,
    confirmed: valid.every((r) => r.confirmed),
  };
}
export function utcDay(day: string) {
  return Date.parse(day + "T00:00:00Z") / 86400000;
}
export function connectedSegments<
  T extends { day: string; value: number | null },
>(points: T[]): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];
  for (const point of points) {
    if (point.value === null) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    if (current.length && utcDay(point.day) - utcDay(current.at(-1)!.day) > 1) {
      segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}
export function optimizationStatistics(
  snapshots: ReportSnapshot[],
  source = "",
  from = "",
  to = "",
) {
  const filtered = snapshots.filter(
    (s) =>
      s.item.synthetic === false &&
      s.report.synthetic === false &&
      (!from || s.item.day >= from) &&
      (!to || s.item.day <= to),
  );
  const base = aggregateStatistics(filtered, source);
  const observations: DirectionObservation[] = [];
  for (const s of filtered) {
    const rendered = new Set<string>();
    for (const entry of entriesOf(s.report)) {
      const card = entry.card;
      if (
        card.source_type === "paper" ||
        (source && card.source_type !== source)
      )
        continue;
      rendered.add(card.work_id);
      const content = card.content;
      const delivered =
        !content.location_basis ||
        content.location_basis === "delivered_chapter";
      const outcome = s.run?.outcomes?.[card.card_id];
      observations.push({
        workId: card.work_id,
        day: s.item.day,
        chapter: chapterKeys.includes(content.chapter) ? content.chapter : null,
        confirmed:
          delivered &&
          outcome?.classification === "confirmed" &&
          outcome?.classification_receipt === true,
      });
    }
    for (const row of s.report.pending_prs || []) {
      const repo =
        row.candidate.repository === "vllm-project/vllm-ascend"
          ? "ascend"
          : "upstream";
      const workId =
        "github:" + row.candidate.repository + "#" + row.candidate.pr_number;
      if (rendered.has(workId) || (source && repo !== source)) continue;
      observations.push({
        workId,
        day: s.item.day,
        chapter: null,
        confirmed: false,
      });
    }
  }
  const prs: DirectionPR[] = base.prs.map((pr) => {
    const r = resolve(observations.filter((o) => o.workId === pr.workId));
    return {
      ...pr,
      direction: r.direction,
      classificationConfirmed: r.confirmed,
    };
  });
  const directions = directionDefinitions.map((d) => {
    const group = prs.filter((p) => p.direction === d.key);
    return {
      ...d,
      count: group.length,
      share: base.total ? (group.length / base.total) * 100 : null,
      tentative: group.filter((p) => !p.classificationConfirmed).length,
      prs: group,
    };
  });
  const series: TrendDay[] = base.daily.map((d) => {
    const dayIds = [
      ...new Set(
        observations.filter((o) => o.day === d.day).map((o) => o.workId),
      ),
    ];
    const classified = dayIds.map(
      (id) =>
        resolve(observations.filter((o) => o.day === d.day && o.workId === id))
          .direction,
    );
    const counts = Object.fromEntries(
      directionDefinitions.map((dir) => [
        dir.key,
        classified.filter((k) => k === dir.key).length,
      ]),
    ) as Record<DirectionKey, number>;
    return {
      day: d.day,
      total: dayIds.length,
      counts,
      shares: Object.fromEntries(
        directionDefinitions.map((dir) => [
          dir.key,
          dayIds.length ? (counts[dir.key] / dayIds.length) * 100 : null,
        ]),
      ) as Record<DirectionKey, number | null>,
    };
  });
  const activeDirections = directions.filter(
    (d) => d.count > 0 || series.some((s) => s.counts[d.key] > 0),
  );
  const latest = series.at(-1),
    previous = series.at(-2);
  const adjacent =
    latest && previous && utcDay(latest.day) - utcDay(previous.day) === 1;
  const changes = directions.map((d) => ({
    ...d,
    countDelta: adjacent
      ? latest!.counts[d.key] - previous!.counts[d.key]
      : null,
    shareDelta:
      adjacent &&
      latest!.shares[d.key] !== null &&
      previous!.shares[d.key] !== null
        ? latest!.shares[d.key]! - previous!.shares[d.key]!
        : null,
  }));
  return {
    ...base,
    prs,
    directions,
    activeDirections,
    series,
    changes,
    adjacentDates: !!adjacent,
    assignedDirections: directions.filter(
      (d) =>
        !["unclassified", "classification_conflict"].includes(d.key) &&
        d.count > 0,
    ).length,
    tentative: prs.filter((p) => !p.classificationConfirmed).length,
    latestDay: latest?.day,
    previousDay: previous?.day,
  };
}

import {
  directionDefinitions,
  utcDay,
  type DirectionKey,
  type TrendDay,
} from "../optimization";
import type { Catalog, Report, Version } from "./docx-data";

const repositories = ["vllm-project/vllm", "vllm-project/vllm-ascend"] as const;
type Observation = {
  workId: string;
  day: string;
  version: string;
  number: string;
  title: string;
  direction: DirectionKey;
  primary: boolean;
};

export function selectedVersions(catalog: Catalog, from = "", to = "") {
  return Object.entries(catalog.days)
    .filter(([day]) => (!from || day >= from) && (!to || day <= to))
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, record]) => ({
      day,
      version: record.versions.find((v) => v.sha256 === record.current),
    }));
}

export function validateWordReport(
  value: unknown,
  day: string,
  version: Version,
): Report {
  const report = value as Report;
  if (
    !report ||
    report.schemaVersion !== 1 ||
    report.day !== day ||
    report.sha256 !== version.sha256 ||
    typeof report.title !== "string" ||
    !report.counts ||
    !(["upstream", "ascend", "papers"] as const).every(
      (key) =>
        Number.isSafeInteger(report.counts[key]) && report.counts[key] >= 0,
    ) ||
    !Array.isArray(report.sections)
  )
    throw new Error("日报日期、版本或格式与目录不一致");
  for (const section of report.sections) {
    if (typeof section.key !== "string" || !Array.isArray(section.blocks))
      throw new Error("日报章节格式无效");
    for (const block of section.blocks) {
      if (block.kind !== "entry") continue;
      if (
        typeof block.number !== "string" ||
        typeof block.title !== "string" ||
        !Array.isArray(block.paragraphs) ||
        !block.paragraphs.every(
          (parts) =>
            Array.isArray(parts) &&
            parts.every(
              (part) =>
                part &&
                typeof part.text === "string" &&
                (part.url === undefined || typeof part.url === "string"),
            ),
        )
      )
        throw new Error("日报条目格式无效");
    }
  }
  return report;
}

function validWorkId(id: string | undefined) {
  return id && /^github:vllm-project\/(?:vllm|vllm-ascend)#[1-9]\d*$/.test(id)
    ? id
    : undefined;
}
function prLink(value: string) {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.hostname !== "github.com" ||
      url.username ||
      url.password
    )
      return;
    const match = url.pathname.match(
      /^\/(vllm-project\/(?:vllm|vllm-ascend))\/pull\/([1-9]\d*)\/?$/,
    );
    return match ? `github:${match[1]}#${match[2]}` : undefined;
  } catch {
    return;
  }
}
function resolve(rows: Observation[]): DirectionKey {
  const keys = [
    ...new Set(
      rows.map((r) => r.direction).filter((k) => k !== "unclassified"),
    ),
  ];
  return keys.length > 1
    ? "classification_conflict"
    : (keys[0] ?? "unclassified");
}
function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = groups.get(id) ?? [];
    list.push(row);
    groups.set(id, list);
  }
  return groups;
}

/** Statistics follow report headings and every explicit PR link; no prose/status is inferred. */
export function wordStatistics(
  reports: Report[],
  source = "",
  from = "",
  to = "",
) {
  const scoped = reports
    .filter((r) => (!from || r.day >= from) && (!to || r.day <= to))
    .slice()
    .sort((a, b) => b.day.localeCompare(a.day));
  const observations: Observation[] = [];
  let unidentified = 0;
  for (const report of scoped)
    for (const section of report.sections) {
      if (section.key === "papers") continue;
      const direction: DirectionKey = directionDefinitions.some(
        (d) => d.key === section.key,
      )
        ? (section.key as DirectionKey)
        : "unclassified";
      for (const block of section.blocks) {
        if (block.kind !== "entry") continue;
        const primary = validWorkId(block.workId);
        const ids = new Set<string>(primary ? [primary] : []);
        for (const parts of block.paragraphs)
          for (const part of parts) {
            const id = part.url ? prLink(part.url) : undefined;
            if (id) ids.add(id);
          }
        if (!ids.size) unidentified++;
        for (const workId of ids) {
          if (source && workId.split("#")[0] !== source) continue;
          observations.push({
            workId,
            day: report.day,
            version: report.sha256,
            number: block.number,
            title: block.title,
            direction,
            primary: workId === primary,
          });
        }
      }
    }
  const prs = [...groupBy(observations, (r) => r.workId)]
    .map(([workId, rows]) => ({
      ...rows[0],
      workId,
      direction: resolve(rows),
      primary: rows.some((r) => r.primary),
      days: [...new Set(rows.map((r) => r.day))].sort(),
    }))
    .sort(
      (a, b) => b.day.localeCompare(a.day) || a.workId.localeCompare(b.workId),
    );
  const total = prs.length;
  const directions = directionDefinitions.map((d) => {
    const rows = prs.filter((r) => r.direction === d.key);
    return {
      ...d,
      count: rows.length,
      share: total ? (rows.length / total) * 100 : null,
      tentative: ["unclassified", "classification_conflict"].includes(d.key)
        ? rows.length
        : 0,
    };
  });
  const series: TrendDay[] = [...new Set(scoped.map((r) => r.day))]
    .sort()
    .map((day) => {
      const rows = [
        ...groupBy(
          observations.filter((r) => r.day === day),
          (r) => r.workId,
        ).values(),
      ].map(resolve);
      const counts = Object.fromEntries(
        directionDefinitions.map((d) => [
          d.key,
          rows.filter((k) => k === d.key).length,
        ]),
      ) as TrendDay["counts"];
      return {
        day,
        total: rows.length,
        counts,
        shares: Object.fromEntries(
          directionDefinitions.map((d) => [
            d.key,
            rows.length ? (counts[d.key] / rows.length) * 100 : null,
          ]),
        ) as TrendDay["shares"],
      };
    });
  const latest = series.at(-1),
    previous = series.at(-2);
  const adjacentDates = !!(
    latest &&
    previous &&
    utcDay(latest.day) - utcDay(previous.day) === 1
  );
  return {
    total,
    prs,
    directions,
    series,
    unidentified,
    primaryTotal: prs.filter((p) => p.primary).length,
    linkedOnly: prs.filter((p) => !p.primary).length,
    papers: scoped.reduce((sum, r) => sum + r.counts.papers, 0),
    activeDirections: directions.filter(
      (d) => d.count || series.some((s) => s.counts[d.key]),
    ),
    assignedDirections: directions.filter(
      (d) =>
        d.count && !["unclassified", "classification_conflict"].includes(d.key),
    ).length,
    changes: directions.map((d) => ({
      ...d,
      countDelta: adjacentDates
        ? latest!.counts[d.key] - previous!.counts[d.key]
        : null,
      shareDelta:
        adjacentDates &&
        latest!.shares[d.key] !== null &&
        previous!.shares[d.key] !== null
          ? latest!.shares[d.key]! - previous!.shares[d.key]!
          : null,
    })),
    latestDay: latest?.day,
    previousDay: previous?.day,
    adjacentDates,
    sources: repositories.map((repository) => ({
      label: repository.endsWith("ascend") ? "vLLM Ascend" : "vLLM",
      count: prs.filter((p) => p.workId.startsWith(`github:${repository}#`))
        .length,
    })),
  };
}

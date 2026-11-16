import type { Entry, Topic } from "./TopicPages";

export type Reference = {
  id: string; kind: "paper" | "pr" | "documentation" | "methodology"; title: string; url: string; year?: number;
  evidenceLevel: string; note?: string; workId?: string;
};
export type EvidenceDetail = {
  id: string; sourceIds: string[]; comparison: string; mechanism: string; level: string;
  environment: string; revision: string; workload: string; result: string; limitation: string; verification: string;
};
export type ReviewSummary = {
  date: string; provider: string; model: string; type: "independent-review"; summary: string; limitations: string[];
};
export type ResearchReport = {
  title: string; abstract: string; researchQuestions: string[];
  methodology: { type: string; searchDate: string; scope: string; searchStrategy: string;
    inclusionCriteria: string[]; exclusionCriteria: string[]; synthesis: string } | string[];
  sections: { id: string; title: string; paragraphs: string[]; sourceIds: string[] }[];
  taxonomy: { problem: string; approach: string; tradeoff: string; sourceIds: string[] }[];
  gaps: { id: string; title: string; observation: string; question: string; validation: string; sourceIds: string[]; status: string }[];
  references: Reference[]; limitations: string[]; changelog: { date: string; summary: string }[];
  version: string; revision: number; asOf: string; status: string; previousVersion?: string | null;
  synthesizedWorkIds?: string[]; pendingEvidence?: Entry[];
  sourceDelta?: { added: string[]; removed: string[]; changed: string[] };
  pdfPath?: string; markdownPath?: string; htmlPath?: string;
  evidenceDetails?: EvidenceDetail[];
  reviewSummary?: ReviewSummary;
};

export function safeTopicSource(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return;
    return parsed.href;
  } catch { return; }
}

// Only the exact artifact belonging to this immutable version can be downloaded.
export type ArtifactKind = "pdf" | "md" | "html" | "json";
export function topicVersionArtifactHref(topicId: string, version: string, kind: ArtifactKind): string | undefined {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(topicId) || !/^[a-f0-9]{64}$/.test(version)) return;
  const path = `topic-reports/${topicId}/${version}/report.${kind}`;
  const local = import.meta.env.DEV && ["docx", "pipeline"].includes(import.meta.env.MODE);
  return import.meta.env.BASE_URL + (local ? "" : "word-reports/") + path;
}

export function topicArtifactHref(topicId: string, report: ResearchReport, kind: ArtifactKind): string | undefined {
  const path = { pdf: report.pdfPath, md: report.markdownPath, html: report.htmlPath, json: `topic-reports/${topicId}/${report.version}/report.json` }[kind];
  if (path !== `topic-reports/${topicId}/${report.version}/report.${kind}`) return;
  return topicVersionArtifactHref(topicId, report.version, kind);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export type FrozenVersion = { report: ResearchReport; hrefs: Partial<Record<ArtifactKind, string>> };
// A successful JSON read also rejects the HTML fallback commonly returned by static hosts.
// The current page must match the whole frozen report before offering its downloads.
export async function loadFrozenVersion(topicId: string, version: string, signal: AbortSignal, expected?: ResearchReport, request: typeof fetch = fetch): Promise<FrozenVersion> {
  const json = topicVersionArtifactHref(topicId, version, "json");
  if (!json) throw new Error("版本标识无效");
  const response = await request(json, { signal });
  if (!response.ok) throw new Error(`冻结元数据不可用（HTTP ${response.status}）`);
  const report = await response.json() as ResearchReport;
  if (report.version !== version || !Number.isInteger(report.revision) || report.revision < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(report.asOf) || typeof report.title !== "string") throw new Error("冻结元数据与版本不符");
  if (expected && canonical(report) !== canonical(expected)) throw new Error("网页内容与冻结稿不一致，下载已暂停");
  const hrefs: FrozenVersion["hrefs"] = { json };
  await Promise.all((["pdf", "md", "html"] as const).map(async (kind) => {
    const href = topicArtifactHref(topicId, report, kind);
    if (!href) return;
    try {
      const asset = await request(href, { method: "HEAD", signal });
      const type = asset.headers.get("content-type")?.split(";")[0];
      if (asset.ok && (kind === "pdf" ? type === "application/pdf" : kind === "html" ? type === "text/html" : !!type && type !== "text/html")) hrefs[kind] = href;
    } catch (error) { if (signal.aborted) throw error; }
  }));
  return { report, hrefs };
}

export function sectionLead(paragraph: string): string {
  return paragraph.match(/^.*?[。！？](?:[”’])?/)?.[0] ?? paragraph;
}

export function reportOverview(report: ResearchReport) {
  const sentences = report.abstract.match(/[^。！？]+[。！？]?/g) ?? [report.abstract];
  return { problem: sentences.slice(0, 2).join(""), conclusion: sentences.find((s) => s.includes("综合判断")), boundary: sentences.find((s) => s.includes("当前证据")) };
}

export function revealTopicPart(doc: Document, id: string, reducedMotion = false): boolean {
  const target = doc.getElementById(id);
  if (!target) return false;
  // References and excerpts can live inside collapsed analyses or appendices.
  for (let node: HTMLElement | null = target; node; node = node.parentElement) {
    if (node.tagName === "DETAILS") (node as HTMLDetailsElement).open = true;
  }
  target.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
  return true;
}

export function evidenceTimeline(topic: Topic, report: ResearchReport) {
  const cited = new Set(report.synthesizedWorkIds ?? report.references.flatMap((ref) => ref.workId ? [ref.workId] : []));
  const days = new Map<string, { day: string; synthesized: number; pending: number }>();
  for (const entry of new Map(topic.entries.map((entry) => [entry.workId, entry])).values()) {
    const row = days.get(entry.day) ?? { day: entry.day, synthesized: 0, pending: 0 };
    if (cited.has(entry.workId)) row.synthesized += 1; else row.pending += 1;
    days.set(entry.day, row);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

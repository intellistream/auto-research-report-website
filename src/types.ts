export const chapterKeys = [
  "startup",
  "scheduling",
  "prefill",
  "pd_transfer",
  "decode",
  "speculative",
  "output_return",
  "resource_reclaim",
  "papers",
] as const;
export type ChapterKey = (typeof chapterKeys)[number];
export type Source = "ascend" | "upstream" | "paper";
export type Content = {
  chapter: ChapterKey;
  title_zh: string;
  original_title?: string | null;
  title_status?: string | null;
  title_error?: string | null;
  body?: string | null;
  problem?: string | null;
  optimization?: string | null;
  effects_and_limits?: string | null;
  source_links: { label: string; url: string }[];
  diagram_nodes: ChapterKey[];
  location_basis?: string;
};
export type Entry = {
  number: string;
  card: {
    card_id: string;
    work_id: string;
    source_type: Source;
    content: Content;
    needs_review?: boolean;
  };
};
export type Chapter = {
  key: ChapterKey;
  title: string;
  intro: string;
  groups: { title: string; entries: Entry[] }[];
};
export type Report = {
  schema_version: string;
  day: string;
  synthetic: boolean;
  coverage_notice: string | null;
  summary: string;
  chapters: Chapter[];
  numbers: Record<string, string>;
  diagram_numbers: Record<string, string[]>;
  pending_prs?: {
    candidate: { repository: string; pr_number: number; title: string };
    status: string;
    reason: string;
  }[];
};
export type Asset = { path: string; sha256: string };
export type CatalogItem = {
  id: string;
  day: string;
  version: string;
  run: string;
  title: string;
  scenario: string;
  status: "available" | "zero_candidates" | "not_generated" | "failed";
  synthetic: boolean;
  notice: string;
  entries: number;
  pending: number;
  report?: Asset;
  assets: Partial<Record<"word" | "markdown" | "flow", Asset>>;
  runData?: Asset;
};
export type Catalog = {
  schema_version: "site-index/0.1";
  items: CatalogItem[];
};
export type RunData = {
  id: string;
  report_id: string;
  synthetic: boolean;
  program_status: string;
  semantic_quality: string;
  published: null;
  discovery: null;
  analysis_failures: number | null;
  title_failures: number | null;
  input_sha256: string;
  checks: Record<string, string>;
  evidence: Record<
    string,
    {
      excerpt: string | null;
      note: string;
      observed_at?: string | null;
      occurred_at?: string | null;
      items?: {
        id: string;
        kind: string;
        url: string;
        excerpt: string;
        truncated: boolean;
        text_sha256: string;
      }[];
    }
  >;
  outcomes?: Record<
    string,
    {
      analysis: string;
      review: string | null;
      classification: string | null;
      classification_receipt: boolean;
      writing: string | null;
      writing_error: string | null;
    }
  >;
  scope_notice?: string;
  layout_refreshed?: boolean;
  source_report_sha256?: string;
};
export const sourceNames: Record<Source, string> = {
  upstream: "vLLM",
  ascend: "vLLM-Ascend",
  paper: "论文",
};
export const entriesOf = (report: Report) =>
  report.chapters.flatMap((c) => c.groups.flatMap((g) => g.entries));

export function latestAvailable(catalog: Catalog): CatalogItem | undefined {
  return [...catalog.items]
    .filter((i) => i.status === "available")
    .sort(
      (a, b) =>
        Number(a.synthetic) - Number(b.synthetic) ||
        b.day.localeCompare(a.day) ||
        a.id.localeCompare(b.id),
    )[0];
}

export const statusText = (value?: string | null): string =>
  value
    ? (
        {
          escalated: "待人工处理",
          auto_passed: "自动审查通过",
          passed: "审查通过",
          skipped: "跳过写作",
          failed: "失败",
          completed: "已完成",
          written: "已写作",
          not_delivered: "未交付",
        } as Record<string, string>
      )[value] || value
    : "未交付";

export function sortReports(items: CatalogItem[]): CatalogItem[] {
  return [...items].sort(
    (a, b) =>
      b.day.localeCompare(a.day) ||
      Number(a.synthetic) - Number(b.synthetic) ||
      a.version.localeCompare(b.version) ||
      a.id.localeCompare(b.id),
  );
}

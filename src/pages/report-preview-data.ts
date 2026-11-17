import { useEffect, useState } from "react";

type Part = { text: string; url?: string };
export type Counts = { upstream: number; ascend: number; papers: number };
type Block =
  | { kind: "paragraph"; parts: Part[]; chapterIntro?: boolean }
  | { kind: "group"; title: string }
  | { kind: "entry"; number: string; title: string; workId?: string; paragraphs: Part[][];
      needsReview?: boolean; provisionalLocation?: boolean; titlePending?: boolean; brief?: boolean };
export const pipelineStatuses = {
  completed_program_checks: "程序检查通过",
  complete_with_pending: "含待核对条目",
  partial_draft: "部分完成",
  no_cards: "无入稿条目",
} as const;
export type Report = {
  title: string;
  day: string;
  sha256: string;
  intro: Part[][];
  original?: string;
  originalName?: string;
  pipelineStatus?: keyof typeof pipelineStatuses;
  publicationStatus?: "preview" | "reviewed";
  counts: Counts;
  warnings: string[];
  sections: { key: string; title: string; figure?: string; intro?: string; blocks: Block[] }[];
};
export type Version = { sha256: string; path: string; counts: Counts };
export type Catalog = {
  schemaVersion: 1;
  days: Record<string, { current: string; versions: Version[] }>;
};

export const localReports = import.meta.env.DEV && ["docx", "pipeline"].includes(import.meta.env.MODE);
export const historyArchive = "https://github.com/intellistream/auto-research-report-website/releases/download/word-report-preview-20261023-20261108/20261023-20261108.zip";

export function reportAsset(path: string) {
  return import.meta.env.BASE_URL + (localReports ? "" : "word-reports/") + path;
}

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(reportAsset(path), { signal, cache: "no-cache" });
  if (!response.ok) throw new Error(`无法读取 ${path}（HTTP ${response.status}）`);
  return response.json();
}

export function useJson<T>(path: string | undefined) {
  const [state, setState] = useState<{ path: string; data?: T; error?: string }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    readJson<T>(path, controller.signal)
      .then((data) => setState({ path, data }))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ path, error: error.message });
      });
    return () => controller.abort();
  }, [path]);
  return state?.path === path ? state : undefined;
}

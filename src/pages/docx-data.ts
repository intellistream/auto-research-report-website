export type Part = { text: string; url?: string };
export type Counts = { upstream: number; ascend: number; papers: number };
export type Block =
  | { kind: "paragraph"; parts: Part[] }
  | { kind: "group"; title: string }
  | {
      kind: "entry";
      number: string;
      title: string;
      workId?: string;
      paragraphs: Part[][];
    };
export type Report = {
  schemaVersion: 1;
  sha256: string;
  title: string;
  day: string;
  intro: Part[][];
  original?: string;
  originalName: string;
  counts: Counts;
  warnings: string[];
  sections: { key: string; title: string; figure?: string; blocks: Block[] }[];
};
export type Version = { sha256: string; path: string; counts: Counts };
export type Catalog = {
  schemaVersion: 1;
  days: Record<string, { current: string; versions: Version[] }>;
};

export const localReports =
  import.meta.env.DEV && import.meta.env.MODE === "docx";
export function reportAsset(path: string) {
  return (
    import.meta.env.BASE_URL + (localReports ? "" : "word-reports/") + path
  );
}

export async function readJson<T>(
  path: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(reportAsset(path), {
    signal,
    cache: "no-cache",
  });
  if (!response.ok)
    throw new Error(`无法读取 ${path}（HTTP ${response.status}）`);
  return response.json();
}

export const PAPER_FILES = {
  html: "paper.html", pdf: "paper.pdf", markdown: "paper.md", latex: "paper.tex",
  bibtex: "references.bib", sources: "sources.zip",
} as const;
export type PaperAssetKind = keyof typeof PAPER_FILES;
export type AcademicPaper = {
  schemaVersion: 1; title: string; titleEn: string; abstract: string; keywords: string[];
  literatureCutoff: string; version: string; manuscriptRevision: string;
  assets: Record<PaperAssetKind, { path: string; sha256: string; bytes: number }> & {
    word?: { path: string; sha256: string; bytes: number };
  };
  manifestPath: string;
};

// No user-controlled URL or filename is resolved. Every asset must identify this
// topic and immutable version exactly, including its metadata checksum.
export function academicPaperHrefs(topicId: string, paper: AcademicPaper) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(topicId) || paper.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(paper.version)) return;
  if (![paper.title, paper.titleEn, paper.abstract, paper.manuscriptRevision].every((value) => typeof value === "string" && value.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(paper.literatureCutoff) || !Array.isArray(paper.keywords) || !paper.keywords.length || !paper.keywords.every((value) => typeof value === "string" && value.trim())) return;
  const prefix = `topic-papers/${topicId}/${paper.version}/`;
  if (paper.manifestPath !== prefix + "manifest.json") return;
  const local = import.meta.env.DEV && ["docx", "pipeline"].includes(import.meta.env.MODE);
  const base = import.meta.env.BASE_URL + (local ? "" : "word-reports/");
  const hrefs = {} as Record<PaperAssetKind, string> & { manifest: string; word?: string };
  for (const kind of Object.keys(PAPER_FILES) as PaperAssetKind[]) {
    const asset = paper.assets?.[kind];
    if (!asset || asset.path !== prefix + PAPER_FILES[kind] || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1) return;
    hrefs[kind] = base + asset.path;
  }
  if (paper.assets.word) {
    const asset = paper.assets.word;
    if (asset.path !== prefix + "paper.docx" || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1) return;
    hrefs.word = base + asset.path;
  }
  hrefs.manifest = base + paper.manifestPath;
  return hrefs;
}

export function academicPaperHeadings(doc: Document) {
  return Array.from(doc.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id]"))
    .filter((heading) => heading.id && heading.textContent?.trim())
    .map((heading) => ({ id: heading.id, title: heading.textContent!.trim() }));
}

export function revealPaperHeading(doc: Document, id: string, reducedMotion = false) {
  const heading = doc.getElementById(id);
  if (!heading || !/^H[1234]$/.test(heading.tagName)) return false;
  heading.tabIndex = -1;
  heading.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
  heading.focus({ preventScroll: true });
  return true;
}

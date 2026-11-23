import data from "./kv-synthesis.json";
import { filterPapers, kvResearch, type PaperEntry, type ResearchTopicId } from "./kv-research";

export type SynthesisRow = { slug: string; lever: string; benefit: string; boundary: string };
export type SynthesisGroup = {
  id: ResearchTopicId;
  shortLabel: string;
  hint: string;
  question: string;
  summary: string;
  takeaway: string;
  measurement: string;
  rows: SynthesisRow[];
  engineeringIds: string[];
};

export const kvSynthesis = data as {
  revision: number;
  editedAt: string;
  basis: string;
  groups: SynthesisGroup[];
};

export function synthesisGroup(topic: string | null): SynthesisGroup {
  return kvSynthesis.groups.find((group) => group.id === topic)
    ?? kvSynthesis.groups.find((group) => group.id === "representation")!;
}

export function synthesisPaper(slug: string): PaperEntry | undefined {
  return filterPapers(kvResearch.entries, new URLSearchParams())
    .find((entry) => entry.paper.slug === slug);
}

// Each destination starts with its own valid scope; old list filters must not hide a cited paper.
export function synthesisPaperLink(slug: string) {
  return { search: new URLSearchParams({ view: "papers", part: `kv-paper-${slug}` }).toString() };
}

import { directionDefinitions, type DirectionKey } from "../optimization";
import type { IndexedPR } from "./InferenceMap";

export const communitySources = [
  { key: "github:vllm-project/vllm", label: "vLLM" },
  { key: "github:vllm-project/vllm-ascend", label: "vLLM Ascend" },
] as const;

/** Uses the homepage's already deduplicated, source/date-filtered PR entries. */
export function directionDistribution(entries: readonly IndexedPR[]) {
  const counts = new Map<DirectionKey, number>();
  for (const entry of entries) {
    const direction =
      directionDefinitions.find((d) => d.key === entry.stage)?.key ??
      "unclassified";
    counts.set(direction, (counts.get(direction) ?? 0) + 1);
  }
  return {
    total: entries.length,
    directions: directionDefinitions.map((d) => ({
      ...d,
      count: counts.get(d.key) ?? 0,
      share: entries.length
        ? ((counts.get(d.key) ?? 0) / entries.length) * 100
        : null,
    })),
  };
}
export type Distribution = ReturnType<typeof directionDistribution>;

// Dense attention with equal-length sequences and the same KV shape in each layer.
// Storage only: excludes allocation padding, quantization metadata and distributed replicas.
export function estimateKVBytes(tokens: number, sequences: number, layers = 32, kvHeads = 8, headSize = 128, bytes = 2) {
  return 2 * tokens * sequences * layers * kvHeads * headSize * bytes;
}

export interface KVMemoryModel {
  id: string;
  name: string;
  fullAttentionLayers: number;
  linearAttentionLayers: number;
  kvHeads: number;
  headSize: number;
  source: string;
  configContextLimit: number;
  sourceCheckedOn: string;
}

// Public model configs are pinned to the revisions linked below.
// Hybrid models use only their full-attention layers here; recurrent states are excluded.
export const kvMemoryModels: readonly KVMemoryModel[] = [
  {
    id: "qwen3-14b", name: "Qwen3-14B",
    fullAttentionLayers: 40, linearAttentionLayers: 0, kvHeads: 8, headSize: 128,
    configContextLimit: 40960, sourceCheckedOn: "2026-11-23",
    source: "https://huggingface.co/Qwen/Qwen3-14B/blob/f8c293defed9c6a8026291e8e7d780697e88d7af/config.json",
  },
  {
    id: "qwen3.5-35b-a3b", name: "Qwen3.5-35B-A3B",
    fullAttentionLayers: 10, linearAttentionLayers: 30, kvHeads: 2, headSize: 256,
    configContextLimit: 262144, sourceCheckedOn: "2026-11-23",
    source: "https://huggingface.co/Qwen/Qwen3.5-35B-A3B/blob/41adbc1e50345066ac5153217957e9910204e632/config.json",
  },
];

export function estimateModelKVBytes(tokens: number, sequences: number, model: KVMemoryModel) {
  return estimateKVBytes(tokens, sequences, model.fullAttentionLayers, model.kvHeads, model.headSize, 2);
}

export interface MemoryLoad { modelId: string; tokens: number; sequences: number }
export const initialMemoryLoad: MemoryLoad = { modelId: kvMemoryModels[0].id, tokens: 8192, sequences: 4 };
export const memoryLimits = { tokens: 32768, sequences: 16 } as const;

// A doubling operation is either exact or unavailable; it never silently clamps.
export function doubleMemoryLoad(load: MemoryLoad, factor: "tokens" | "sequences"): MemoryLoad | null {
  return load[factor] * 2 <= memoryLimits[factor] ? { ...load, [factor]: load[factor] * 2 } : null;
}

export const memoryMinimums = { tokens: 1024, sequences: 1 } as const;
export const memoryTokenStep = 1024;
export const memoryReferenceGiB = 64;
export type MemoryAction = "model" | "double-tokens" | "double-requests" | "restore";
export interface MemoryComparison { before: MemoryLoad; after: MemoryLoad; action: MemoryAction }

// Each cell always represents one GiB, including a fractional first/last cell.
export function memoryReference(bytes: number) {
  const gib = bytes / 2 ** 30;
  return {
    gib, percent: gib / memoryReferenceGiB * 100,
    unfilledGiB: Math.max(0, memoryReferenceGiB - gib),
    overflowGiB: Math.max(0, gib - memoryReferenceGiB),
    cells: Array.from({ length: memoryReferenceGiB }, (_, index) => Math.min(1, Math.max(0, gib - index))),
  };
}

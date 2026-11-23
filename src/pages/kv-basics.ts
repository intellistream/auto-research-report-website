// Dense attention with equal-length sequences and the same KV shape in each layer.
// Storage only: excludes allocation padding, quantization metadata and distributed replicas.
export function estimateKVBytes(tokens: number, sequences: number, layers = 32, kvHeads = 8, headSize = 128, bytes = 2) {
  return 2 * tokens * sequences * layers * kvHeads * headSize * bytes;
}

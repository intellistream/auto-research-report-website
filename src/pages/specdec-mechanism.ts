// Teaching models, not measurements or a simulator of a particular engine.
export const candidates = ["a", "b", "c"] as const;

export function roundExample(accepted: number) {
  if (!Number.isInteger(accepted) || accepted < 0 || accepted > candidates.length) throw new RangeError("Invalid accepted prefix");
  const retained = candidates.slice(0, accepted);
  const allAccepted = accepted === candidates.length;
  const pending = allAccepted ? "e" : "d";
  return {
    retained, allAccepted, pending,
    output: [...retained, pending],
    status: candidates.map((_, index) => index < accepted ? "accepted" : index === accepted ? "rejected" : "discarded"),
    targetCallsAR: accepted + 1,
    targetCallsSpec: 1,
  };
}

// Fixed K, constant conditional acceptance, no EOS, serial stage costs.
// One ordinary target decode step is the time unit.
export function estimateRound(k: number, alpha: number, extraVerify: number) {
  if (!Number.isInteger(k) || k < 1 || k > 8 || !Number.isFinite(alpha) || alpha < 0 || alpha > 1 || !Number.isFinite(extraVerify) || extraVerify < 0) throw new RangeError("Invalid teaching parameters");
  let expectedOutput = 1;
  for (let i = 1; i <= k; i++) expectedOutput += alpha ** i;
  const draft = 0.1 * k;
  const verify = 1 + extraVerify * k;
  const other = 0.08;
  const roundTime = draft + verify + other;
  return { expectedOutput, draft, verify, other, roundTime, speedup: expectedOutput / roundTime };
}

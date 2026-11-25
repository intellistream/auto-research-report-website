export type DemoVector = readonly [number, number];
export type DemoMatrix = readonly [DemoVector, DemoVector];
export interface DemoKV { k: DemoVector; v: DemoVector }

// Positive Q/K features with phi(x) = x, solely for this two-dimensional teaching example.
// These are neither model activations nor the Gated DeltaNet update used by Qwen3.5.
export const linearDemoInputs: readonly { q: DemoVector; k: DemoVector; v: DemoVector }[] = [
  { q: [1, 1], k: [1, 1], v: [1, 0] },
  { q: [2, 1], k: [1, 2], v: [0, 2] },
  { q: [1, 2], k: [2, 1], v: [2, 1] },
  { q: [1, 1], k: [1, 1], v: [1, 2] },
  { q: [2, 1], k: [2, 2], v: [0, 1] },
  { q: [1, 2], k: [1, 2], v: [2, 0] },
  { q: [1, 1], k: [2, 1], v: [1, 1] },
  { q: [2, 1], k: [1, 1], v: [2, 2] },
];

const dot = (a: DemoVector, b: DemoVector) => a[0] * b[0] + a[1] * b[1];
const outer = (k: DemoVector, v: DemoVector): DemoMatrix => [
  [k[0] * v[0], k[0] * v[1]], [k[1] * v[0], k[1] * v[1]],
];
const add = (a: DemoMatrix, b: DemoMatrix): DemoMatrix => [
  [a[0][0] + b[0][0], a[0][1] + b[0][1]],
  [a[1][0] + b[1][0], a[1][1] + b[1][1]],
];

function assertDemoStep(step: number) {
  if (!Number.isInteger(step) || step < 1 || step > linearDemoInputs.length) throw new RangeError("Invalid demo step");
}

// The same update rule is used by the prefix demo and the state-recovery counterexample.
export function linearStateForHistory(history: readonly DemoKV[]) {
  const state = history.reduce<DemoMatrix>((s, { k, v }) => add(s, outer(k, v)), [[0, 0], [0, 0]]);
  const normalizer = history.reduce<DemoVector>((z, { k }) => [z[0] + k[0], z[1] + k[1]], [0, 0]);
  return { state, normalizer };
}

export function attentionDemoAt(step: number) {
  assertDemoStep(step);
  const history = linearDemoInputs.slice(0, step);
  const current = history[history.length - 1];
  const { state: previous, normalizer: previousNormalizer } = linearStateForHistory(history.slice(0, -1));
  const update = outer(current.k, current.v);
  const state = add(previous, update);
  const normalizer: DemoVector = [previousNormalizer[0] + current.k[0], previousNormalizer[1] + current.k[1]];
  const numerator: DemoVector = [
    current.q[0] * state[0][0] + current.q[1] * state[1][0],
    current.q[0] * state[0][1] + current.q[1] * state[1][1],
  ];
  const denominator = dot(current.q, normalizer);
  const linearOutput: DemoVector = [numerator[0] / denominator, numerator[1] / denominator];
  const scores = history.map(({ k }) => dot(current.q, k) / Math.sqrt(2));
  const maxScore = Math.max(...scores);
  const exponentials = scores.map(score => Math.exp(score - maxScore));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  const fullWeights = exponentials.map(value => value / total);
  const fullOutput = history.reduce<DemoVector>((result, { v }, index) => [
    result[0] + fullWeights[index] * v[0], result[1] + fullWeights[index] * v[1],
  ], [0, 0]);
  return { current, history, previous, update, state, previousNormalizer, normalizer, numerator, denominator, linearOutput, fullWeights, fullOutput };
}

export type DemoPhase = "ready" | "write" | "read";
export interface DemoCursor { step: number; phase: DemoPhase }

// Replaying keeps the selected position. It changes the teaching snapshot, not a running cache.
export function replayAttentionDemo(cursor: Pick<DemoCursor, "step">): DemoCursor {
  assertDemoStep(cursor.step);
  return { step: cursor.step, phase: "ready" };
}

export function advanceAttentionDemo(cursor: DemoCursor): DemoCursor {
  if (cursor.phase === "ready") return { ...cursor, phase: "write" };
  if (cursor.phase === "write") return { ...cursor, phase: "read" };
  return cursor.step < linearDemoInputs.length ? { step: cursor.step + 1, phase: "ready" } : cursor;
}

export function rewindAttentionDemo(cursor: DemoCursor): DemoCursor {
  if (cursor.phase === "read") return { ...cursor, phase: "write" };
  if (cursor.phase === "write") return { ...cursor, phase: "ready" };
  return cursor.step > 1 ? { step: cursor.step - 1, phase: "read" } : cursor;
}

// Read and write share one computed snapshot; only the ready view uses the previous state.
export function attentionViewAt(cursor: DemoCursor) {
  const demo = attentionDemoAt(cursor.step);
  const ready = cursor.phase === "ready";
  return {
    ...demo,
    savedCount: cursor.step - (ready ? 1 : 0),
    visibleState: ready ? demo.previous : demo.state,
    visibleNormalizer: ready ? demo.previousNormalizer : demo.normalizer,
    output: cursor.phase === "read" ? { full: demo.fullOutput, linear: demo.linearOutput } : null,
  };
}

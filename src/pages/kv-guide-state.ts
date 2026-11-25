import { initialMemoryLoad, kvMemoryModels, memoryLimits, memoryMinimums, memoryTokenStep, type MemoryLoad } from "./kv-basics";
import { firstDecodePosition } from "./kv-generation";
import { linearDemoInputs } from "./kv-linear-demo";

export interface KvGuideState extends MemoryLoad { position: number }
export type KvGuideTargetState = Partial<KvGuideState>;
export const initialKvGuideState: KvGuideState = { ...initialMemoryLoad, position: firstDecodePosition };
export const kvGuideParameters = {
  modelId: "kv-model", tokens: "kv-tokens", sequences: "kv-requests", position: "kv-position",
} as const;
export type KvGuideField = keyof KvGuideState;
export const kvGuideFieldLabels: Record<KvGuideField, string> = {
  modelId: "模型", tokens: "已缓存长度", sequences: "请求数", position: "教学位置",
};

function validValue(field: KvGuideField, raw: string): boolean {
  if (field === "modelId") return kvMemoryModels.some(model => model.id === raw);
  if (!/^\d+$/.test(raw)) return false;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return false;
  if (field === "tokens") return value >= memoryMinimums.tokens && value <= memoryLimits.tokens && value % memoryTokenStep === 0;
  if (field === "sequences") return value >= memoryMinimums.sequences && value <= memoryLimits.sequences;
  return value >= 1 && value <= linearDemoInputs.length;
}

// Missing legacy parameters use defaults; an invalid field does not discard valid siblings.
export function parseKvGuideState(query: URLSearchParams) {
  const state = { ...initialKvGuideState };
  const invalid: KvGuideField[] = [];
  for (const field of Object.keys(kvGuideParameters) as KvGuideField[]) {
    const values = query.getAll(kvGuideParameters[field]);
    if (!values.length) continue;
    if (values.length !== 1 || !validValue(field, values[0])) { invalid.push(field); continue; }
    if (field === "modelId") state.modelId = values[0];
    else state[field] = Number(values[0]);
  }
  return { state, invalid };
}

// Normalization touches only the four KV fields; unrelated extension parameters survive.
export function withKvGuideState(query: URLSearchParams, state: KvGuideState): URLSearchParams {
  const next = new URLSearchParams(query);
  for (const field of Object.keys(kvGuideParameters) as KvGuideField[]) next.set(kvGuideParameters[field], String(state[field]));
  return next;
}

export function kvGuideSearch(query: URLSearchParams, part: string, target: KvGuideTargetState = {}): string {
  const current = parseKvGuideState(query).state;
  const candidate = withKvGuideState(new URLSearchParams(), current);
  for (const field of Object.keys(kvGuideParameters) as KvGuideField[]) {
    if (target[field] !== undefined) candidate.set(kvGuideParameters[field], String(target[field]));
  }
  const next = new URLSearchParams({ view: "guide", part });
  return withKvGuideState(next, parseKvGuideState(candidate).state).toString();
}

// A chapter push retains the live phase; a POP restores only configuration/position,
// never a playback history. Local replacements must not reset the demonstration.
export function shouldResetKvPosition(action: "POP" | "PUSH" | "REPLACE", navigationState: unknown): boolean {
  return action === "POP" || (navigationState as { kvGuideNavigation?: unknown } | null)?.kvGuideNavigation === "position";
}

import { privateLocation, validId } from "./workbench-api";
export const adminLocation = "/research/admin";
export type ResearchContext = { path: string; scrollY: number };
export function researchPath(search = "") {
  const params = new URLSearchParams(search);
  const studies = params.getAll("study"), jobs = params.getAll("job");
  if (studies.length > 1 || jobs.length > 1 || studies.some((v) => !validId(v)) || jobs.some((v) => !validId(v)) || (jobs.length && !studies.length)) return "/research";
  return privateLocation(studies[0], jobs[0]);
}
export function safeResearchContext(value: unknown): ResearchContext | undefined {
  if (!value || typeof value !== "object") return;
  const { path, scrollY } = value as Partial<ResearchContext>;
  if (typeof path !== "string" || !/^\/research(?:\?|$)/.test(path) || path.includes("#")) return;
  const clean = researchPath(path.includes("?") ? path.slice(path.indexOf("?")) : "");
  if (clean !== path) return;
  return { path: clean, scrollY: typeof scrollY === "number" && Number.isFinite(scrollY) ? Math.max(0, Math.min(scrollY, 10000000)) : 0 };
}

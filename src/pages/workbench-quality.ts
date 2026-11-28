import type { Job } from "./workbench-api";

type Quality = Pick<Job, "reviewOutcome" | "synthesisOutcome" | "reviewStatus" | "synthesisStatus">;
const reviewLabels: Record<string, string> = { approved: "审查通过", needs_revision: "需修订", needs_review: "审查结果未明确", unavailable: "审查不可用", insufficient_evidence: "证据不足" };
export const reviewLabel = (status?: string) => reviewLabels[status ?? ""] ?? (status ? "未知状态" : "未提供");
const synthesisLabels: Record<string, string> = { generated: "已生成综合分析", unavailable: "综合未生成", insufficient_evidence: "证据不足" };
export const synthesisLabel = (status?: string) => synthesisLabels[status ?? ""] ?? (status ? "未知状态" : "未提供");
export function qualityLabels(job: Quality) {
  // Keep the producer's needs_revision distinct from legacy needs_review normalization.
  const review = job.reviewOutcome ?? job.reviewStatus, synthesis = job.synthesisOutcome ?? job.synthesisStatus;
  if (!review && !synthesis) return ["质量状态未提供"];
  const labels: string[] = [];
  if (review !== "approved") labels.push(!review ? "审查状态未提供" : reviewLabel(review) === "未知状态" ? "审查状态未知" : reviewLabel(review));
  if (synthesis !== "generated") labels.push(!synthesis ? "综合状态未提供" : synthesisLabel(synthesis) === "未知状态" ? "综合状态未知" : synthesisLabel(synthesis));
  return [...new Set(labels)];
}
export type ReportInfo = { range?: { start: string; end: string }; reviewOutcome?: string; synthesisOutcome?: string;
  issues: { claim?: string; reason: string; sourceIds: string[] }[] };
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value);
export function parseReportInfo(value: unknown): ReportInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid report metadata");
  const report = object(value), coverage = object(report.coverage), review = object(report.review);
  const checks = Array.isArray(review.checks) ? review.checks : [];
  // Prefer final issues; earlier resolved review passes are not current problems.
  const issues = Array.isArray(review.issues) ? review.issues : object(checks.at(-1)).issues;
  return {
    range: date(coverage.startDate) && date(coverage.endDate) && coverage.startDate <= coverage.endDate ? { start: coverage.startDate, end: coverage.endDate } : undefined,
    reviewOutcome: typeof review.status === "string" ? review.status : undefined,
    synthesisOutcome: typeof report.synthesisStatus === "string" ? report.synthesisStatus : undefined,
    issues: Array.isArray(issues) ? issues.flatMap((value: unknown) => {
      const issue = object(value);
      if (typeof issue.reason !== "string" || !issue.reason.trim()) return [];
      return [{ reason: issue.reason, claim: typeof issue.claim === "string" ? issue.claim : undefined,
        sourceIds: Array.isArray(issue.sourceIds) ? issue.sourceIds.filter((id: unknown): id is string => typeof id === "string") : [] }];
    }) : [],
  };
}

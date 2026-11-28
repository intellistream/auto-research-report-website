import type { AuditItem, QueueItem } from "./workbench-api";
export const beijingDay = (time = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
export const shortId = (id: string) => id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
export const identityText = (id?: string, login?: string) => login && id ? `@${login}` : id ? `账号 ${id}` : "未记录";
export function durationText(seconds?: number | null) {
  if (seconds === null) return "—";
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "未提供";
  const whole = Math.floor(seconds), hours = Math.floor(whole / 3600), minutes = Math.floor(whole % 3600 / 60);
  return hours ? `${hours}小时${minutes}分` : minutes ? `${minutes}分${whole % 60}秒` : `${whole}秒`;
}
export function queueOrder(items: QueueItem[]) {
  return [...items].sort((a, b) => {
    const at = Date.parse(a.createdAt ?? ""), bt = Date.parse(b.createdAt ?? "");
    return (Number.isFinite(at) ? at : Infinity) - (Number.isFinite(bt) ? bt : Infinity) || a.id.localeCompare(b.id);
  });
}
const actions: Record<string, string> = {
  "administrator.bootstrap": "初始化管理员", login: "账号登录", logout: "退出当前设备", logout_all: "退出所有设备", "oauth.callback": "处理登录结果",
  "member.admit": "开通成员", "member.update": "更新成员设置", "study.create": "新建研究", "study.update": "更新研究", "study.delete": "删除研究",
  "job.submit": "提交生成", "job.complete": "报告生成", "job.fail": "报告生成", "job.delete": "删除生成记录", "report.read": "读取报告",
};
export const systemEvent = (event: AuditItem) => event.actorType === "system" || (event.actorType === undefined && ["job.complete", "job.fail"].includes(event.action));
export function auditActor(event: AuditItem) {
  return systemEvent(event) ? "系统" : event.actorType === "unknown" ? "未记录" : identityText(event.actorUserId ?? event.userId, event.actorGithubLogin);
}
export const auditAction = (event: AuditItem) => actions[event.action] ?? "未识别的操作";
export function auditResult(event: AuditItem) {
  // These events describe the worker outcome, not whether its audit INSERT succeeded.
  if (event.action === "job.fail") return "失败";
  if (event.action === "job.complete") return "已生成";
  if (["ok", "accepted", "success", "saved"].includes(event.result ?? "")) {
    if (["member.update", "member.admit", "study.create", "study.update"].includes(event.action)) return "已保存";
    if (event.action === "job.submit") return "已受理";
    if (["job.delete", "study.delete"].includes(event.action)) return "已删除";
    if (event.action === "report.read") return "已读取";
    if (event.action === "login") return "已登录";
    if (["logout", "logout_all"].includes(event.action)) return "已退出";
    return "已完成";
  }
  const rejected: Record<string, string> = { member_not_allowed: "未开通", member_disabled: "账号已停用", oauth_failed: "登录未完成", github_unavailable: "登录服务不可用", failed: "失败", denied: "已拒绝" };
  return rejected[event.result ?? ""] ?? (event.result ? "结果未识别" : "未提供");
}
export function auditTarget(event: AuditItem) {
  const targetId = event.targetUserId ?? (systemEvent(event) ? event.userId : undefined);
  return { member: targetId ? identityText(targetId, event.targetGithubLogin) : undefined, studyId: event.studyId, jobId: event.jobId };
}

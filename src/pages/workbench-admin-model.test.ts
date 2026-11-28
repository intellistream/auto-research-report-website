import { describe, expect, it } from "vitest";
import { auditAction, auditActor, auditResult, auditTarget, beijingDay, durationText, identityText, queueOrder } from "./workbench-admin-model";
describe("management semantics", () => {
  it("uses the Beijing acceptance day across the UTC midnight boundary", () => {
    expect(beijingDay(Date.parse("2026-11-28T15:59:59Z"))).toBe("2026-11-28");
    expect(beijingDay(Date.parse("2026-11-28T16:00:00Z"))).toBe("2026-11-29");
  });
  it("does not invent zero durations or usernames, and sorts queue submissions oldest first", () => {
    expect(durationText(undefined)).toBe("未提供"); expect(durationText(null)).toBe("—"); expect(durationText(0)).toBe("0秒"); expect(durationText(3601)).toBe("1小时0分");
    expect(identityText("stable-id")).toBe("账号 stable-id"); expect(identityText(undefined, "unbound-name")).toBe("未记录");
    const base = { studyId: "s", ownerUserId: "u", status: "queued" };
    expect(queueOrder([{ ...base, id: "late", createdAt: "2026-11-29T00:00:00Z" }, { ...base, id: "unknown" }, { ...base, id: "early", createdAt: "2026-11-28T00:00:00Z" }]).map((item) => item.id)).toEqual(["early", "late", "unknown"]);
  });
  it("treats a recorded job failure as worker failure even if audit logging succeeded", () => {
    const event = { action: "job.fail", userId: "owner", result: "ok", jobId: "job", studyId: "study" };
    expect(auditActor(event)).toBe("系统"); expect(auditResult(event)).toBe("失败"); expect(auditAction(event)).toBe("报告生成");
    expect(auditTarget(event)).toEqual({ member: "账号 owner", studyId: "study", jobId: "job" });
    expect(auditResult({ ...event, action: "job.complete" })).toBe("已生成");
  });
  it("keeps historical member updates generic and separates a recorded actor from its target", () => {
    const event = { action: "member.update", userId: "legacy-id", actorUserId: "admin", actorGithubLogin: "administrator", targetUserId: "member", targetGithubLogin: "target", result: "ok" };
    expect(auditActor(event)).toBe("@administrator"); expect(auditAction(event)).toBe("更新成员设置"); expect(auditTarget(event).member).toBe("@target");
    expect(auditTarget({ action: "member.update", userId: "admin" }).member).toBeUndefined();
    expect(auditActor({ action: "oauth.callback", result: "oauth_failed" })).toBe("未记录");
    expect(auditResult({ action: "login", result: "member_disabled" })).toBe("账号已停用");
    expect(auditResult({ action: "unknown", result: "traceback/private" })).toBe("结果未识别");
  });
});

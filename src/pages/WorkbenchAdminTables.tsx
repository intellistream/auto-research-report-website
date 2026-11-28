import type { ReactNode } from "react";
import type { AdminUsage, AuditItem, QueueItem } from "./workbench-api";
import { auditAction, auditActor, auditResult, auditTarget, durationText, identityText, queueOrder, shortId } from "./workbench-admin-model";
import { dateText, listDateText, workbenchStageLabels } from "./workbench-ui";
export function AdminTable({ name, headers, children, className = "" }: { name: string; headers: string[]; children: ReactNode; className?: string }) {
  return <div className="wb-admin-scroll" role="region" aria-label={`${name}，可横向滚动`} tabIndex={0}><table className={`wb-admin-table ${className}`} aria-label={name}>
    <thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{children}</tbody>
  </table></div>;
}
function ExactTime({ value }: { value?: string }) { return <><dt>精确时间</dt><dd>{dateText(value)}</dd></>; }
export function QueueTable({ items }: { items: QueueItem[] }) {
  return <AdminTable name="生成队列" className="wb-queue-table" headers={["用户名", "生成编号", "状态", "当前阶段", "提交时间", "等待时长", "运行时长"]}>
    {queueOrder(items).map((item) => <tr key={item.id}><th scope="row">{identityText(item.ownerUserId, item.githubLogin)}</th><td>
      <details className="wb-admin-details"><summary aria-label={`生成 ${item.id} 的完整元信息`}>{shortId(item.id)}</summary><dl><dt>生成编号</dt><dd>{item.id}</dd><dt>研究编号</dt><dd>{item.studyId}</dd><ExactTime value={item.createdAt} /><dt>更新时间</dt><dd>{dateText(item.updatedAt)}</dd></dl></details>
    </td><td>{item.status === "queued" ? "排队中" : "运行中"}</td><td>{item.status === "queued" ? "等待开始" : item.stage ? workbenchStageLabels[item.stage] ?? "处理中" : "阶段未提供"}</td>
      <td className="wb-admin-time">{listDateText(item.createdAt)}</td><td className="wb-admin-number">{durationText(item.waitSeconds)}</td><td className="wb-admin-number">{item.status === "queued" ? "—" : durationText(item.runningSeconds)}</td></tr>)}
  </AdminTable>;
}
export function UsageTable({ usage }: { usage: AdminUsage }) {
  return <AdminTable name={`用量统计 ${usage.day}`} className="wb-usage-table" headers={["用户名", "受理次数", "已计次数", "退还次数", "已生成", "已失败"]}>
    {usage.items.map((item) => <tr key={item.userId}><th scope="row">{identityText(item.userId, item.githubLogin)}</th>{(["accepted", "charged", "refunded", "succeeded", "failed"] as const).map((key) => <td className="wb-admin-number" key={key}>{item.usage[key] ?? "未提供"}</td>)}</tr>)}
  </AdminTable>;
}
export function AuditTable({ items }: { items: AuditItem[] }) {
  return <AdminTable name="操作记录" className="wb-audit-table" headers={["时间", "执行方", "操作", "对象", "结果"]}>
    {items.map((item, index) => { const target = auditTarget(item); return <tr key={item.id ?? `${item.createdAt}-${index}`}>
      <td className="wb-admin-time">{listDateText(item.createdAt)}</td><td>{auditActor(item)}</td><td>{auditAction(item)}</td><td>
        {target.member && (target.jobId || target.studyId) && <span className="wb-admin-target">{target.member}</span>}
        {(target.jobId || target.studyId || target.member) ? <details className="wb-admin-details"><summary aria-label={`操作记录 ${item.id ?? index + 1} 的对象元信息`}>{target.jobId ? `生成 ${shortId(target.jobId)}` : target.studyId ? `研究 ${shortId(target.studyId)}` : target.member}</summary>
          <dl>{item.targetUserId && <><dt>成员编号</dt><dd>{item.targetUserId}</dd></>}{target.jobId && <><dt>生成编号</dt><dd>{target.jobId}</dd></>}{target.studyId && <><dt>研究编号</dt><dd>{target.studyId}</dd></>}<ExactTime value={item.createdAt} /><dt>结果</dt><dd>{auditResult(item)}</dd></dl>
        </details> : !target.member ? "—" : null}
      </td><td>{auditResult(item)}</td></tr>; })}
  </AdminTable>;
}

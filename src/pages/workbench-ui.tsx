import { useEffect, useRef, type ReactNode } from "react";
import type { Job } from "./workbench-api";
export const generationWait = "报告生成可能需要十几分钟，可关闭页面稍后在本研究查看。";
export const workbenchStageLabels: Record<string, string> = { searching: "检索资料", supplementing_1: "补充检索", supplementing_2: "再次补充检索", synthesizing: "综合分析", reviewing: "审查报告", revising: "修订报告", rendering: "生成文件" };
export const pending = (job: Job) => job.status === "queued" || job.status === "running";
export const dateText = (value?: string) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "尚未提供";
export const listDateText = (value?: string, dateOnly = false) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit", hour12: false }) }) : "尚未提供";
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`wb-notice${error ? " wb-error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}
export function ConfirmDialog({ title, children, busy, onConfirm, onCancel }: {
  title: string; children: ReactNode; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="wb-backdrop"><div className="wb-dialog" role="dialog" aria-modal="true" aria-label={title} ref={dialog}
    onKeyDown={(event) => {
      if (event.key === "Escape" && !busy) onCancel();
      if (event.key !== "Tab") return;
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}><h2>{title}</h2><div>{children}</div><div className="wb-actions">
      <button onClick={onCancel} disabled={busy}>取消</button><button className="wb-danger" onClick={onConfirm} disabled={busy}>{busy ? "正在保存…" : "确认"}</button>
    </div></div></div>;
}

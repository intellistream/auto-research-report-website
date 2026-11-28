import { useEffect, useRef, type ReactNode } from "react";
import type { Job } from "./workbench-api";
export const generationWait = "报告生成时间较长，可能需要十几分钟。你可以关闭页面，稍后在本研究中查看进度和报告。";
export const pending = (job: Job) => job.status === "queued" || job.status === "running";
export const dateText = (value?: string) => value && !Number.isNaN(Date.parse(value))
  ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "尚未提供";
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

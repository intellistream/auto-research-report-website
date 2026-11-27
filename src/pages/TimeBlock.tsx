import type { ReactNode } from "react";

export default function TimeBlock({ start, end, label, waiting = false, children }: {
  start: number; end: number; label: string; waiting?: boolean; children?: ReactNode;
}) {
  return (
    <span className={`acl-time-block${waiting ? " acl-time-wait" : ""}`}
      style={{ gridColumn: `${start + 1} / ${end + 1}` }} aria-label={label} title={label}>
      {children ?? label}
    </span>
  );
}

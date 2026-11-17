import type { Counts } from "./report-preview-data";

export default function ReportCounts({ counts }: { counts: Counts }) {
  return (
    <p className="docx-counts">
      <span>vLLM <strong>{counts.upstream}</strong></span>
      <span>vLLM Ascend <strong>{counts.ascend}</strong></span>
      <span>论文 <strong>{counts.papers}</strong></span>
    </p>
  );
}

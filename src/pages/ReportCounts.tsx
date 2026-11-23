import type { Counts } from "./report-preview-data";

export default function ReportCounts({ counts }: { counts: Counts }) {
  return (
    <p className="docx-counts report-counts-pills">
      <span className="count-pill vllm">
        <i aria-hidden="true" />
        vLLM <strong>{counts.upstream}</strong>
      </span>
      <span className="count-pill ascend">
        <i aria-hidden="true" />
        vLLM Ascend <strong>{counts.ascend}</strong>
      </span>
      <span className="count-pill paper">
        <i aria-hidden="true" />
        论文 <strong>{counts.papers}</strong>
      </span>
    </p>
  );
}

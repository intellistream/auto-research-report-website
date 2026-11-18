"""Maintain the SpecDec candidate intake from the same reviewed daily flow as the website.

Only append secondary-source leads; do not change frozen academic conclusions.
"""
from __future__ import annotations

from collections import Counter
from datetime import date
import argparse
import json
from pathlib import Path
import re

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / "public" / "word-reports"
# Cross-layer cases read from their actual daily report chapter. Avoid broad
# keyword matching on unrelated Decode/Prefill PRs or model names.
CROSS_LAYER = {
    "github:vllm-project/vllm#54820": "草稿权重与启动显存",
    "github:vllm-project/vllm-ascend#15851": "Target/Drafter 缓存分组与状态",
    "github:vllm-project/vllm-ascend#21191": "草稿图的设备状态与重复 H2D",
    "github:vllm-project/vllm#67291": "P/D 预填充的草稿工作区",
    "github:vllm-project/vllm-ascend#20242": "DSpark 图填充与 MoE Expert 资源",
    "github:vllm-project/vllm#65132": "自适应验证的图内元数据",
    "github:vllm-project/vllm#67296": "Spec Verify 的 KV/Workspace 容量",
    "github:vllm-project/vllm#67485": "Spec 预热与缓存生命周期",
}
INITIAL_LABELS = {
    "56451": "methods", "61869": "methods", "21439": "methods",
    "62964": "runtime", "66063": "methods", "21542": "runtime",
    "64777": "verification", "66051": "methods",
    "65985": "runtime", "67725": "runtime", "66323": "methods",
    "67733": "runtime",
}
ID = re.compile(r"^github:vllm-project/(vllm|vllm-ascend)#([1-9][0-9]*)$")


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def entry_block(report, work_id):
    for section in report["sections"]:
        for item in section.get("blocks", []):
            if item.get("kind") == "entry" and item.get("workId") == work_id:
                return item
    raise ValueError(f"Daily report missing candidate {work_id}")


def synopsis(block):
    paragraphs = block.get("paragraphs", [])
    for paragraph in paragraphs[1:]:
        content = "".join(part.get("text", "") for part in paragraph if isinstance(part, dict))
        if content.startswith("优化方法："):
            return content.removeprefix("优化方法：")[:220]
    return "日报待核验线索；需审查原始 PR 和适用条件。"


def classify(record, block):
    number = ID.fullmatch(record["workId"]).group(2)
    if number in INITIAL_LABELS:
        return INITIAL_LABELS[number]
    if record["stage"] != "speculative":
        return "runtime"
    title = block["title"].lower()
    if any(x in title for x in ["接受率", "验证", "拒绝", "采样修复", "acceptance", "verification"]):
        return "verification"
    if any(x in title for x in ["草稿", "模型", "eagle", "mtp", "dspark", "dflash"]):
        return "methods"
    return "runtime"


def sync(index, catalog, flow, archive):
    """Returns a new index; requires current, version-matched immutable reports."""
    topic = next((x for x in index["topics"] if x["id"] == "speculative-decoding"), None)
    if not topic or not topic.get("survey"):
        raise ValueError("SpecDec source index and reviewed guide required")
    baseline = set(topic["survey"].get("candidateBaseline", []))
    baseline_dates = [row["day"] for row in topic["entries"] if row["workId"] in baseline]
    if not baseline_dates:
        raise ValueError("Original reviewed candidate baseline is missing")
    frozen_cutoff = max(baseline_dates)
    last_indexed = topic["coverage"]["lastDay"]
    known = {row["workId"] for row in topic["entries"]}
    current = [item for item in flow["entries"]
               if item["day"] in catalog["days"]
               and item["version"] == catalog["days"][item["day"]]["current"]]
    report_cache = {}
    added = []
    for record in current:
        work_id = record["workId"]
        if record["day"] <= frozen_cutoff or record["day"] < last_indexed or work_id in known:
            continue
        if record["stage"] != "speculative" and work_id not in CROSS_LAYER:
            continue
        identity = ID.fullmatch(work_id)
        if not identity:
            raise ValueError(f"Unexpected source identifier {work_id}")
        day, version = record["day"], record["version"]
        key = (day, version)
        if key not in report_cache:
            path = archive / day / version / "report.json"
            report_cache[key] = load(path)
            if report_cache[key]["sha256"] != version or report_cache[key]["day"] != day:
                raise ValueError(f"Daily report source mismatch {path}")
        block = entry_block(report_cache[key], work_id)
        if block["title"] != record["title"] or block["number"] != record["number"]:
            raise ValueError(f"Daily report index mismatch {work_id}")
        stage = record["stage"]
        added.append({
            "day": day, "label": classify(record, block),
            "method": "rule" if stage == "speculative" else "manual",
            "number": record["number"],
            "reason": ("原日报推测解码章节候选（待一手核验）" if stage == "speculative"
                       else f"跨层候选：{CROSS_LAYER[work_id]}（待一手核验）"),
            "repository": identity.group(1), "stage": stage,
            "summary": synopsis(block), "title": block["title"],
            "url": f"https://github.com/vllm-project/{identity.group(1)}/pull/{identity.group(2)}",
            "version": version, "workId": work_id,
        })
        known.add(work_id)

    if not added and topic["coverage"]["lastDay"] == max(catalog["days"]):
        return index, []
    topic["entries"] = sorted([*topic["entries"], *added], key=lambda row: row["day"], reverse=True)
    counts = topic["counts"]
    counts["total"] = len(topic["entries"])
    counts["byRepository"] = dict(Counter(row["repository"] for row in topic["entries"]))
    counts["byLabel"] = dict(Counter(row["label"] for row in topic["entries"]))
    counts["manualIncluded"] = sum(row["method"] == "manual" for row in topic["entries"])
    end = max(catalog["days"])
    topic["coverage"]["lastDay"] = end
    topic["coverage"]["days"] = (date.fromisoformat(end) - date.fromisoformat(topic["coverage"]["firstDay"])).days + 1
    topic["coverage"]["prs"] = len(current)
    # Do not edit topic.report, frozen ledger or survey.candidateBaseline here.
    return index, added


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=ROOT)
    parser.add_argument("--check", action="store_true", help="Fail if candidates are not in sync with published reports")
    args = parser.parse_args()
    archive = args.archive
    index_path = archive / "topics.json"
    before = load(index_path)
    updated, added = sync(before, load(archive / "catalog.json"), load(archive / "flow-index.json"), archive)
    if args.check:
        if added:
            print(f"SpecDec topic not synchronized: {len(added)} new PR(s)")
            return 1
        print("SpecDec candidates synchronized")
    else:
        index_path.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"SpecDec indexed {len(added)} new PR(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

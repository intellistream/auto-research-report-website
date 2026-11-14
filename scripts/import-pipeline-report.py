"""Project a Daily Report v2.0 bundle into the website archive."""

import argparse
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

from report_archive import CHAPTERS, chapter_summary, flow_index, reusable_intro, write_bytes, write_json

PUBLIC = Path(__file__).resolve().parents[1] / "public"
STAGES = CHAPTERS[2:-1]
SOURCES = {
    "upstream": ("V", r"github:vllm-project/vllm#[1-9][0-9]*"),
    "ascend": ("A", r"github:vllm-project/vllm-ascend#[1-9][0-9]*"),
    "paper": ("P", r"paper:(?:[0-9]{4}\.[0-9]{4,5}|[a-zA-Z.-]+/[0-9]{7})(?:v[1-9][0-9]*)?"),
}
STATUSES = {"completed_program_checks", "complete_with_pending", "partial_draft", "no_cards"}
SCOPE = "工程 PR 从 vLLM 与 vLLM Ascend 两仓北京时间当日合入的条目中筛选。"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def artifact(directory, filename):
    path = directory / filename
    require(path.is_file(), f"缺少产物：{filename}")
    require(not path.is_symlink() and path.resolve().parent == directory.resolve(),
            f"产物必须位于运行目录内：{filename}")
    return path.read_bytes()


def paragraph(text):
    return [{"text": text}]


def text(value, field):
    require(isinstance(value, str) and value.strip(), f"{field} 缺少正文或标题")
    return value


def source_parts(links, work_id):
    require(isinstance(links, list) and links, "条目缺少来源")
    parts = paragraph("来源：")
    primary_pr = None if work_id.startswith("paper:") else "/" + work_id.removeprefix(
        "github:"
    ).replace("#", "/pull/")
    found_primary = primary_pr is None
    for link in links:
        label, url = text(link["label"], "来源"), link["url"]
        require(isinstance(url, str) and not re.search(r"[\\\s\x00-\x1f\x7f]", url), "不安全的来源链接")
        parsed = urlsplit(url)
        require(parsed.scheme in ("https", "http") and parsed.hostname
                and parsed.username is None and parsed.password is None,
                "不安全的来源链接")
        if parsed.hostname == "github.com" and parsed.path.rstrip("/").lower() == primary_pr:
            found_primary = True
        if len(parts) > 1:
            parts.append({"text": "；"})
        parts.append({"text": label, "url": url})
    require(found_primary, f"缺少对应 PR 的原文链接：{work_id}")
    return parts


def project_entry(entry, chapter, counts, numbers, diagram, work_ids):
    number, card = entry["number"], entry["card"]
    content = card["content"]
    source = card["source_type"]
    prefix, pattern = SOURCES[source]
    require(content["chapter"] == chapter and (source == "paper") == (chapter == "papers"),
            "条目与所属章节不一致")
    work_id = card["work_id"]
    require(re.fullmatch(pattern, work_id), f"{number} 来源身份无效")
    require(work_id not in work_ids, f"重复 PR 或论文：{work_id}")
    work_ids.add(work_id)
    count_key = "papers" if source == "paper" else source
    counts[count_key] += 1
    require(number == f"{prefix}{counts[count_key]}" and card["card_id"] not in numbers,
            "条目编号无效或身份重复")
    numbers[card["card_id"]] = number
    expected_nodes = [] if source == "paper" else [chapter]
    require(content["diagram_nodes"] == expected_nodes, f"{number} 图中位置与正文不一致")
    if expected_nodes:
        diagram[chapter].append(number)

    title = text(content["title_zh"], number)
    brief = content.get("presentation") == "brief"
    if content.get("body") is not None:
        paragraphs = [paragraph(text(content["body"], number))]
    else:
        paragraphs = [paragraph(label + text(content[key], number)) for key, label in (
            ("problem", "问题："), ("optimization", "优化方法："),
            ("effects_and_limits", "效果与边界："),
        )]
    paragraphs.append(source_parts(content["source_links"], work_id))
    needs_review = card.get("needs_review", False)
    require(type(needs_review) is bool, f"{number} 核查标记无效")
    return {
        "kind": "entry", "number": number, "title": title,
        "workId": work_id, "paragraphs": paragraphs,
        "needsReview": needs_review,
        "provisionalLocation": content.get("location_basis") in {"title_hint", "default_scheduling"},
        "titlePending": content.get("title_status") == "failed",
        "brief": brief,
    }


def load_run(directory, *, expected_day=None):
    manifest_bytes = artifact(directory, "manifest.json")
    manifest = json.loads(manifest_bytes)
    require(manifest["schema_version"] == "daily-report-run/0.1", "不支持的运行清单版本")
    status = manifest["status"]
    require(status in STATUSES, "运行尚未交付可预览日报")
    require(manifest["synthetic"] is False, "合成样例不进入日报预览")
    raw = artifact(directory, "report.json")
    figure = artifact(directory, "flow.png")
    digests = {
        filename: hashlib.sha256(data).hexdigest()
        for filename, data in (
            ("manifest.json", manifest_bytes), ("report.json", raw), ("flow.png", figure)
        )
    }
    for filename in ("report.json", "flow.png"):
        require(digests[filename] == manifest["artifacts"].get(filename),
                f"产物哈希与 manifest 不一致：{filename}")
    require(figure.startswith(b"\x89PNG\r\n\x1a\n"), "流程图不是 PNG")
    report = json.loads(raw)
    require(report["schema_version"] == "daily-report/0.4", "不支持的日报契约版本")
    require(report["synthetic"] is False, "合成样例不进入日报预览")
    day = report["day"]
    require(date.fromisoformat(day).isoformat() == day, "日报日期须为 YYYY-MM-DD")
    require(expected_day is None or day == expected_day,
            f"日报日期 {day} 与请求的日期 {expected_day} 不一致")
    require(tuple(chapter["key"] for chapter in report["chapters"]) == CHAPTERS[2:],
            "日报章节顺序与模板不一致")
    require(isinstance(report["summary"], str), "日报归纳格式无效")
    bundle_digest = hashlib.sha256(
        json.dumps(digests, sort_keys=True, separators=(",", ":")).encode("ascii")
    ).hexdigest()
    # Include the view format so an earlier preview keeps its original version and URL.
    digest = hashlib.sha256(
        b"pipeline-report-view/2\x00"
        + raw
        + bytes.fromhex(digests["flow.png"])
        + status.encode("ascii")
    ).hexdigest()
    counts = {"upstream": 0, "ascend": 0, "papers": 0}
    summary = report["summary"] or "本期没有本日归纳。"
    sections = [
        {"key": "summary", "title": "一 本日归纳", "blocks": [
            {"kind": "paragraph", "parts": paragraph(summary)},
        ]},
        {"key": "flow", "title": "二 推理流程与优化位置", "figure": f"{day}/{digest}/flow.png", "blocks": []},
    ]
    for section, field in zip(sections, ("overview_chapter_summary", "flow_chapter_summary")):
        value = chapter_summary(report, field)
        if value is not None:
            section["chapter_summary"] = value
    numbers = {}
    work_ids = set()
    diagram = {stage: [] for stage in STAGES}
    for chapter in report["chapters"]:
        key = chapter["key"]
        blocks = []
        require(isinstance(chapter["intro"], str), "章节导语格式无效")
        if chapter["intro"]:
            blocks.append({"kind": "paragraph", "parts": paragraph(chapter["intro"])})
        if not chapter["groups"]:
            blocks.append({"kind": "paragraph", "parts": paragraph("本期未收录该章条目。")})
        for group in chapter["groups"]:
            require(group["entries"], "章节包含空分组")
            if key != "papers":
                blocks.append({"kind": "group", "title": text(group["title"], "分组")})
            blocks.extend(
                project_entry(entry, key, counts, numbers, diagram, work_ids)
                for entry in group["entries"]
            )
        section = {"key": key, "title": text(chapter["title"], "章节"), "blocks": blocks}
        legacy_value = chapter_summary(chapter)
        intro = reusable_intro(chapter["intro"]) if chapter["groups"] else None
        value = intro if intro is not None else legacy_value
        if value is not None:
            section["chapter_summary"] = value
        if intro is not None:
            blocks[0]["chapterSummary"] = True
        sections.append(section)
    require(report["numbers"] == numbers and report["diagram_numbers"] == diagram,
            "编号索引或流程图索引与正文不一致")
    notice = report["coverage_notice"]
    require(notice is None or isinstance(notice, str), "覆盖说明格式无效")
    projected = {
        "schemaVersion": 1, "day": day, "sha256": digest,
        "title": "vLLM 与 vLLM Ascend 性能优化日报",
        "intro": [paragraph(SCOPE), *([paragraph(notice)] if notice else [])],
        "sections": sections, "counts": counts, "warnings": [],
        "pipelineStatus": status,
    }
    metadata = {
        "day": day, "version_sha256": digest, "bundle_sha256": bundle_digest,
        "status": status, "counts": counts, "artifacts": digests,
    }
    return projected, figure, metadata


def require_review(metadata, reviewed_sha256):
    require(
        reviewed_sha256 == metadata["bundle_sha256"],
        "复核指纹与本次产物不一致，请对照 --inspect 的 bundle_sha256",
    )


def save_report(root, report, figure, *, promote=False, reviewed=False):
    root = root.resolve()
    index_path = root / "catalog.json"
    catalog = (json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists()
               else {"schemaVersion": 1, "days": {}})
    require(catalog["schemaVersion"] == 1, "网站目录版本不受支持")

    day, digest = report["day"], report["sha256"]
    prefix = f"{day}/{digest}"
    snapshot = root / prefix
    require(snapshot.resolve() == snapshot, "日报版本目录不能是符号链接")
    snapshot_path, figure_path = snapshot / "report.json", snapshot / "flow.png"
    projected = {**report, "publicationStatus": "reviewed" if reviewed else "preview"}
    record = catalog["days"].setdefault(day, {"current": digest, "versions": []})
    versions = record["versions"]
    version = {"sha256": digest, "path": f"{prefix}/report.json", "counts": report["counts"]}
    existing = next((item for item in versions if item["sha256"] == digest), None)
    if existing is None:
        versions.append(version)
    else:
        require(existing == version, "同一日报版本的目录记录不一致")
    require(
        not snapshot_path.exists() or json.loads(snapshot_path.read_bytes()) == projected,
        "同一日报版本的正文已存在且不同",
    )
    require(not figure_path.exists() or figure_path.read_bytes() == figure,
            "同一日报版本的流程图已存在且不同")
    if promote:
        record["current"] = digest

    # Validate every selected report before any archive files are changed.
    flow = flow_index(root, catalog, incoming=projected)
    snapshot.mkdir(parents=True, exist_ok=True)
    write_bytes(figure_path, figure)
    write_json(snapshot_path, projected)
    write_json(root / "flow-index.json", flow, compact=True)
    write_json(index_path, catalog)


def main(argv=None):
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("run_dir", type=Path, help="Directory containing manifest.json, report.json and flow.png")
    mode = cli.add_mutually_exclusive_group(required=True)
    mode.add_argument("--inspect", action="store_true", help="Print artifact and review hashes without writing")
    mode.add_argument("--output", type=Path, help="Write the preview outside the site's public directory")
    mode.add_argument("--publish", action="store_true", help="Stage an approved snapshot in public/word-reports")
    cli.add_argument("--reviewed-sha256", help="Reviewed bundle_sha256 from --inspect, required for --publish")
    cli.add_argument("--expected-day", help="Require the report date to match YYYY-MM-DD")
    cli.add_argument("--promote", action="store_true", help="Make this revision current if its date already exists")
    args = cli.parse_args(argv)
    if not args.publish and args.reviewed_sha256:
        cli.error("--reviewed-sha256 requires --publish")
    if args.inspect and args.promote:
        cli.error("--promote requires --output or --publish")
    try:
        report, figure, metadata = load_run(args.run_dir, expected_day=args.expected_day)
        if not args.inspect:
            if args.publish:
                require_review(metadata, args.reviewed_sha256)
                output = PUBLIC / "word-reports"
            else:
                output = args.output.resolve()
                require(not output.is_relative_to(PUBLIC.resolve()),
                        "公开目录须通过 --publish 写入")
            save_report(output, report, figure, promote=args.promote, reviewed=args.publish)
        print(json.dumps(metadata, ensure_ascii=False))
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as err:
        print(f"无法导入日报：{err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

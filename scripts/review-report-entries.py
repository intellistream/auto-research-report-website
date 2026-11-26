"""Publish source-checked entry revisions without rewriting archived reports."""

import argparse
import copy
import hashlib
import json
import re
import runpy
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

from report_archive import CHAPTERS


IMPORTER = runpy.run_path(str(Path(__file__).with_name("import-pipeline-report.py")))


def require(value, message):
    if not value:
        raise ValueError(message)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def entries(report):
    return [(section, block) for section in report["sections"]
            for block in section["blocks"] if block["kind"] == "entry"]


def revision(report, decisions, *, reviewer, reviewed_at, figure, replacement_figure=False, editorial=None):
    require(reviewer.strip(), "Reviewer is required")
    require(datetime.fromisoformat(reviewed_at).tzinfo is not None, "Review time needs a timezone")
    result = copy.deepcopy(report)
    by_id = {block["workId"]: (section, block) for section, block in entries(result)}
    require(len(by_id) == len(entries(result)), "Duplicate entry identity")
    seen = set()
    moved_sections = set()
    for row in decisions:
        identity = row["workId"]
        require(identity not in seen, f"Duplicate review: {identity}")
        seen.add(identity)
        require(identity in by_id, f"Unknown review: {identity}")
        section, block = by_id[identity]
        require((row["day"], row["number"]) == (report["day"], block["number"]),
                f"Review identity mismatch: {identity}")
        require(row.get("source_version") == report["sha256"], f"Reviewed version changed: {identity}")
        require(row["status"] in {"passed", "corrected", "unverified"}, "Invalid review status")
        reason, sources = row["reason"], row["source_urls"]
        require(isinstance(reason, str) and reason.strip(), "Review needs its evidence summary")
        primary = "https://github.com/" + identity.removeprefix("github:").replace("#", "/pull/")
        require(isinstance(sources, list) and primary in sources, f"Missing primary source: {identity}")
        for url in sources:
            parsed = urlsplit(url)
            require(parsed.scheme == "https" and parsed.hostname and not parsed.username
                    and not parsed.password, "Invalid review source")
        changes = row.get("changes") or {}
        require(isinstance(changes, dict) and set(changes) <= {"title", "paragraphs", "stage"},
                "Unsupported entry changes")
        require(row["status"] != "passed" or not changes, "An unchanged pass may not change content")
        stage = changes.get("stage", section["key"])
        require(stage in CHAPTERS[2:-1], "Invalid engineering stage")
        if stage != section["key"]:
            require(replacement_figure, "Stage moves require a separately reviewed flow figure")
            group_title = "计算与执行优化"
            for item in section["blocks"]:
                if item is block:
                    break
                if item["kind"] == "group":
                    group_title = item["title"]
            section["blocks"].remove(block)
            moved_sections.update((section["key"], stage))
            target = next(item for item in result["sections"] if item["key"] == stage)
            target["blocks"] = [item for item in target["blocks"] if not (
                item["kind"] == "paragraph" and item["parts"] == [{"text": "本期未收录该章条目。"}])]
            target["blocks"].extend([{"kind": "group", "title": group_title}, block])
        if "title" in changes:
            require(isinstance(changes["title"], str) and changes["title"].strip(), "Empty title")
            block["title"] = changes["title"]
        if "paragraphs" in changes:
            paragraphs = changes["paragraphs"]
            require(isinstance(paragraphs, list) and len(paragraphs) >= 2, "Incomplete entry text")
            for paragraph in paragraphs:
                require(isinstance(paragraph, list) and paragraph, "Empty paragraph")
                for part in paragraph:
                    require(isinstance(part, dict) and isinstance(part.get("text"), str), "Invalid text part")
                    require(set(part) <= {"text", "url"}, "Invalid text fields")
            require(paragraphs[-1] == block["paragraphs"][-1], "Original source links must be retained")
            require(all("url" not in part for paragraph in paragraphs[:-1] for part in paragraph),
                    "Keep source links in the source paragraph")
            block["paragraphs"] = paragraphs
        if row["status"] == "corrected":
            require(changes, "A correction must include the changed text")
        verified = row["status"] != "unverified"
        block["needsReview"] = not verified
        if verified:
            block["provisionalLocation"] = False
            block["titlePending"] = False
        block["sourceReview"] = {
            "reviewer": reviewer, "reviewedAt": reviewed_at, "status": row["status"],
            "summary": reason, "sources": sources,
            **({"headSha": row["head_sha"]} if row.get("head_sha") else {}),
        }
    require(seen, "No entry reviews supplied")
    for section in result["sections"]:
        if section["key"] not in moved_sections:
            continue
        # Remove a group heading if its final entry moved to another stage.
        blocks = section["blocks"]
        section["blocks"] = [item for index, item in enumerate(blocks) if not (
            item["kind"] == "group" and (index == len(blocks) - 1 or blocks[index + 1]["kind"] != "entry"))]
        if section["key"] in CHAPTERS[2:] and not any(item["kind"] == "entry" for item in section["blocks"]):
            section.pop("intro", None)
            section["blocks"] = [{"kind": "paragraph", "parts": [{"text": "本期未收录该章条目。"}]}]
    editorial = editorial or {}
    require(set(editorial) <= {"intros", "summary"}, "Unsupported editorial changes")
    intros = editorial.get("intros", {})
    require(set(intros) <= moved_sections, "Intro edits must follow a reviewed stage correction")
    for section in result["sections"]:
        if section["key"] in moved_sections:
            # A former chapter intro must not reintroduce the corrected classification.
            section.pop("intro", None)
            section["blocks"] = [item for item in section["blocks"] if not item.get("chapterIntro")]
            intro = intros.get(section["key"])
            if intro:
                require(isinstance(intro, str) and intro.strip(), "Invalid revised chapter intro")
                section["intro"] = intro
                section["blocks"].insert(0, {"kind": "paragraph", "parts": [{"text": intro}], "chapterIntro": True})
        if section["key"] == "summary" and "summary" in editorial:
            require(isinstance(editorial["summary"], str) and editorial["summary"].strip(), "Invalid revised summary")
            section["blocks"] = [{"kind": "paragraph", "parts": [{"text": editorial["summary"]}]}]
    parent = report["sha256"]
    result.pop("sha256", None)
    result["sourceReview"] = {"parentVersion": parent, "reviewer": reviewer, "reviewedAt": reviewed_at,
                              "counts": dict(Counter(row["status"] for row in decisions)),
                              "editorialSections": sorted([*moved_sections, *(["summary"] if "summary" in editorial else [])])}
    # Bind the new content, audit evidence and original figure to a distinct version.
    for section in result["sections"]:
        if section.get("figure"):
            require(section["figure"] == f"{report['day']}/{parent}/flow.png", "Unexpected flow path")
            section["figure"] = "flow.png"
    digest = hashlib.sha256(b"source-reviewed-report-view/1\x00" + canonical(result)
                            + hashlib.sha256(figure).digest()).hexdigest()
    result["sha256"] = digest
    for section in result["sections"]:
        if section.get("figure"):
            section["figure"] = f"{report['day']}/{digest}/flow.png"
    return result


def apply_reviews(root, decisions, *, reviewer, reviewed_at, publish=False, figures=None, editorial=None):
    root = root.resolve()
    catalog = json.loads((root / "catalog.json").read_bytes())
    plans = []
    days = sorted({row["day"] for row in decisions})
    for day in days:
        require(re.fullmatch(r"\d{4}-\d{2}-\d{2}", day), "Invalid review day")
        record = catalog["days"][day]
        version = record["current"]
        require(re.fullmatch(r"[a-f0-9]{64}", version), "Invalid source version")
        source = root / day / version
        report = json.loads((source / "report.json").read_bytes())
        require((report["day"], report["sha256"]) == (day, version), "Source version mismatch")
        replacement = figures / (day + ".png") if figures else None
        figure = (replacement if replacement and replacement.is_file() else source / "flow.png").read_bytes()
        subset = [row for row in decisions if row["day"] == day]
        updated = revision(report, subset, reviewer=reviewer, reviewed_at=reviewed_at, figure=figure,
                           replacement_figure=bool(replacement and replacement.is_file()),
                           editorial=(editorial or {}).get(day))
        plans.append((updated, figure))
    # Validate the entire batch before any archive write.
    if publish:
        for updated, figure in plans:
            IMPORTER["save_report"](root, updated, figure, promote=True, reviewed=True)
    return [{"day": report["day"], "version": report["sha256"], **report["sourceReview"]}
            for report, _ in plans]


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("decisions", type=Path)
    cli.add_argument("--archive", type=Path, default=Path(__file__).resolve().parents[1] / "public/word-reports")
    cli.add_argument("--reviewer", required=True)
    cli.add_argument("--reviewed-at", required=True)
    cli.add_argument("--publish", action="store_true")
    cli.add_argument("--figures", type=Path, help="Reviewed replacement flow PNGs named YYYY-MM-DD.png")
    cli.add_argument("--editorial", type=Path, help="Reviewed chapter intros and summaries, keyed by day")
    args = cli.parse_args()
    decisions = json.loads(args.decisions.read_bytes())
    print(json.dumps(apply_reviews(args.archive, decisions, reviewer=args.reviewer,
                                  reviewed_at=args.reviewed_at, publish=args.publish,
                                  figures=args.figures,
                                  editorial=json.loads(args.editorial.read_bytes()) if args.editorial else None),
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

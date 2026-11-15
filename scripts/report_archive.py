"""Archive layout shared by the Word and pipeline report importers."""

import json
from pathlib import Path
from tempfile import NamedTemporaryFile


CHAPTERS = (
    "summary", "flow", "startup", "scheduling", "prefill", "pd_transfer",
    "decode", "speculative", "output_return", "resource_reclaim", "papers",
)


def write_bytes(path, content):
    if path.exists() and path.read_bytes() == content:
        return
    with NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(content)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def write_json(path, data, *, compact=False):
    options = {"separators": (",", ":")} if compact else {"indent": 2}
    content = json.dumps(data, ensure_ascii=False, **options) + "\n"
    write_bytes(path, content.encode("utf-8"))


def reusable_intro(value):
    """Quote an existing intro only, without shortening or inferring from entry text."""
    unavailable = (
        "本章条目按下列主题展开，具体事实见各条正文。",
        "本章组稿生成待核查，以下按原卡片保留本次已收录条目。",
        "本章条目已收录，导语生成未通过自动核对。",
        "本日未收录", "本期未收录", "本次交付范围内未收录",
    )
    if (not isinstance(value, str) or not value.strip()
            or "\n" in value or "\r" in value
            or value.strip().startswith(unavailable)):
        return None
    return value


def project_opening_intro(section):
    """Only one plain opening paragraph, before any group or entry, is an intro."""
    if section["key"] not in CHAPTERS[2:] or not any(
        block["kind"] == "entry" for block in section["blocks"]
    ):
        return
    opening = []
    for block in section["blocks"]:
        if block["kind"] != "paragraph":
            break
        opening.append(block)
    if len(opening) != 1 or any("url" in part for part in opening[0]["parts"]):
        return
    value = reusable_intro("".join(part["text"] for part in opening[0]["parts"]))
    if value is not None:
        section["intro"] = value
        # Reader presents this same paragraph as one link, not twice.
        opening[0]["chapterIntro"] = True


def flow_index(root, catalog, incoming=None):
    rows = []
    chapters = []
    for day, record in sorted(catalog["days"].items(), reverse=True):
        version = record["current"]
        if incoming is not None and (day, version) == (incoming["day"], incoming["sha256"]):
            report = incoming
        else:
            report_path = root / day / version / "report.json"
            report = json.loads(report_path.read_text(encoding="utf-8"))
        if (report["day"], report["sha256"]) != (day, version):
            raise ValueError("日报日期或版本与目录不一致")
        for section in report["sections"]:
            intro = reusable_intro(section.get("intro"))
            if intro is not None:
                entries = [block for block in section["blocks"] if block["kind"] == "entry"]
                work_ids = sorted({entry["workId"] for entry in entries if entry.get("workId")})
                sources = sorted({work_id.split("#")[0] for work_id in work_ids})
                if any(not entry.get("workId") for entry in entries):
                    sources.append("unknown")
                chapters.append({
                    "day": day, "version": version, "stage": section["key"],
                    "title": section["title"], "intro": intro,
                    "sources": sources, "workIds": work_ids,
                })
            if section["key"] in ("summary", "flow", "papers"):
                continue
            for entry in section["blocks"]:
                if entry["kind"] == "entry" and entry.get("workId"):
                    rows.append({
                        "day": day, "version": version, "stage": section["key"],
                        "number": entry["number"], "workId": entry["workId"],
                        "title": entry["title"],
                    })
    return {"schemaVersion": 1, "entries": rows, "chapters": chapters}


def write_flow_index(root, catalog):
    write_json(root / "flow-index.json", flow_index(root, catalog), compact=True)

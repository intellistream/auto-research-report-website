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


def chapter_summary(section, field="chapter_summary"):
    """Keep upstream text byte-for-byte; None/absence means not delivered."""
    value = section.get(field)
    if value is not None and (not isinstance(value, str) or not value.strip() or len(value) > 180):
        raise ValueError(f"{field} 须为至多180字符的非空字符串或未提供")
    return value


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
            summary = chapter_summary(section)
            if summary is not None:
                entries = [block for block in section["blocks"] if block["kind"] == "entry"]
                work_ids = sorted({entry["workId"] for entry in entries if entry.get("workId")})
                sources = sorted({work_id.split("#")[0] for work_id in work_ids})
                if any(not entry.get("workId") for entry in entries):
                    sources.append("unknown")
                chapters.append({
                    "day": day, "version": version, "stage": section["key"],
                    "title": section["title"], "chapter_summary": summary,
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

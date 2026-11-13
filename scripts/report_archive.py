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


def flow_index(root, catalog, incoming=None):
    rows = []
    for day, record in sorted(catalog["days"].items(), reverse=True):
        version = record["current"]
        if incoming is not None and (day, version) == (incoming["day"], incoming["sha256"]):
            report = incoming
        else:
            report_path = root / day / version / "report.json"
            report = json.loads(report_path.read_text(encoding="utf-8"))
        for section in report["sections"]:
            if section["key"] in ("summary", "flow", "papers"):
                continue
            for entry in section["blocks"]:
                if entry["kind"] == "entry" and entry.get("workId"):
                    rows.append({
                        "day": day, "version": version, "stage": section["key"],
                        "number": entry["number"], "workId": entry["workId"],
                        "title": entry["title"],
                    })
    return {"schemaVersion": 1, "entries": rows}


def write_flow_index(root, catalog):
    write_json(root / "flow-index.json", flow_index(root, catalog), compact=True)

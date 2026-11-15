"""Convert the daily Word template to local website data using Python 3.9+."""

import argparse
import hashlib
import io
import json
import re
import sys
from datetime import date
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

from report_archive import CHAPTERS, project_opening_intro, write_flow_index, write_json

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
NUMERALS = ("一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一")
ENTRY = re.compile(r"^([AVP]\d+)\s+(.+)$")
PR = re.compile(r"^/(vllm-project/(?:vllm|vllm-ascend))/pull/(\d+)/?$", re.I)
PAPER = re.compile(r"^/(?:abs|html|pdf)/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?/?$")


def safe_url(value):
    try:
        url = urlsplit(value)
        return url.scheme in ("http", "https") and url.hostname and url.username is None
    except ValueError:
        return False


def paragraph(node, relations, warnings):
    parts = []
    figures = []

    def add(text, url=None):
        if not text:
            return
        if parts and parts[-1].get("url") == url:
            parts[-1]["text"] += text
        else:
            parts.append({"text": text, **({"url": url} if url else {})})

    def visit(element, url=None):
        if element.tag == W + "hyperlink":
            target, external = relations.get(element.get(R + "id"), ("", False))
            if external and safe_url(target):
                url = target
            elif target:
                warnings.append(f"保留链接文字，未导入链接：{target}")
        if element.tag == W + "t":
            add(element.text, url)
        elif element.tag in (W + "br", W + "cr", W + "tab"):
            add("\t" if element.tag == W + "tab" else "\n", url)
        embed = element.get(R + "embed")
        if embed:
            target, external = relations[embed]
            path = PurePosixPath(target)
            if external or path.parent != PurePosixPath("media") or path.suffix.lower() != ".png":
                raise ValueError("流程图需为 Word 内嵌 PNG")
            figures.append(f"word/{path}")
        for child in element:
            visit(child, url)

    visit(node)
    return parts, figures


def identify(entry, warnings):
    paper = entry["number"].startswith("P")
    candidates = {}
    text = ""
    for parts in entry["paragraphs"]:
        text += "\n" + "".join(part["text"] for part in parts)
        for part in parts:
            if "url" not in part:
                continue
            url = urlsplit(part["url"])
            if paper and url.hostname == "arxiv.org":
                match = PAPER.fullmatch(url.path)
                if match:
                    candidates[f"arxiv:{match[1]}"] = part["url"]
            if not paper and url.hostname == "github.com":
                match = PR.fullmatch(url.path)
                if match:
                    candidates[f"github:{match[1].lower()}#{match[2]}"] = part["url"]
    if len(candidates) > 1 and not paper:
        candidates = {
            key: url for key, url in candidates.items()
            if not re.search(r"前置\s*#" + key.split("#")[-1] + r"(?!\d)", text)
        }
    if len(candidates) == 1:
        entry["workId"] = next(iter(candidates))
    else:
        warnings.append(f"{entry['number']} 无法唯一识别主来源，保留原文和全部链接")


def parse(name, raw):
    match = re.search(r"(\d{8})\.docx$", name, re.I)
    if not match:
        raise ValueError("文件名须以 YYYYMMDD.docx 结尾")
    stamp = match[1]
    day = date(int(stamp[:4]), int(stamp[4:6]), int(stamp[6:])).isoformat()
    digest = hashlib.sha256(raw).hexdigest()
    warnings = []
    report = {"schemaVersion": 1, "day": day, "sha256": digest, "originalName": name,
              "title": "", "intro": [], "sections": []}
    section = None
    entry = None
    subtitle = None
    figure_data = None
    with ZipFile(io.BytesIO(raw)) as doc:
        styles = {}
        for style in ET.fromstring(doc.read("word/styles.xml")).findall(W + "style"):
            label = style.find(W + "name")
            if label is not None:
                styles[style.get(W + "styleId")] = label.get(W + "val", "").lower()
        relations = {
            el.get("Id"): (el.get("Target", ""), el.get("TargetMode") == "External")
            for el in ET.fromstring(doc.read("word/_rels/document.xml.rels"))
        }
        body = ET.fromstring(doc.read("word/document.xml")).find(W + "body")
        for node in body:
            if node.tag == W + "sectPr":
                continue
            if node.tag != W + "p":
                raise ValueError(f"正文包含尚未支持的结构：{node.tag.split('}')[-1]}")
            style_node = node.find(f"{W}pPr/{W}pStyle")
            style = styles.get(style_node.get(W + "val"), "") if style_node is not None else ""
            parts, figures = paragraph(node, relations, warnings)
            text = "".join(part["text"] for part in parts).strip()
            if figures:
                if not section or section["key"] != "flow" or figure_data is not None or len(figures) != 1:
                    raise ValueError("流程图位置或数量与模板不一致")
                figure_data = doc.read(figures[0])
                if not figure_data.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("流程图不是有效的 PNG 文件")
                section["figure"] = f"{day}/{digest}/flow.png"
            if not text:
                continue
            if style == "title":
                report["title"] = text
            elif style == "subtitle":
                subtitle = re.fullmatch(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", text)
            elif style == "heading 1":
                idx = len(report["sections"])
                if idx >= len(CHAPTERS) or not re.match(rf"^{NUMERALS[idx]}[\s、.．]", text):
                    raise ValueError(f"一级章节顺序与模板不一致：{text}")
                section = {"key": CHAPTERS[idx], "title": text, "blocks": []}
                report["sections"].append(section)
                entry = None
            elif section is None:
                report["intro"].append(parts)
            elif style in ("heading 2", "heading 3"):
                match = ENTRY.fullmatch(text)
                paper_section = section["key"] == "papers"
                if match and (match[1].startswith("P") == paper_section):
                    entry = {"kind": "entry", "number": match[1], "title": match[2], "paragraphs": []}
                    section["blocks"].append(entry)
                elif style == "heading 2" and not paper_section and not match:
                    entry = None
                    section["blocks"].append({"kind": "group", "title": text})
                else:
                    raise ValueError(f"无法识别条目标题：{text}")
            elif entry is not None:
                entry["paragraphs"].append(parts)
            else:
                block = {"kind": "paragraph", "parts": parts}
                section["blocks"].append(block)
    if not subtitle or date(*map(int, subtitle.groups())).isoformat() != day:
        raise ValueError("正文日期和文件名日期不一致")
    if not report["title"] or len(report["sections"]) != len(CHAPTERS) or not figure_data:
        raise ValueError("缺少日报标题、完整的十一章或流程图")
    seen = set()
    counts = {"upstream": 0, "ascend": 0, "papers": 0}
    for section in report["sections"]:
        project_opening_intro(section)
        for entry in section["blocks"]:
            if entry["kind"] != "entry":
                continue
            number = entry["number"]
            if number in seen or not entry["paragraphs"]:
                raise ValueError(f"条目编号重复或缺少正文：{number}")
            seen.add(number)
            identify(entry, warnings)
            counts[{"A": "ascend", "V": "upstream", "P": "papers"}[number[0]]] += 1
    report["counts"] = counts
    report["warnings"] = warnings
    return report, figure_data


def inputs(path):
    if path.is_dir():
        for file in sorted(path.glob("*.docx")):
            if not file.name.startswith("~$"):
                yield file.name, file.read_bytes()
    elif path.suffix.lower() == ".zip":
        with ZipFile(path) as archive:
            for member in sorted(archive.namelist()):
                name = PurePosixPath(member).name
                if name.lower().endswith(".docx") and not name.startswith("~$"):
                    yield name, archive.read(member)
    elif path.suffix.lower() == ".docx":
        yield path.name, path.read_bytes()
    else:
        raise ValueError("请输入 DOCX、包含 DOCX 的目录或 ZIP")


def run(source, root, *, web_only=False):
    index_path = root / "catalog.json"
    index = (json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists()
             else {"schemaVersion": 1, "days": {}})
    parsed = []
    for name, raw in inputs(source):
        try:
            report, figure = parse(name, raw)
        except (ValueError, KeyError, BadZipFile, ET.ParseError) as err:
            raise ValueError(f"{name}: {err}") from err
        parsed.append((report, raw, figure))
    if not parsed:
        raise ValueError("未找到日报")
    dates = {}
    for report, raw, figure in parsed:
        day, digest = report["day"], report["sha256"]
        if day in dates and dates[day] != digest:
            raise ValueError(f"同一批次包含 {day} 的多个版本，请按修订顺序分别导入")
        dates[day] = digest
    for report, raw, figure in parsed:
        day, digest = report["day"], report["sha256"]
        record = index["days"].setdefault(day, {"current": digest, "versions": []})
        if any(version["sha256"] == digest for version in record["versions"]):
            print(f"{day} 已导入，跳过")
            continue
        prefix = f"{day}/{digest}"
        output = root / prefix
        output.mkdir(parents=True, exist_ok=True)
        if not web_only:
            report["original"] = f"{prefix}/original.docx"
            (output / "original.docx").write_bytes(raw)
        (output / "flow.png").write_bytes(figure)
        write_json(output / "report.json", report)
        record["versions"].append({"sha256": digest, "path": f"{prefix}/report.json",
                                   "counts": report["counts"]})
        record["current"] = digest
        print(f"{day} 导入完成 {report['counts']}")
        for warning in report["warnings"]:
            print(f"  待核对：{warning}")
    write_flow_index(root, index)
    write_json(index_path, index)


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("source", type=Path)
    cli.add_argument("--output", type=Path)
    cli.add_argument("--web-only", action="store_true", help="Export site data without copying Word originals")
    args = cli.parse_args()
    if args.web_only and not args.output:
        cli.error("--web-only requires a separate --output directory")
    output = args.output or Path(__file__).resolve().parents[2] / "work" / "docx-preview"
    try:
        run(args.source, output, web_only=args.web_only)
    except (OSError, ValueError, BadZipFile) as err:
        print(err, file=sys.stderr)
        sys.exit(1)

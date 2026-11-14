"""Isolated Word fixtures: never write to the published report archive."""
import hashlib
import io
import json
import runpy
import tempfile
import unittest
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile

from report_archive import CHAPTERS, flow_index

IMPORTER = runpy.run_path(str(Path(__file__).with_name("import-docx.py")))
PNG = b"\x89PNG\r\n\x1a\n"
NAME = "fixture-20261109.docx"
NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def fixture(summaries=None, extra=None):
    def p(text, style=""):
        properties = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        return f'<w:p>{properties}<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'
    parts = [p("隔离日报", "Title"), p("2026 年 11 月 9 日", "Subtitle")]
    for i, key in enumerate(CHAPTERS):
        parts.append(p(IMPORTER["NUMERALS"][i] + " " + key, "Heading1"))
        if summaries and key in summaries:
            parts.append(p("问题总结：" + summaries[key]))
        parts.append(p("原章导语，不能当成新总结。"))
        if key == "flow":
            parts.append('<w:p><w:r><w:drawing r:embed="image"/></w:r></w:p>')
        if extra and key in extra:
            parts.extend(p(text, style) for text, style in extra[key])
        if key == "startup":
            parts.extend([p("V1 隔离条目", "Heading3"), p("原条目完整正文。")])
            parts.append('<w:p><w:hyperlink r:id="pr"><w:r><w:t>PR 原文</w:t></w:r></w:hyperlink></w:p>')
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", f'<w:document xmlns:w="{NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>{"".join(parts)}</w:body></w:document>')
        archive.writestr("word/styles.xml", f'<w:styles xmlns:w="{NS}">' + "".join(
            f'<w:style w:styleId="{key}"><w:name w:val="{value}"/></w:style>'
            for key, value in [("Title", "title"), ("Subtitle", "subtitle"), ("Heading1", "heading 1"), ("Heading2", "heading 2"), ("Heading3", "heading 3")]
        ) + '</w:styles>')
        archive.writestr("word/_rels/document.xml.rels", '<Relationships><Relationship Id="image" Target="media/image.png"/><Relationship Id="pr" Target="https://github.com/vllm-project/vllm/pull/123" TargetMode="External"/></Relationships>')
        archive.writestr("word/media/image.png", PNG)
    return buffer.getvalue()


class WordChapterSummaryTest(unittest.TestCase):
    def test_explicit_markers_preserve_every_chapter_original_text_and_download(self):
        summaries = {key: "  关注 KV cache 重复读取的开销；仅限本章配置。  " for key in CHAPTERS}
        raw = fixture(summaries)
        report, _ = IMPORTER["parse"](NAME, raw)
        self.assertEqual([s["chapter_summary"] for s in report["sections"]], list(summaries.values()))
        self.assertTrue(report["sections"][2]["blocks"][0]["chapterSummary"])
        self.assertEqual(report["sections"][2]["blocks"][0]["parts"][0]["text"], "问题总结：" + summaries["startup"])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / NAME
            source.write_bytes(raw)
            output = root / "site"
            output.mkdir()
            IMPORTER["run"](source, output)
            version = hashlib.sha256(raw).hexdigest()
            archived = output / report["day"] / version
            self.assertEqual((archived / "original.docx").read_bytes(), raw)
            index = json.loads((output / "flow-index.json").read_bytes())
            chapter = next(s for s in index["chapters"] if s["stage"] == "startup")
            self.assertEqual(chapter["chapter_summary"], summaries["startup"])
            self.assertEqual(chapter["sources"], ["github:vllm-project/vllm"])
            self.assertEqual(chapter["workIds"], ["github:vllm-project/vllm#123"])
            self.assertEqual(chapter["version"], version)
            before = (output / "flow-index.json").read_bytes()
            IMPORTER["run"](source, output)
            self.assertEqual((output / "flow-index.json").read_bytes(), before)

    def test_legacy_intro_and_group_or_entry_text_are_not_summaries(self):
        report, _ = IMPORTER["parse"](NAME, fixture(extra={
            "scheduling": [("分组", "Heading2"), ("问题总结：组内文本", "")],
        }))
        self.assertTrue(all("chapter_summary" not in s for s in report["sections"]))
        # The same marker inside an entry remains ordinary body text.
        raw = fixture(extra={"startup": [("V2 第二条", "Heading3"), ("问题总结：条目正文", "")]})
        report, _ = IMPORTER["parse"](NAME, raw)
        self.assertNotIn("chapter_summary", report["sections"][2])
        self.assertTrue(any("问题总结：条目正文" in str(b) for b in report["sections"][2]["blocks"]))

    def test_blank_and_duplicate_chapter_markers_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "chapter_summary"):
            IMPORTER["parse"](NAME, fixture({"startup": "  "}))
        with self.assertRaisesRegex(ValueError, "重复"):
            IMPORTER["parse"](NAME, fixture({"startup": "第一句"}, {"startup": [("问题总结：第二句", "")]}))

    def test_index_tracks_unknown_sources_and_checks_catalog_identity(self):
        report, _ = IMPORTER["parse"](NAME, fixture({"startup": "原句"}))
        entry = next(b for b in report["sections"][2]["blocks"] if b["kind"] == "entry")
        entry.pop("workId")
        catalog = {"days": {report["day"]: {"current": report["sha256"]}}}
        row = flow_index(Path("unused"), catalog, incoming=report)["chapters"][0]
        self.assertEqual(row["sources"], ["unknown"])
        self.assertEqual(row["workIds"], [])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / report["day"] / report["sha256"] / "report.json"
            path.parent.mkdir(parents=True)
            report["day"] = "2026-11-10"
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, "日期或版本"):
                flow_index(root, catalog)


if __name__ == "__main__":
    unittest.main()

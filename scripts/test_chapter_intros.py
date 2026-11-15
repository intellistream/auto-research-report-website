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


def fixture(extra=None, intro="原章导语，说明本章关注的问题。"):
    def p(text, style=""):
        properties = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        return f'<w:p>{properties}<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'
    parts = [p("隔离日报", "Title"), p("2026 年 11 月 9 日", "Subtitle")]
    for i, key in enumerate(CHAPTERS):
        parts.append(p(IMPORTER["NUMERALS"][i] + " " + key, "Heading1"))
        if intro is not None:
            parts.append(p(intro))
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


class WordIntroTest(unittest.TestCase):

    def test_existing_intro_is_reused_but_group_and_entry_text_are_not(self):
        report, _ = IMPORTER["parse"](NAME, fixture(extra={
            "scheduling": [("分组", "Heading2"), ("组内普通说明", "")],
        }))
        self.assertEqual(report["sections"][2]["intro"], "原章导语，说明本章关注的问题。")
        self.assertTrue(all("intro" not in s for s in report["sections"] if s["key"] != "startup"))
        # The same marker inside an entry remains ordinary body text.
        raw = fixture(extra={"startup": [("V2 第二条", "Heading3"), ("条目普通正文", "")]})
        report, _ = IMPORTER["parse"](NAME, raw)
        self.assertEqual(report["sections"][2]["intro"], "原章导语，说明本章关注的问题。")
        self.assertTrue(any("条目普通正文" in str(b) for b in report["sections"][2]["blocks"]))


    def test_index_tracks_unknown_sources_and_checks_catalog_identity(self):
        report, _ = IMPORTER["parse"](NAME, fixture(intro="原句"))
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




class OpeningIntroBoundaryTest(unittest.TestCase):

    def test_missing_or_ambiguous_opening_does_not_promote_entry_or_later_text(self):
        for raw in (
            fixture(intro=None),
            fixture(extra={"startup": [("另一段普通说明。", "")]}),
            fixture(intro="本章条目按下列主题展开，具体事实见各条正文。"),
            fixture(intro="本章组稿生成待核查，以下按原卡片保留本次已收录条目。"),
        ):
            report, _ = IMPORTER["parse"](NAME, raw)
            section = report["sections"][2]
            self.assertNotIn("intro", section)
            self.assertEqual(len([b for b in section["blocks"] if b["kind"] == "entry"]), 1)
        report, _ = IMPORTER["parse"](NAME, fixture(intro="说明性章节也有普通段落。"))
        self.assertTrue(all("intro" not in s for s in report["sections"][:2]))


class WordIntroArchiveTest(unittest.TestCase):
    def test_plain_intro_preserves_text_identity_and_download(self):
        intro = "  服务启动时重复准备权重增加等待。  "
        raw = fixture(intro=intro)
        report, _ = IMPORTER["parse"](NAME, raw)
        section = report["sections"][2]
        self.assertEqual(section["intro"], intro)
        self.assertTrue(section["blocks"][0]["chapterIntro"])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / NAME
            source.write_bytes(raw)
            output = root / "site"
            output.mkdir()
            IMPORTER["run"](source, output)
            version = hashlib.sha256(raw).hexdigest()
            self.assertEqual((output / report["day"] / version / "original.docx").read_bytes(), raw)
            item = json.loads((output / "flow-index.json").read_bytes())["chapters"][0]
            self.assertEqual(item["intro"], intro)
            self.assertEqual(item["sources"], ["github:vllm-project/vllm"])
            self.assertEqual(item["workIds"], ["github:vllm-project/vllm#123"])
            before = (output / "flow-index.json").read_bytes()
            IMPORTER["run"](source, output)
            self.assertEqual((output / "flow-index.json").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()

"""Staging importer regression tests; synthetic fixtures, never author/public files."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("academic_import", Path(__file__).with_name("import-academic-paper.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AcademicImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "author"
        self.source.mkdir()
        (self.source / "figures").mkdir()
        self.output = self.root / "staging"
        self.index = self.root / "topics.json"
        self.original = {"schemaVersion": 2, "topics": [{"id": "aclgraph", "title": "old", "report": {"version": "old"}}, {"id": "kv-cache", "entries": ["untouched"]}, {"id": "speculative-decoding", "entries": ["untouched"]}]}
        self.index.write_text(json.dumps(self.original), encoding="utf-8")
        (self.source / "paper.md").write_text('---\ntitle: "论文"\nsubtitle: "Paper"\n---\n\n## 摘要 {.unnumbered}\n\n真正论文摘要。\n\n**关键词：** 图；推理\n\n# 正文\n![原创图](figures/diagram.svg)\n', encoding="utf-8")
        (self.source / "paper.tex").write_text('\\documentclass{article}\n\\includegraphics{figures/diagram.pdf}\n', encoding="utf-8")
        (self.source / "paper.html").write_text('<!doctype html><html><head><title>论文</title></head><body><h1 id="intro">论文</h1><math><mi>x</mi></math><img alt="原创图" src="data:image/png;base64,aGVsbG8="/><a href="#ref-a">[1]</a><p id="ref-a">Reference</p><a href="https://example.org/paper">original</a></body></html>', encoding="utf-8")
        (self.source / "paper.pdf").write_bytes(b"%PDF-1.4\nsynthetic test fixture\n")
        (self.source / "references.bib").write_text('@article{a,title={Paper}}', encoding="utf-8")
        for name in ("diagram.svg", "diagram.pdf", "diagram.tex"):
            (self.source / "figures" / name).write_bytes(b"original synthetic diagram")

    def stage(self, **kwargs):
        return module.stage_paper(self.source, kwargs.get("output", self.output), self.index, "aclgraph", "2026-11-15", kwargs.get("revision", "review-pending"))

    def write_word(self, text="Synthetic manuscript"):
        parts = {
            "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
            "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="document" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
            "word/document.xml": f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>',
        }
        path = self.source / "paper.docx"
        with zipfile.ZipFile(path, "w") as package:
            for name, value in parts.items():
                package.writestr(zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0)), value)
        return path.read_bytes()

    def test_freezes_exact_bytes_hashes_and_preserves_index_and_source(self):
        before = {p.relative_to(self.source): p.read_bytes() for p in self.source.rglob("*") if p.is_file()}
        result = self.stage()
        self.assertEqual(set(result["academicPaper"]["assets"]), set(module.FILES))
        destination = Path(result["destination"])
        for kind, asset in result["academicPaper"]["assets"].items():
            data = (self.output / "word-reports" / asset["path"]).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), asset["sha256"])
            self.assertEqual(len(data), asset["bytes"])
            if kind != "sources":
                self.assertEqual(data, before[Path(module.FILES[kind])])
        manifest = json.loads((destination / "manifest.json").read_bytes())
        self.assertEqual(manifest["version"], hashlib.sha256(module.canonical({key: value for key, value in manifest.items() if key != "version"})).hexdigest())
        candidate = json.loads((self.output / "word-reports/topics.json").read_bytes())
        paper = candidate["topics"][0].pop("academicPaper")
        self.assertEqual(candidate, self.original)
        self.assertEqual(paper["abstract"], "真正论文摘要。")
        self.assertEqual(json.loads(self.index.read_bytes()), self.original)
        self.assertEqual(before, {p.relative_to(self.source): p.read_bytes() for p in self.source.rglob("*") if p.is_file()})
        self.assertEqual(result["htmlChecks"]["mathML"], 1)
        self.assertEqual(result["status"], "staging_only_not_published")

    def test_optional_word_is_frozen_in_identity_and_editable_source_zip(self):
        legacy = self.stage()
        (self.source / "build_web.py").write_bytes(b"print('portable export')\n")
        (self.source / "publication-reference-map.json").write_text('{"a":1}', encoding="utf-8")
        (self.source / "workflow-private.txt").write_text("not a source", encoding="utf-8")
        self.assertEqual(self.stage()["version"], legacy["version"])
        word = self.write_word()
        result = self.stage()
        self.assertNotEqual(legacy["version"], result["version"])
        self.assertEqual(set(result["academicPaper"]["assets"]), set(module.FILES) | {"word"})
        destination = Path(result["destination"])
        asset = result["academicPaper"]["assets"]["word"]
        self.assertEqual(asset["path"], f'topic-papers/aclgraph/{result["version"]}/paper.docx')
        self.assertEqual(asset["sha256"], hashlib.sha256(word).hexdigest())
        self.assertEqual(asset["bytes"], len(word))
        self.assertEqual((destination / "paper.docx").read_bytes(), word)
        manifest = json.loads((destination / "manifest.json").read_bytes())
        self.assertEqual(manifest["assets"]["paper.docx"], {"bytes": len(word), "sha256": asset["sha256"]})
        self.assertEqual(manifest["version"], hashlib.sha256(module.canonical({key: value for key, value in manifest.items() if key != "version"})).hexdigest())
        with zipfile.ZipFile(destination / "sources.zip") as archive:
            self.assertEqual(archive.read("paper.docx"), word)
            self.assertEqual(archive.read("build_web.py"), b"print('portable export')\n")
            self.assertEqual(archive.read("publication-reference-map.json"), b'{"a":1}')
            self.assertNotIn("workflow-private.txt", archive.namelist())
            readme = archive.read("README.md").decode("utf-8")
            self.assertIn("exported from paper.docx", readme)
            self.assertNotIn("--number-sections", readme)
        self.assertEqual(self.stage()["version"], result["version"])
        self.write_word("Changed manuscript")
        self.assertNotEqual(self.stage()["version"], result["version"])
        self.assertEqual((destination / "paper.docx").read_bytes(), word)
        (self.source / "paper.docx").unlink()
        self.assertEqual(self.stage()["version"], legacy["version"])

    def test_invalid_optional_word_is_refused_before_staging(self):
        word = self.source / "paper.docx"
        word.write_bytes(b"not a Word package")
        with self.assertRaisesRegex(ValueError, "DOCX"):
            self.stage()
        with zipfile.ZipFile(word, "w") as package:
            package.writestr("unrelated.txt", "not a Word document")
        with self.assertRaisesRegex(ValueError, "Word document parts"):
            self.stage()
        self.assertFalse(self.output.exists())

    def test_word_citation_metadata_requires_portable_paths_without_scanning_body_examples(self):
        def with_property(name, value):
            self.write_word(r"A normal path example C:\example\input.txt")
            xml = f'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property name="{name}"><vt:lpwstr>{value}</vt:lpwstr></property></Properties>'
            with zipfile.ZipFile(self.source / "paper.docx", "a") as package:
                package.writestr("docProps/custom.xml", xml)
            return (self.source / "paper.docx").read_bytes()
        for name in ("bibliography", "csl"):
            for value in (r"C:\private\references.bib", "/home/private/references.bib", "file:///private/references.bib"):
                with self.subTest(name=name, value=value):
                    with_property(name, value)
                    with self.assertRaisesRegex(ValueError, "portable relative path"):
                        self.stage()
        self.assertFalse(self.output.exists())
        module.inspect_docx(with_property("bibliography", "references.bib"))
        module.inspect_docx(with_property("csl", "numeric.csl"))
        module.inspect_docx(with_property("title", r"A path example C:\example\input.txt"))

    def test_idempotent_and_new_content_or_metadata_creates_new_version(self):
        initial = self.stage()
        self.assertEqual(initial["version"], self.stage()["version"])
        changed = self.stage(revision="new-revision")
        self.assertNotEqual(initial["version"], changed["version"])
        (self.source / "paper.pdf").write_bytes(b"%PDF-1.4\nnew fixture\n")
        self.assertNotEqual(changed["version"], self.stage(revision="new-revision")["version"])

    def test_corrupt_frozen_version_is_refused_without_rewrite(self):
        result = self.stage()
        pdf = Path(result["destination"]) / "paper.pdf"
        pdf.write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "collision/corruption"):
            self.stage()
        self.assertEqual(pdf.read_bytes(), b"tampered")

    def test_zip_excludes_workflow_inputs_credentials_and_unreferenced_pdfs(self):
        for directory in ("inputs", "opencode", "rendered"):
            (self.source / directory).mkdir()
            (self.source / directory / "private.json").write_text("not publishable", encoding="utf-8")
        (self.source / ".env").write_text("do not copy", encoding="utf-8")
        (self.source / "figures/third-party-fulltext.pdf").write_bytes(b"do not copy")
        result = self.stage()
        with zipfile.ZipFile(Path(result["destination"]) / "sources.zip") as archive:
            self.assertEqual(sorted(archive.namelist()), sorted(["paper.md", "paper.tex", "references.bib", "README.md", "figures/diagram.svg", "figures/diagram.pdf", "figures/diagram.tex"]))
            readme = archive.read("README.md").decode()
            self.assertIn("xelatex", readme)
            self.assertIn("--metadata=link-citations:true", readme)
            self.assertNotIn(str(self.source), readme)

    def test_staging_cannot_target_public_or_author_tree(self):
        for output in (module.REPO / "public/word-reports", module.REPO, self.source / "generated", self.source.parent):
            with self.subTest(output=output), self.assertRaises(ValueError):
                self.stage(output=output)

    def test_html_refuses_scripts_remote_assets_navigation_and_missing_targets(self):
        for payload in ('<script>alert(1)</script>', '<img alt="x" src="https://remote/image.png">', '<a href="javascript:alert(1)">x</a>', '<meta http-equiv="refresh" content="0;url=https://remote">', '<a href="#missing">bad</a>', '<div onclick="x()">bad</div>', '<style>@import "https://remote/style.css";</style>'):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                module.inspect_html(f'<title>T</title><h1 id="h">H</h1>{payload}'.encode())

    def test_self_contained_data_stylesheet_is_checked_without_rewriting(self):
        valid = b'<title>T</title><link rel="stylesheet" href="data:text/css,body%7Bcolor%3Ablack%7D"><h1 id="h">H</h1>'
        self.assertTrue(module.inspect_html(valid)["scriptFreeAndSelfContained"])
        for href in ("https://remote/style.css", "data:text/css,%40import%20%27https%3A%2F%2Fremote%2Fs.css%27%3B", "data:text/css,body%7Bbackground%3Aurl(https%3A%2F%2Fremote%2Fx)%7D"):
            with self.subTest(href=href), self.assertRaises(ValueError):
                module.inspect_html(f'<title>T</title><link rel="stylesheet" href="{href}"><h1 id="h">H</h1>'.encode())

    def test_inline_citation_targets_are_checked_even_without_clickable_citations(self):
        html = b'<title>T</title><h1 id="h">H</h1><span data-cites="source-a">[1]</span><div id="ref-source-a">Reference</div>'
        checked = module.inspect_html(html)
        self.assertEqual(checked["inlineCitations"], 1)
        self.assertEqual(checked["internalLinks"], 0)
        self.assertTrue(checked["allInlineCitationTargetsExist"])
        with self.assertRaisesRegex(ValueError, "inline citation"):
            module.inspect_html(html.replace(b'ref-source-a', b'ref-wrong'))

    def test_source_symlink_is_refused(self):
        target = self.source / "paper.pdf"
        target.unlink()
        outside = self.root / "outside.pdf"
        outside.write_bytes(b"%PDF-secret")
        try:
            target.symlink_to(outside)
        except OSError:
            self.skipTest("symlink creation unavailable")
        with self.assertRaisesRegex(ValueError, "unsafe source"):
            self.stage()

    def test_explicit_metadata_matches_the_reader_contract(self):
        markdown = (self.source / "paper.md").read_bytes()
        with self.assertRaisesRegex(ValueError, "YYYY-MM-DD"):
            module.metadata_from_markdown(markdown, "20261115", "draft")
        with self.assertRaisesRegex(ValueError, "Titles"):
            module.metadata_from_markdown(markdown.replace(b'subtitle: "Paper"', b'subtitle: ""'), "2026-11-15", "draft")


if __name__ == "__main__":
    unittest.main()

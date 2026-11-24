"""Check the author manifest and publication safety before staging."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("specdec_publisher", Path(__file__).with_name("publish-specdec-paper.py"))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class SpecDecPublisher(unittest.TestCase):
    def test_clean_build_and_hashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            manifest = {"language": "zh-CN", "sourceCommit": "a" * 40, "sourceDirty": False, "artifacts": {}}
            for name in ("paper.md", "references.bib", "paper.tex", "paper.html", "paper.pdf", "paper.docx", "sources.zip"):
                data = name.encode()
                (source / name).write_bytes(data)
                manifest["artifacts"][name] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            path = source / "manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            self.assertEqual(publisher.verify_author_build(source), manifest)
            (source / "paper.pdf").write_bytes(b"wrong version")
            with self.assertRaisesRegex(SystemExit, "paper.pdf"):
                publisher.verify_author_build(source)
            manifest["sourceDirty"] = True
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(SystemExit, "clean versioned"):
                publisher.verify_author_build(source)


    def test_current_frozen_chinese_survey(self):
        root = Path(__file__).resolve().parents[1] / "public" / "word-reports"
        index = json.loads((root / "topics.json").read_text(encoding="utf-8"))
        topic = next(row for row in index["topics"] if row["id"] == "speculative-decoding")
        paper = topic["academicPaper"]
        spec = importlib.util.spec_from_file_location("academic_import", Path(__file__).with_name("import-academic-paper.py"))
        importer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(importer)
        manifest = json.loads((root / paper["manifestPath"]).read_bytes())
        identity = {key: value for key, value in manifest.items() if key != "version"}
        self.assertEqual(hashlib.sha256(importer.canonical(identity)).hexdigest(), paper["version"])
        for asset in paper["assets"].values():
            data = (root / asset["path"]).read_bytes()
            self.assertEqual(importer.digest(data), manifest["assets"][Path(asset["path"]).name])
        checks = importer.inspect_html((root / paper["assets"]["html"]["path"]).read_bytes())
        self.assertEqual(checks["embeddedFigures"], 4)
        self.assertGreaterEqual(checks["mathML"], 15)
        word = (root / paper["assets"]["word"]["path"]).read_bytes()
        importer.inspect_docx(word)
        self.assertEqual(importer.metadata_from_markdown(
            (root / paper["assets"]["markdown"]["path"]).read_bytes(),
            paper["literatureCutoff"], paper["manuscriptRevision"]), manifest["metadata"])
        with zipfile.ZipFile(root / paper["assets"]["sources"]["path"]) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(set(archive.namelist()), {
                "README.md", "paper.md", "paper.tex", "paper.docx", "references.bib", "numeric.csl",
                *(f"figures/{figure}.{suffix}" for figure in
                  ("draft-dependencies", "execution-model", "state-recovery", "verification-cost")
                  for suffix in ("pdf", "svg"))
            })
            for kind in ("markdown", "latex", "word", "bibtex"):
                path = root / paper["assets"][kind]["path"]
                self.assertEqual(archive.read(path.name), path.read_bytes())
        self.assertEqual(topic["survey"]["paperVersion"], paper["version"])
        self.assertEqual([(route["id"], route["paperAnchor"]) for route in topic["survey"]["routes"]],
                         [("candidate", "section-3"), ("verification", "section-4"),
                          ("accepted-state", "section-5"), ("runtime", "section-6")])


if __name__ == "__main__":
    unittest.main()

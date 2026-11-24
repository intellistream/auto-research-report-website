"""Check the author manifest and publication safety before staging."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

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


if __name__ == "__main__":
    unittest.main()

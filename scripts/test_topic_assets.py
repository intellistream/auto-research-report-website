"""Validate the exact bytes served by the static topic collection."""

import hashlib
import json
import unittest
from pathlib import Path


ARCHIVE = Path(__file__).resolve().parents[1] / "public" / "word-reports"


class TopicAssetsTest(unittest.TestCase):
    def check_asset(self, path, asset):
        data = path.read_bytes()
        self.assertEqual(len(data), asset["bytes"], path)
        self.assertEqual(hashlib.sha256(data).hexdigest(), asset["sha256"], path)
        if path.suffix == ".pdf":
            self.assertTrue(data.startswith(b"%PDF-"), path)

    def test_current_surveys_and_frozen_history(self):
        index = json.loads((ARCHIVE / "topics.json").read_text(encoding="utf-8"))
        self.assertEqual(index["schemaVersion"], 2)
        for topic in index["topics"]:
            with self.subTest(topic=topic["id"]):
                current = topic.get("report")
                if current:
                    report = current
                    seen = set()
                    while report:
                        version = report["version"]
                        self.assertNotIn(version, seen, "version history contains a cycle")
                        seen.add(version)
                        folder = f"topic-reports/{topic['id']}/{version}"
                        self.assertEqual(report["manifestPath"], f"{folder}/manifest.json")
                        manifest = json.loads((ARCHIVE / report["manifestPath"]).read_bytes())
                        self.assertEqual(manifest["topicId"], topic["id"])
                        self.assertEqual(manifest["version"], version)
                        self.assertEqual(manifest["previousVersion"], report["previousVersion"])
                        frozen = json.loads((ARCHIVE / folder / "report.json").read_bytes())
                        self.assertEqual(frozen, report)
                        expected_assets = {"report.html", "report.md", "report.json"}
                        if report.get("pdfPath"):
                            self.assertEqual(report["pdfPath"], f"{folder}/report.pdf")
                            expected_assets.add("report.pdf")
                        # A research-draft report may have a validated HTML/MD snapshot
                        # before its reviewed PDF is available; do not invent a PDF.
                        self.assertEqual(set(manifest["assets"]), expected_assets)
                        for name in sorted(expected_assets):
                            self.check_asset(ARCHIVE / folder / name, manifest["assets"][name])
                        previous = report["previousVersion"]
                        if not previous:
                            break
                        path = ARCHIVE / "topic-reports" / topic["id"] / previous / "report.json"
                        prior = json.loads(path.read_bytes())
                        self.assertLess(prior["revision"], report["revision"])
                        report = prior
                if paper := topic.get("academicPaper"):
                    folder = f"topic-papers/{topic['id']}/{paper['version']}"
                    self.assertEqual(paper["manifestPath"], f"{folder}/manifest.json")
                    manifest = json.loads((ARCHIVE / paper["manifestPath"]).read_bytes())
                    self.assertEqual(manifest["version"], paper["version"])
                    self.assertEqual(manifest["topicId"], topic["id"])
                    for asset in paper["assets"].values():
                        path = Path(asset["path"])
                        self.assertEqual(path.parent.as_posix(), folder)
                        self.check_asset(ARCHIVE / path, asset)
                        self.assertEqual(manifest["assets"][path.name]["sha256"], asset["sha256"])

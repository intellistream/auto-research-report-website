"""SpecDec first-version research contracts: candidates, sources, PR evidence and falsifiability."""
from __future__ import annotations

import hashlib
import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "public" / "word-reports"
VERSION = "e5a303f8d4534cc4d0ff3ed17051e44bf26c9dc952df51e9a3a8ace7dcee399d"
FOLDER = ROOT / "topic-reports" / "speculative-decoding" / VERSION


def load(name: str) -> dict:
    return json.loads((FOLDER / name).read_text(encoding="utf-8"))


class SpecDecResearchContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        index = json.loads((ROOT / "topics.json").read_text(encoding="utf-8"))
        cls.topic = next(t for t in index["topics"] if t["id"] == "speculative-decoding")
        cls.report = load("report.json")
        cls.sources = load("source-ledger.json")
        cls.cards = load("evidence-ledger.json")
        cls.manifest = load("manifest.json")

    def test_initial_version_not_renumbered(self) -> None:
        report = self.report
        self.assertEqual((report["version"], report["revision"], report["previousVersion"]), (VERSION, 1, None))
        self.assertEqual(self.topic["report"], report)
        self.assertEqual(self.manifest["version"], VERSION)
        self.assertIsNone(self.manifest["previousVersion"])

    def test_105_candidates_preserved_and_screening_transparent(self) -> None:
        rows = self.sources["prCandidates"]
        original = self.topic["entries"]
        self.assertEqual(len(rows), 105)
        self.assertEqual(len({r["workId"] for r in rows}), 105)
        self.assertEqual({r["workId"] for r in rows}, {e["workId"] for e in original})
        self.assertEqual(self.topic["counts"]["byRepository"], {"vllm": 68, "vllm-ascend": 37})
        lookup = {e["workId"]: e for e in original}
        for row in rows:
            candidate = lookup[row["workId"]]
            self.assertEqual(row["originalCategory"], candidate["label"])
            self.assertEqual(row["originalSelectionReason"], candidate["reason"])
            self.assertEqual(row["dailyReportDay"], candidate["day"])
            self.assertEqual(row["decision"], "retained")
        checked = [r for r in rows if r["reviewLevel"] != "daily-report-index-only"]
        self.assertEqual(len(checked), 10)
        self.assertEqual(sum(r["prStatus"] is None for r in rows), 95)
        self.assertEqual(sum(r.get("originalPrTitle") is not None for r in rows), 10)

    def test_ten_primary_pr_records_are_auditable(self) -> None:
        records = self.cards["records"]
        self.assertEqual(len(records), 10)
        self.assertEqual(len({r["id"] for r in records}), 10)
        ids = set(self.report["synthesizedWorkIds"])
        refs = {r["id"]: r for r in self.report["references"]}
        for record in records:
            ref = refs[record["id"]]
            self.assertIn(ref["workId"], ids)
            self.assertRegex(record["sourceHead"], r"^[a-f0-9]{40}$")
            for field in ("mechanism", "environment", "revision", "workload", "result",
                          "negativeEvidence", "limitation", "verification", "sourceFile"):
                self.assertTrue(record[field].strip(), (record["id"], field))
            self.assertEqual(record["sourceIds"], [record["id"]])
        self.assertEqual(records, self.report["evidenceDetails"])

    def test_fixed_implementation_identity_and_stated_gaps(self) -> None:
        refs = {r["id"]: r for r in self.report["references"]}
        self.assertIn("0fc695fc6d1d82e9a5ac6835ac8e4e1c83703665", refs["D6"]["url"])
        self.assertIn("5cb98caaadeff42b5b62b996e34bb2aaa29d20fd", refs["D7"]["url"])
        self.assertTrue((FOLDER / "implementation-audit.md").is_file())
        ids = set(refs)
        for item in [*self.report["sections"], *self.report["gaps"], *self.report["taxonomy"]]:
            self.assertTrue(set(item["sourceIds"]).issubset(ids))
        self.assertEqual(len(self.report["gaps"]), 5)
        for gap in self.report["gaps"]:
            for field in ("strongestKnown", "hypothesis", "strongBaseline", "controls",
                          "metrics", "falsification"):
                self.assertTrue(gap[field].strip(), (gap["id"], field))
        self.assertEqual(len(self.report["researchQuestions"]), 4)
        self.assertTrue(self.report.get("centralQuestion"))
        self.assertEqual([s["id"] for s in self.report["sections"]],
                         ["spec-contract", "effective-cost", "candidate-methods",
                          "target-verification", "hybrid-state", "serving-runtime",
                          "cross-layer-evidence", "research-outlook"])
        self.assertEqual(len(self.report["bottleneckMigration"]), 4)
        self.assertEqual(len(self.report["conclusions"]), 4)
        self.assertTrue(all(s["subsections"] and s["conclusion"] for s in self.report["sections"]))
        self.assertTrue(all(gap.get("researchType") and gap.get("shortSummary") for gap in self.report["gaps"]))
        self.assertEqual(self.report["gaps"][4]["researchType"], "evaluation-method")
        self.assertEqual(len({part["title"] for sec in self.report["sections"] for part in sec["subsections"]}),
                         sum(len(sec["subsections"]) for sec in self.report["sections"]))
        for sec in self.report["sections"]:
            for part in sec["subsections"]:
                self.assertTrue(set(part["sourceIds"]).issubset(ids))
                self.assertTrue(set(part["sourceIds"]).issubset(set(sec["sourceIds"])))
        for row in [*self.report["bottleneckMigration"], *self.report["conclusions"]]:
            self.assertTrue(set(row["sourceIds"]).issubset(ids))

    def test_frozen_html_markdown_json_match_manifest(self) -> None:
        self.assertEqual(set(self.manifest["assets"]), {"report.json", "report.md", "report.html"})
        for filename, expected in self.manifest["assets"].items():
            data = (FOLDER / filename).read_bytes()
            self.assertEqual(len(data), expected["bytes"], filename)
            self.assertEqual(hashlib.sha256(data).hexdigest(), expected["sha256"], filename)
        markdown = (FOLDER / "report.md").read_text(encoding="utf-8")
        html = (FOLDER / "report.html").read_text(encoding="utf-8")
        self.assertIn("K=3", markdown)
        self.assertIn("## 7. 跨层证据综合", markdown)
        self.assertIn("### 3.4 块并行", markdown)
        self.assertIn("附录 D：Research Gaps", markdown)
        self.assertIn("chapter-8", html)
        self.assertLess(html.index('id="chapter-1"'), html.index('id="appendix-a"'))
        self.assertIn("source-ledger.json", html)
        self.assertIn("implementation-audit.md", markdown)
        for row in self.cards["records"]:
            self.assertIn(row["comparison"], markdown)
            self.assertIn(row["comparison"], html)


if __name__ == "__main__":
    unittest.main()

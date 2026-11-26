import copy
import json
import runpy
import tempfile
import unittest
from pathlib import Path

from report_archive import CHAPTERS


MODULE = runpy.run_path(str(Path(__file__).with_name("review-report-entries.py")))
DAY = "2026-11-20"
VERSION = "a" * 64
URL = "https://github.com/vllm-project/vllm/pull/123"
TIME = "2026-11-26T16:00:00+08:00"
PNG = b"\x89PNG\r\n\x1a\noriginal"


class EntryReviewTest(unittest.TestCase):
    def setUp(self):
        self.block = {"kind": "entry", "number": "V1", "workId": "github:vllm-project/vllm#123",
                      "title": "旧标题", "needsReview": True, "provisionalLocation": True,
                      "paragraphs": [[{"text": "问题：原问题。"}], [{"text": "效果与边界：原结果。"}],
                                     [{"text": "来源："}, {"text": "PR", "url": URL}]]}
        self.report = {"schemaVersion": 1, "sha256": VERSION, "day": DAY, "title": "日报",
                       "counts": {"upstream": 1, "ascend": 0, "papers": 0}, "intro": [], "warnings": [],
                       "sections": [{"key": key, "title": key, "blocks": []} for key in CHAPTERS]}
        self.report["sections"][1]["figure"] = f"{DAY}/{VERSION}/flow.png"
        self.report["sections"][6]["blocks"] = [{"kind": "group", "title": "专家计算"}, self.block]
        self.row = {"day": DAY, "number": "V1", "workId": self.block["workId"], "status": "passed",
                    "source_version": VERSION, "reason": "原始 PR 的代码和测试支持该结论。", "source_urls": [URL]}

    def revise(self, rows=None, **options):
        return MODULE["revision"](self.report, rows or [self.row], reviewer="Codex", reviewed_at=TIME,
                                  figure=PNG, **options)

    def test_checked_revision_keeps_original_and_unreviewed_entries(self):
        original = copy.deepcopy(self.report)
        other = {**copy.deepcopy(self.block), "number": "V2", "workId": "github:vllm-project/vllm#124"}
        self.report["sections"][6]["blocks"].append(other)
        result = self.revise()
        first, second = [block for _, block in MODULE["entries"](result)]
        self.assertFalse(first["needsReview"])
        self.assertFalse(first["provisionalLocation"])
        self.assertEqual(first["sourceReview"]["sources"], [URL])
        self.assertTrue(second["needsReview"])
        self.assertNotIn("sourceReview", second)
        self.assertTrue(self.report["sections"][6]["blocks"][1]["needsReview"])
        self.assertEqual(self.report["sha256"], original["sha256"])
        self.assertNotEqual(result["sha256"], VERSION)

    def test_unresolved_review_retains_warning(self):
        self.row["status"] = "unverified"
        result = self.revise()
        self.assertTrue(MODULE["entries"](result)[0][1]["needsReview"])
        self.assertTrue(MODULE["entries"](result)[0][1]["provisionalLocation"])

    def test_rejects_stale_or_mismatched_review_and_missing_evidence(self):
        for field, value in [("source_version", "b" * 64), ("number", "V2"), ("source_urls", []),
                             ("reason", "")]:
            with self.subTest(field=field):
                invalid = {**self.row, field: value}
                with self.assertRaises(ValueError):
                    self.revise([invalid])
        with self.assertRaises(ValueError):
            self.revise([self.row, self.row])

    def test_correction_preserves_primary_link_and_requires_replacement_for_move(self):
        self.row.update(status="corrected", changes={"stage": "prefill", "title": "预填充专家计算"})
        with self.assertRaisesRegex(ValueError, "flow figure"):
            self.revise()
        result = self.revise(replacement_figure=True)
        self.assertEqual(MODULE["entries"](result)[0][0]["key"], "prefill")
        self.assertEqual(MODULE["entries"](result)[0][1]["paragraphs"][-1], self.block["paragraphs"][-1])
        self.assertFalse(any(item["kind"] == "group" for item in result["sections"][6]["blocks"]))
        self.row["changes"] = {"paragraphs": [[{"text": "新正文"}], [{"text": "伪来源"}]]}
        with self.assertRaisesRegex(ValueError, "source links"):
            self.revise()

    def test_publish_preserves_old_files_and_moves_current_flow_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            MODULE["IMPORTER"]["save_report"](root, self.report, PNG, reviewed=True)
            old_path = root / DAY / VERSION / "report.json"
            old_bytes = old_path.read_bytes()
            MODULE["apply_reviews"](root, [self.row], reviewer="Codex", reviewed_at=TIME, publish=True)
            catalog = json.loads((root / "catalog.json").read_bytes())
            current = catalog["days"][DAY]["current"]
            self.assertNotEqual(current, VERSION)
            self.assertEqual(len(catalog["days"][DAY]["versions"]), 2)
            self.assertEqual(old_path.read_bytes(), old_bytes)
            self.assertEqual((root / DAY / current / "flow.png").read_bytes(), PNG)
            self.assertEqual(json.loads((root / "flow-index.json").read_bytes())["entries"][0]["version"], current)

    def test_stage_move_does_not_republish_the_former_chapter_intro(self):
        self.report["sections"][6]["intro"] = "旧解码导语"
        self.report["sections"][6]["blocks"].insert(0, {
            "kind": "paragraph", "parts": [{"text": "旧解码导语"}], "chapterIntro": True})
        self.report["sections"][6]["blocks"].append({**copy.deepcopy(self.block),
            "number": "V2", "workId": "github:vllm-project/vllm#124"})
        self.row.update(status="corrected", changes={"stage": "prefill"})
        result = self.revise(replacement_figure=True, editorial={"intros": {"prefill": "新预填充导语"}})
        self.assertNotIn("intro", result["sections"][6])
        self.assertNotIn("旧解码导语", json.dumps(result["sections"][6], ensure_ascii=False))
        self.assertEqual(result["sections"][4]["intro"], "新预填充导语")


if __name__ == "__main__":
    unittest.main()

import hashlib
import json
import runpy
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from report_archive import CHAPTERS


IMPORTER = runpy.run_path(str(Path(__file__).with_name("import-pipeline-report.py")))
PNG = b"\x89PNG\r\n\x1a\n"
DAY = "2026-11-09"


class PipelineReportTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.run_dir = self.root / "run"
        self.run_dir.mkdir()
        self.output = self.root / "site"
        self.content = {
            "chapter": "startup", "title_zh": "避免额外启动开销",
            "body": "原正文。\n\n适用边界。",
            "diagram_nodes": ["startup"], "location_basis": "reader_verified",
            "source_links": [{"label": "vLLM #123", "url": "https://github.com/vllm-project/vllm/pull/123"}],
        }
        self.entry = {
            "number": "V1",
            "card": {
                "card_id": "event", "source_type": "upstream", "work_id": "github:vllm-project/vllm#123",
                "needs_review": True, "content": self.content,
            },
        }
        self.report = {
            "schema_version": "daily-report/0.4", "day": DAY, "synthetic": False,
            "summary": "本日归纳", "coverage_notice": "仅覆盖已取材条目",
            "chapters": [{"key": key, "title": key, "groups": [], "intro": ""} for key in CHAPTERS[2:]],
            "numbers": {"event": "V1"},
            "diagram_numbers": {key: ["V1"] if key == "startup" else [] for key in CHAPTERS[2:-1]},
        }
        self.report["chapters"][0]["groups"] = [{"title": "准备", "entries": [self.entry]}]

    def write_run(self, status="complete_with_pending", synthetic=False):
        files = {"report.json": json.dumps(self.report).encode(), "flow.png": PNG}
        for name, data in files.items():
            (self.run_dir / name).write_bytes(data)
        manifest = {
            "schema_version": "daily-report-run/0.1", "status": status, "synthetic": synthetic,
            "artifacts": {name: hashlib.sha256(data).hexdigest() for name, data in files.items()},
        }
        (self.run_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    def load(self, **kwargs):
        return IMPORTER["load_run"](self.run_dir, **kwargs)

    def catalog(self):
        return json.loads((self.output / "catalog.json").read_bytes())["days"][DAY]

    def flow(self):
        return json.loads((self.output / "flow-index.json").read_bytes())["entries"]

    def archive_files(self):
        return {path.relative_to(self.output): path.read_bytes() for path in self.output.rglob("*")
                if path.is_file()}

    def invoke(self, *options):
        stdout, stderr = StringIO(), StringIO()
        main = IMPORTER["main"]
        with patch.dict(main.__globals__, {"PUBLIC": self.root / "public"}):
            with redirect_stdout(stdout), redirect_stderr(stderr):
                status = main([str(self.run_dir), *options])
        return status, stdout.getvalue(), stderr.getvalue()

    def test_projection_preserves_text_links_review_and_verified_placement(self):
        self.write_run()
        report, figure, metadata = self.load(expected_day=DAY)
        block = report["sections"][2]["blocks"][1]
        self.assertEqual(len(report["sections"]), 11)
        self.assertEqual(block["number"], "V1")
        self.assertEqual(block["paragraphs"][0][0]["text"], "原正文。\n\n适用边界。")
        self.assertEqual(block["paragraphs"][1][1]["url"], self.content["source_links"][0]["url"])
        self.assertTrue(block["needsReview"])
        self.assertFalse(block["provisionalLocation"])
        self.assertEqual(report["counts"], {"upstream": 1, "ascend": 0, "papers": 0})
        self.assertEqual(metadata["version_sha256"], report["sha256"])
        self.assertEqual(figure, PNG)

    def test_intro_projection_and_revision_identity(self):
        intro = "  权重加载的重复开销增加了启动等待。  "
        self.report["chapters"][0]["intro"] = intro
        self.write_run()
        report, figure, _ = self.load()
        self.assertNotIn("intro", report["sections"][0])
        self.assertNotIn("intro", report["sections"][1])
        self.assertEqual(report["sections"][2]["intro"], intro)
        self.assertTrue(report["sections"][2]["blocks"][0]["chapterIntro"])
        IMPORTER["save_report"](self.output, report, figure)
        chapters = json.loads((self.output / "flow-index.json").read_bytes())["chapters"]
        self.assertEqual(chapters, [{
            "day": DAY, "version": report["sha256"], "stage": "startup", "title": "startup",
            "intro": intro, "sources": ["github:vllm-project/vllm"],
            "workIds": ["github:vllm-project/vllm#123"],
        }])
        self.report["chapters"][0]["intro"] = "修订后的导语。"
        self.write_run()
        revision, figure, _ = self.load()
        self.assertNotEqual(revision["sha256"], report["sha256"])
        IMPORTER["save_report"](self.output, revision, figure)
        self.assertEqual(json.loads((self.output / "flow-index.json").read_bytes())["chapters"][0]["intro"], intro)
        IMPORTER["save_report"](self.output, revision, figure, promote=True)
        self.assertEqual(json.loads((self.output / "flow-index.json").read_bytes())["chapters"][0]["intro"], "修订后的导语。")

    def test_intro_only_input_and_unavailable_placeholders(self):
        self.report["chapters"][0]["intro"] = "短请求因队列中的长请求而增加等待。"
        self.write_run()
        report, _, _ = self.load()
        section = report["sections"][2]
        self.assertEqual(section["intro"], self.report["chapters"][0]["intro"])
        self.assertTrue(section["blocks"][0]["chapterIntro"])
        for unavailable in (
            "本章条目按下列主题展开，具体事实见各条正文。",
            "本章组稿生成待核查，以下按原卡片保留本次已收录条目。",
            "本日未收录新的相关论文。",
        ):
            self.report["chapters"][0]["intro"] = unavailable
            self.write_run()
            section = self.load()[0]["sections"][2]
            self.assertNotIn("intro", section)
            self.assertEqual(section["blocks"][0]["parts"][0]["text"], unavailable)

    def test_intro_type_and_absence(self):
        for value in (None, 12, True, [], {}):
            with self.subTest(value=value):
                self.report["chapters"][0]["intro"] = value
                self.write_run()
                with self.assertRaisesRegex(ValueError, "导语"):
                    self.load()
        self.report["chapters"][0]["intro"] = ""
        self.write_run()
        self.assertNotIn("intro", self.load()[0]["sections"][2])

    def test_same_day_stays_current_until_promotion_and_reimport_is_idempotent(self):
        save = IMPORTER["save_report"]
        self.write_run()
        first, figure, _ = self.load()
        save(self.output, first, figure)
        self.content["title_zh"] = "修订标题"
        self.write_run()
        revised, figure, _ = self.load()
        save(self.output, revised, figure)
        before = self.archive_files()
        save(self.output, revised, figure)
        self.assertEqual(self.archive_files(), before)
        self.assertEqual(self.catalog()["current"], first["sha256"])
        self.assertEqual(len(self.catalog()["versions"]), 2)
        self.assertEqual(self.flow()[0]["version"], first["sha256"])
        save(self.output, revised, figure, promote=True)
        save(self.output, first, figure)
        self.assertEqual(self.catalog()["current"], revised["sha256"])
        self.assertEqual(self.flow()[0]["title"], "修订标题")
        self.assertTrue((self.output / DAY / first["sha256"] / "report.json").is_file())

    def test_rejects_tampered_artifact_failed_run_and_synthetic_run(self):
        self.write_run()
        (self.run_dir / "report.json").write_bytes(b"{}")
        with self.assertRaisesRegex(ValueError, "哈希"):
            self.load()
        self.write_run("failed")
        with self.assertRaisesRegex(ValueError, "尚未交付"):
            self.load()
        self.write_run(synthetic=True)
        with self.assertRaisesRegex(ValueError, "合成样例"):
            self.load()

    def test_rejects_unsafe_or_wrong_pr_links_and_inconsistent_index(self):
        link = self.content["source_links"][0]
        correct = link["url"]
        link["url"] = "javascript:alert(1)"
        self.write_run()
        with self.assertRaisesRegex(ValueError, "不安全"):
            self.load()
        link["url"] = correct.replace("123", "456")
        self.write_run()
        with self.assertRaisesRegex(ValueError, "原文链接"):
            self.load()
        link["url"] = correct
        self.report["diagram_numbers"]["startup"] = []
        self.write_run()
        with self.assertRaisesRegex(ValueError, "流程图索引"):
            self.load()

    def test_publish_requires_matching_date_and_review_of_the_exact_bundle(self):
        self.write_run()
        status, stdout, _ = self.invoke("--inspect")
        self.assertEqual(status, 0)
        approved = json.loads(stdout)["bundle_sha256"]
        public = self.root / "public"
        status, _, error = self.invoke("--publish", "--reviewed-sha256", approved,
                                       "--expected-day", "2026-11-10")
        self.assertEqual(status, 1)
        self.assertIn("日期", error)
        self.assertFalse(public.exists())
        self.assertEqual(self.invoke("--publish")[0], 1)
        self.assertEqual(self.invoke("--output", str(public / "word-reports"))[0], 1)
        manifest = self.run_dir / "manifest.json"
        original = manifest.read_bytes()
        manifest.write_bytes(original + b"\n")
        status, _, error = self.invoke("--publish", "--reviewed-sha256", approved)
        self.assertEqual(status, 1)
        self.assertIn("复核指纹", error)
        self.assertFalse(public.exists())
        manifest.write_bytes(original)
        status, stdout, _ = self.invoke("--publish", "--reviewed-sha256", approved,
                                        "--expected-day", DAY)
        self.assertEqual(status, 0)
        version = json.loads(stdout)["version_sha256"]
        report = json.loads((public / "word-reports" / DAY / version / "report.json").read_bytes())
        self.assertEqual(report["publicationStatus"], "reviewed")

    def test_bad_existing_archive_is_rejected_before_a_new_revision_is_written(self):
        self.write_run()
        first, figure, _ = self.load()
        IMPORTER["save_report"](self.output, first, figure)
        (self.output / DAY / first["sha256"] / "report.json").write_bytes(b"broken")
        before = self.archive_files()
        self.content["title_zh"] = "修订标题"
        self.write_run()
        revised, figure, _ = self.load()
        with self.assertRaises(ValueError):
            IMPORTER["save_report"](self.output, revised, figure)
        self.assertEqual(self.archive_files(), before)


if __name__ == "__main__":
    unittest.main()

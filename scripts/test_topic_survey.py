"""Accepted synthesis must remain attached to its exact reviewed evidence."""

from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from topic_survey import PENDING_REVIEW, REPO, import_survey, validate_survey


def document():
    return {
        "schemaVersion": 1,
        "reportVersion": "a" * 64,
        "paperVersion": "b" * 64,
        "reviewedAt": "2026-11-18",
        "thesis": "Explain mechanisms before judging the remaining evidence.",
        "routes": [{
            "id": "dynamic-state", "title": "Dynamic state", "problem": "State changes between replays.",
            "mechanism": ["Update persistent buffers.", "Order consumers after producers."],
            "assessment": "A trace supports the removed copy.", "limitation": "Service impact remains uncertain.",
            "sourceIds": ["E1", "D1"], "evidenceIds": ["trace"], "gapIds": ["state"],
            "paperSection": "7.1", "paperAnchor": "可组合的状态有效性契约",
        }],
        "update": {
            "summary": "The latest review narrows the claim.", "previousRevision": 2,
            "evidence": [{"title": "Trace review", "change": "Count tasks separately from requests.",
                          "sourceIds": ["E1"], "evidenceIds": ["trace"]}],
            "nextGapIds": ["state"],
        },
        "researchAssessment": {
            "asOf": "2026-11-17", "scope": "Existing local records", "summary": "No confirmed research gap.",
            "decisions": [{"gapId": "state", "decision": "missing_evidence", "reason": "No controlled residual impact.",
                           "reopenWhen": "A reproducible service trace shows residual waiting.",
                           "sourceUrls": ["https://github.com/vllm-project/vllm-ascend/pull/21191"]}],
        },
        "pendingQuestions": [{"workId": "github:vllm-project/vllm-ascend#21373", "routeIds": ["dynamic-state"],
                              "question": "Does preparation move off the request path?", "missingEvidence": "NPU traces."}],
    }


def topic():
    return {
        "id": "aclgraph", "title": "ACL Graph", "entries": [{"title": "Untouched candidate"}],
        "report": {
            "version": "a" * 64, "revision": 3, "previousVersion": "c" * 64,
            "references": [{"id": "E1"}, {"id": "D1"}],
            "evidenceDetails": [{"id": "trace", "sourceIds": ["E1"]}],
            "gaps": [{"id": "state", "sourceIds": ["E1", "D1"]}],
            "pendingEvidence": [{"workId": "github:vllm-project/vllm-ascend#21373"}],
        },
        "academicPaper": {"version": "b" * 64, "assets": {"html": {"path": "paper/report.html"}}},
    }


class TopicSurveyTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.index = self.root / "topics.json"
        self.source = self.root / "accepted-survey.json"
        self.original = {"schemaVersion": 2, "topics": [topic(), {"id": "kv-cache", "report": {"untouched": True}}]}
        self.index.write_text(json.dumps(self.original), encoding="utf-8")
        self.source.write_text(json.dumps(document()), encoding="utf-8")
        (self.root / "paper").mkdir()
        (self.root / "paper/report.html").write_text('<h2 id="可组合的状态有效性契约">7.1</h2>', encoding="utf-8")
        old = self.root / "topic-reports/aclgraph" / ("c" * 64)
        old.mkdir(parents=True)
        (old / "report.json").write_text('{"revision": 2}', encoding="utf-8")
        accepted = self.root / "topic-reports/aclgraph" / ("a" * 64)
        accepted.mkdir(parents=True)
        (accepted / "report.json").write_text(json.dumps(topic()["report"]), encoding="utf-8")
        paper = self.root / "topic-papers/aclgraph" / ("b" * 64)
        paper.mkdir(parents=True)
        (paper / "paper.html").write_text('<h2 id="可组合的状态有效性契约">7.1</h2>', encoding="utf-8")
        (paper / "manifest.json").write_text(json.dumps({
            "topicId": "aclgraph", "version": "b" * 64, "assets": {"paper.html": {}},
        }), encoding="utf-8")

    def test_accepts_unicode_anchor_and_preserves_every_other_field(self):
        assets = {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        self.assertTrue(import_survey(self.source, self.index))
        imported = json.loads(self.index.read_text(encoding="utf-8"))
        self.assertEqual(imported["topics"][0].pop("survey"), document())
        self.assertEqual(imported, self.original)
        self.assertFalse(import_survey(self.source, self.index, check=True))
        before = self.index.read_bytes()
        self.assertFalse(import_survey(self.source, self.index))
        self.assertEqual(before, self.index.read_bytes())
        for path, content in assets.items():
            if path != self.index:
                self.assertEqual(path.read_bytes(), content)

    def test_rejects_unknown_ids_and_inconsistent_evidence_bindings(self):
        for field in ("sourceIds", "evidenceIds", "gapIds"):
            with self.subTest(field=field):
                survey = document()
                survey["routes"][0][field] = ["missing"]
                with self.assertRaisesRegex(ValueError, "unresolved"):
                    validate_survey(survey, topic())
        survey = document()
        survey["routes"][0]["sourceIds"] = ["D1"]
        with self.assertRaisesRegex(ValueError, "evidence sources"):
            validate_survey(survey, topic())
        survey = document()
        survey["routes"][0]["sourceIds"] = ["E1"]
        with self.assertRaisesRegex(ValueError, "gap sources"):
            validate_survey(survey, topic())
        survey = document()
        survey["update"]["evidence"][0]["sourceIds"] = ["D1"]
        with self.assertRaisesRegex(ValueError, "evidence sources"):
            validate_survey(survey, topic())

    def test_route_ids_match_the_runtime_lowercase_hyphen_contract(self):
        for invalid in ("State", "dynamic_state", "state.value", "state:value"):
            with self.subTest(route_id=invalid):
                survey = document()
                survey["routes"][0]["id"] = invalid
                with self.assertRaisesRegex(ValueError, "route.id"):
                    validate_survey(survey, topic())

    def test_new_version_without_published_synthesis_allows_explicit_pending_review(self):
        for field in ("report", "academicPaper"):
            with self.subTest(changed=field):
                updated = json.loads(json.dumps(self.original))
                updated["topics"][0][field]["version"] = "d" * 64
                self.index.write_text(json.dumps(updated), encoding="utf-8")
                before = self.index.read_bytes()
                self.assertEqual(import_survey(self.source, self.index, check=True), PENDING_REVIEW)
                self.assertEqual(before, self.index.read_bytes())
        result = subprocess.run([
            sys.executable, "-X", "utf8", str(REPO / "scripts/import-topic-survey.py"),
            "--source", str(self.source), "--topics-index", str(self.index), "--check",
        ], capture_output=True, text=True, encoding="utf-8", check=True)
        self.assertIn("synthesis pending review", result.stdout)
        self.assertNotIn("synthesis verified", result.stdout)

    def test_same_version_missing_or_published_stale_synthesis_is_never_pending_review(self):
        with self.assertRaisesRegex(ValueError, "differs"):
            import_survey(self.source, self.index, check=True)
        updated = json.loads(json.dumps(self.original))
        updated["topics"][0]["report"]["version"] = "d" * 64
        for published in (document(), None):
            with self.subTest(published=published is not None):
                updated["topics"][0]["survey"] = published
                self.index.write_text(json.dumps(updated), encoding="utf-8")
                before = self.index.read_bytes()
                with self.assertRaisesRegex(ValueError, "different version"):
                    import_survey(self.source, self.index, check=True)
                self.assertEqual(before, self.index.read_bytes())

    def test_stale_source_cannot_be_imported_and_bad_historical_citations_still_fail(self):
        updated = json.loads(json.dumps(self.original))
        updated["topics"][0]["report"]["version"] = "d" * 64
        self.index.write_text(json.dumps(updated), encoding="utf-8")
        before = self.index.read_bytes()
        with self.assertRaisesRegex(ValueError, "different version"):
            import_survey(self.source, self.index)
        bad = document()
        bad["routes"][0]["sourceIds"] = ["missing"]
        self.source.write_text(json.dumps(bad), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "unresolved"):
            import_survey(self.source, self.index, check=True)
        self.assertEqual(before, self.index.read_bytes())

    def test_rejects_stale_versions_unsafe_ids_and_missing_text(self):
        cases = []
        for field in ("reportVersion", "paperVersion"):
            survey = document()
            survey[field] = "d" * 64
            cases.append(survey)
        for field, value in (("id", "../state"), ("title", " "), ("paperAnchor", 'bad"anchor')):
            survey = document()
            survey["routes"][0][field] = value
            cases.append(survey)
        survey = document()
        survey["routes"].append(deepcopy(survey["routes"][0]))
        cases.append(survey)
        for survey in cases:
            with self.subTest(survey=survey):
                with self.assertRaises(ValueError):
                    validate_survey(survey, topic())

    def test_requires_real_paper_anchor_and_predecessor(self):
        survey = document()
        survey["routes"][0]["paperAnchor"] = "missing-anchor"
        with self.assertRaisesRegex(ValueError, "absent"):
            validate_survey(survey, topic(), self.root)
        survey = document()
        survey["update"]["previousRevision"] = 1
        with self.assertRaisesRegex(ValueError, "predecessor"):
            validate_survey(survey, topic(), self.root)

    def test_taxonomy_citations_must_resolve_in_the_bound_manuscript(self):
        survey = document()
        survey["routes"][0]["subcategories"] = [
            {"title": "Graph capture", "works": [{"label": "A representative paper", "reference": 5}]}
        ]
        validate_survey(survey, topic())
        with self.assertRaisesRegex(ValueError, "reference: absent"):
            validate_survey(survey, topic(), self.root)
        with (self.root / "paper/report.html").open("a", encoding="utf-8") as stream:
            stream.write('<p id="ref-5">A representative paper</p>')
        validate_survey(survey, topic(), self.root)
        for invalid in (0, -1, 1.5, "5", True, None):
            with self.subTest(reference=invalid):
                survey["routes"][0]["subcategories"][0]["works"][0]["reference"] = invalid
                with self.assertRaisesRegex(ValueError, "positive integer"):
                    validate_survey(survey, topic())

    def test_taxonomy_requires_nonempty_categories_and_named_works(self):
        for invalid in (None, [], [{"title": " ", "works": []}],
                        [{"title": "Capture", "works": []}],
                        [{"title": "Capture", "works": [{"label": " ", "reference": 1}]}]):
            with self.subTest(subcategories=invalid):
                survey = document()
                survey["routes"][0]["subcategories"] = invalid
                with self.assertRaisesRegex(ValueError, "subcategories"):
                    validate_survey(survey, topic())

    def test_rejects_unknown_pending_work_routes_and_feedback(self):
        for field, value in (("workId", "github:vllm-project/vllm#999"), ("routeIds", ["unknown"])):
            survey = document()
            survey["pendingQuestions"][0][field] = value
            with self.assertRaises(ValueError):
                validate_survey(survey, topic())
        for field, value in (("gapId", "unknown"), ("decision", "confirmed"), ("sourceUrls", ["javascript:alert(1)"])):
            survey = document()
            survey["researchAssessment"]["decisions"][0][field] = value
            with self.assertRaises(ValueError):
                validate_survey(survey, topic())

    def test_check_never_writes_and_invalid_import_leaves_index_unchanged(self):
        before = self.index.read_bytes()
        with self.assertRaisesRegex(ValueError, "differs"):
            import_survey(self.source, self.index, check=True)
        self.assertEqual(before, self.index.read_bytes())
        survey = document()
        survey["reportVersion"] = "d" * 64
        self.source.write_text(json.dumps(survey), encoding="utf-8")
        with self.assertRaises(ValueError):
            import_survey(self.source, self.index)
        self.assertEqual(before, self.index.read_bytes())

    def test_failed_atomic_replacement_leaves_original_index_and_no_temp_file(self):
        before = self.index.read_bytes()
        with patch("topic_survey.os.replace", side_effect=OSError("simulated failure")):
            with self.assertRaisesRegex(OSError, "simulated failure"):
                import_survey(self.source, self.index)
        self.assertEqual(before, self.index.read_bytes())
        self.assertFalse(list(self.root.glob(".topic-survey-*")))

    def test_repository_accepted_synthesis_matches_its_served_projection(self):
        import_survey(REPO / "topics/aclgraph/survey.json", REPO / "public/word-reports/topics.json", check=True)


if __name__ == "__main__":
    unittest.main()

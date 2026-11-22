"""SpecDec living synthesis must retain first-version evidence while supporting future updates."""
import json
from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from topic_survey import validate_survey

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "public/word-reports/topics.json"
SOURCE = ROOT / "topics/speculative-decoding/survey.json"


class SpecDecLivingTopic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        index = json.loads(INDEX.read_text(encoding="utf-8"))
        cls.topic = next(t for t in index["topics"] if t["id"] == "speculative-decoding")
        cls.acl = next(t for t in index["topics"] if t["id"] == "aclgraph")
        cls.survey = json.loads(SOURCE.read_text(encoding="utf-8"))

    def test_versioned_synthesis_tracks_academic_paper_and_report(self):
        self.assertIn("academicPaper", self.topic)
        self.assertEqual(self.survey["paperVersion"], self.topic["academicPaper"]["version"])
        self.assertEqual(self.topic["survey"], self.survey)
        self.assertEqual(self.survey["reportVersion"], self.topic["report"]["version"])
        self.assertIs(validate_survey(self.survey, self.topic, INDEX.parent), self.survey)
        self.assertIn("paperVersion", self.acl["survey"])

    def test_four_technical_paths_are_traceable(self):
        self.assertEqual([x["id"] for x in self.survey["routes"]],
                         ["candidate", "verification", "accepted-state", "runtime"])
        report = self.topic["report"]
        self.assertEqual(len(report["sections"]), 8)
        self.assertEqual(len(report["researchQuestions"]), 4)
        self.assertEqual(len(report["evidenceDetails"]), 10)
        self.assertEqual(len(self.topic["survey"]["candidateBaseline"]), 105)
        self.assertEqual(len(self.topic["entries"]), 125)
        self.assertEqual(len(report["bottleneckMigration"]), 4)
        self.assertEqual(len(self.survey["update"]["evidence"]), 4)
        refs = {x["id"] for x in report["references"]}
        for route in self.survey["routes"]:
            self.assertTrue(set(route["sourceIds"]) <= refs)
            self.assertTrue(route["mechanism"] and route["assessment"] and route["limitation"])

    def test_old_acl_synthesis_remains_untouched(self):
        self.assertTrue(self.acl["academicPaper"])
        self.assertEqual(self.acl["survey"]["reportVersion"], self.acl["report"]["version"])

    def test_invalid_or_stale_evidence_fails_closed(self):
        stale = deepcopy(self.survey)
        stale["reportVersion"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "version"):
            validate_survey(stale, self.topic)
        invalid = deepcopy(self.survey)
        invalid["routes"][0]["sourceIds"] = ["E1"]
        with self.assertRaisesRegex(ValueError, "evidence sources"):
            validate_survey(invalid, self.topic)
        spoof = deepcopy(self.survey)
        spoof["paperVersion"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "different version"):
            validate_survey(spoof, self.topic)


if __name__ == "__main__":
    unittest.main()

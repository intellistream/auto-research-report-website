"""Regression checks for the 2026-11-17 SpecDec candidate curation snapshot.

Only the topic index is curated here. Historical daily reports are immutable.
"""

import json
import unittest
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "public" / "word-reports" / "topics.json"
AUDIT = ROOT / "docs" / "topic-reviews" / "speculative-decoding-exclusions-20261117.json"

EXPECTED = {
    "vllm": {
        60895, 61498, 61942, 62091, 62101, 63101, 63568,
        63971, 64828, 64852, 64898, 65463, 66485,
    },
    "vllm-ascend": {
        18053, 19851, 19868, 19869, 19898, 19911,
        19971, 20194, 20344, 20489, 20820,
    },
}


class SpeculativeTopicCurationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = json.loads(INDEX.read_text(encoding="utf-8"))
        cls.audit = json.loads(AUDIT.read_text(encoding="utf-8"))
        cls.topics = {item["id"]: item for item in cls.index["topics"]}
        cls.topic = cls.topics["speculative-decoding"]
        cls.entries = cls.topic["entries"]

    def test_scope_and_original_provenance(self):
        self.assertEqual(self.index["schemaVersion"], 2)
        self.assertEqual(self.audit["schemaVersion"], 1)
        self.assertEqual(self.audit["topicId"], "speculative-decoding")
        self.assertEqual(
            self.audit["originalIndexBlobSha"],
            "bfa458918c3539807a33deab9e1736fa24a85829",
        )
        self.assertEqual(
            self.audit["sourceScope"],
            {
                "firstDay": "2026-10-22",
                "lastDay": "2026-11-11",
                "days": 21,
                "archivePrCount": 520,
                "initialCandidatePrCount": 105,
                "initialByRepository": {"vllm": 68, "vllm-ascend": 37},
            },
        )
        self.assertEqual(
            self.topic["coverage"],
            {"days": 21, "firstDay": "2026-10-22", "lastDay": "2026-11-11", "prs": 520},
        )

    def test_exact_exclusions_have_unique_source_identity(self):
        exclusions = self.audit["exclusions"]
        self.assertEqual(len(exclusions), 24)
        expected_ids = {
            f"github:vllm-project/{repo}#{number}"
            for repo, numbers in EXPECTED.items()
            for number in numbers
        }
        actual_ids = [item["workId"] for item in exclusions]
        self.assertEqual(set(actual_ids), expected_ids)
        self.assertEqual(len(set(actual_ids)), len(actual_ids))
        for item in exclusions:
            self.assertTrue(item["reason"].strip())
            self.assertTrue(item["redirectTopic"].strip())
            prefix, number = item["workId"].removeprefix("github:").split("#")
            self.assertEqual(item["url"], f"https://github.com/{prefix}/pull/{number}")
            self.assertTrue(item["day"].startswith("2026-"))

    def test_remaining_candidates_and_counts(self):
        self.assertEqual(len(self.entries), 81)
        ids = [entry["workId"] for entry in self.entries]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(set(ids).isdisjoint(item["workId"] for item in self.audit["exclusions"]))
        self.assertTrue(all(entry["method"] == "rule" for entry in self.entries))
        counts = self.topic["counts"]
        self.assertEqual(counts["total"], 81)
        self.assertEqual(counts["manualExcluded"], 24)
        self.assertEqual(counts["manualIncluded"], 0)
        self.assertEqual(counts["byRepository"], dict(Counter(e["repository"] for e in self.entries)))
        self.assertEqual(counts["byLabel"], dict(Counter(e["label"] for e in self.entries)))
        self.assertEqual(counts["byRepository"], {"vllm": 55, "vllm-ascend": 26})
        self.assertEqual(counts["byLabel"], {"methods": 48, "runtime": 6, "verification": 27})

    def test_other_topics_keep_their_indices(self):
        self.assertEqual(set(self.topics), {"aclgraph", "kv-cache", "speculative-decoding"})
        self.assertEqual(len(self.topics["aclgraph"]["entries"]), 11)
        self.assertIn("report", self.topics["aclgraph"])
        self.assertIn("academicPaper", self.topics["aclgraph"])
        self.assertEqual(len(self.topics["kv-cache"]["entries"]), 73)


if __name__ == "__main__":
    unittest.main()

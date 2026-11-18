"""Preserve the original 105 community-classified speculative decoding PRs.

New future PRs can be added; the 2026-11-17 baseline cannot be silently
reclassified or dropped. No opinionated topic-pruning policy is applied here.
"""

import json
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "public" / "word-reports" / "topics.json"
# Each entry is 'PR_NUMBER/original_label'; source grouping and labels are frozen.
BASELINE = {
    "vllm": """52921/runtime 57770/verification 59774/methods 60229/verification 60532/methods 60895/verification 61435/verification 61498/runtime 61589/methods 61855/verification 61942/methods 62091/verification 62101/runtime 62769/methods 62784/methods 62994/methods 63096/verification 63101/runtime 63102/methods 63219/methods 63245/verification 63421/methods 63431/methods 63440/verification 63444/runtime 63527/methods 63528/verification 63532/verification 63554/methods 63568/runtime 63638/verification 63710/verification 63801/methods 63819/methods 63886/verification 63921/verification 63971/verification 64033/verification 64109/methods 64442/methods 64612/methods 64659/methods 64828/runtime 64829/methods 64852/methods 64898/methods 64915/verification 64916/methods 64948/runtime 64950/methods 65103/verification 65175/verification 65182/methods 65217/methods 65421/methods 65463/methods 65488/methods 65553/methods 65619/methods 65874/methods 66324/methods 66485/runtime 66595/verification 66612/verification 66652/verification 66764/methods 66865/methods 67034/verification""".split(),
    "vllm-ascend": """17147/verification 18053/methods 18236/methods 18717/methods 18931/verification 19512/verification 19550/methods 19682/methods 19724/verification 19753/verification 19840/runtime 19851/methods 19868/runtime 19869/runtime 19898/runtime 19911/methods 19954/runtime 19971/runtime 20006/methods 20060/runtime 20194/runtime 20254/methods 20279/methods 20344/verification 20345/verification 20489/methods 20566/methods 20755/methods 20820/methods 21075/methods 21209/methods 21281/methods 21403/methods 21430/methods 21435/methods 21444/methods 21512/methods""".split(),
}


class SpecDecTopicSourceTest(unittest.TestCase):
    def test_preserves_community_prs_and_labels(self):
        index = json.loads(INDEX.read_text(encoding="utf-8"))
        topic = next(t for t in index["topics"] if t["id"] == "speculative-decoding")
        entries = topic["entries"]
        current = {
            f'{e["repository"]}:{e["workId"].rsplit("#", 1)[1]}/{e["label"]}'
            for e in entries
        }
        expected = {
            f"{repo}:{number_label}"
            for repo, values in BASELINE.items()
            for number_label in values
        }
        self.assertEqual(sum(len(values) for values in BASELINE.values()), 105)
        self.assertTrue(expected.issubset(current), "An originally classified PR was removed or relabeled")
        self.assertEqual(len(entries), len({entry["workId"] for entry in entries}))
        counts = topic["counts"]
        self.assertEqual(counts["total"], len(entries))
        self.assertEqual(counts["byRepository"], dict(Counter(e["repository"] for e in entries)))
        self.assertEqual(counts["byLabel"], dict(Counter(e["label"] for e in entries)))
        self.assertEqual(counts["manualExcluded"], 0)
        # Archive-level coverage is independent of the number of topic leads.
        self.assertGreaterEqual(topic["coverage"]["prs"], len(entries))


if __name__ == "__main__":
    unittest.main()

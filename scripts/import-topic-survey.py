"""Install or check an accepted, version-bound topic synthesis."""

import argparse
from pathlib import Path
import sys

from topic_survey import PENDING_REVIEW, REPO, import_survey


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=REPO / "topics/aclgraph/survey.json")
    parser.add_argument("--topics-index", type=Path, default=REPO / "public/word-reports/topics.json")
    parser.add_argument("--topic", default="aclgraph")
    parser.add_argument("--check", action="store_true", help="Check the accepted projection, or allow a new evidence version without its stale guide pending review")
    args = parser.parse_args()
    try:
        changed = import_survey(args.source, args.topics_index, args.topic, check=args.check)
    except (ValueError, KeyError, TypeError, OSError) as exc:
        print(f"Topic synthesis failed: {exc}", file=sys.stderr)
        return 1
    if changed == PENDING_REVIEW:
        print(f"{args.topic}: synthesis pending review; using current report structure (旧导读待复核，按当前报告组织页面)")
    else:
        print(f"{args.topic}: synthesis {'verified' if args.check else 'imported' if changed else 'unchanged'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Build-time publication of the verified SpecDec academic-paper snapshot.

The academic importer remains staging-only. This command promotes the validated
snapshot into the local static site on the dedicated editorial branch.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TOPIC = "speculative-decoding"
SOURCE = ROOT / "topics" / TOPIC / "paper"
INDEX = ROOT / "public" / "word-reports" / "topics.json"
SURVEY = ROOT / "topics" / TOPIC / "survey.json"
BRANCH = "research/specdec-academic-survey-20261118"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publish", action="store_true", help="write validated assets into the static site")
    args = parser.parse_args()
    if not args.publish:
        parser.error("explicit --publish is required")
    active = os.environ.get("GITHUB_REF_NAME")
    if active and active != BRANCH:
        raise SystemExit(f"Refusing to publish on {active}; expected {BRANCH}")
    if not all((SOURCE / name).is_file() for name in ("paper.md", "references.bib", "paper.tex", "paper.html", "paper.pdf")):
        raise SystemExit("Build paper.md, references.bib, paper.tex, paper.html and paper.pdf first")

    with tempfile.TemporaryDirectory(prefix="specdec-paper-stage-") as temp:
        staging = Path(temp)
        subprocess.run([
            sys.executable, str(ROOT / "scripts" / "import-academic-paper.py"),
            "--topic", TOPIC, "--source", str(SOURCE),
            "--output", str(staging), "--topics-index", str(INDEX),
            "--literature-cutoff", "2026-11-18",
            "--manuscript-revision", "academic-survey-review-20261119",
        ], check=True, cwd=ROOT)
        result = json.loads((staging / "import-result.json").read_text(encoding="utf-8"))
        checks = result["htmlChecks"]
        if not (checks["scriptFreeAndSelfContained"] and checks["allInternalTargetsExist"]
                and checks["allInlineCitationTargetsExist"] and checks["embeddedFigures"] >= 2
                and checks["mathML"] >= 1):
            raise SystemExit(f"Academic paper HTML failed semantic checks: {checks}")
        candidate = json.loads((staging / "word-reports" / "topics.json").read_text(encoding="utf-8"))
        paper = next(topic for topic in candidate["topics"] if topic["id"] == TOPIC)["academicPaper"]
        survey = json.loads(SURVEY.read_text(encoding="utf-8"))
        survey["paperVersion"] = paper["version"]
        # A living topic survey is bound to both its report and its current
        # academic paper; every route must point to a real Pandoc heading.
        section_by_route = {
            "candidate": ("4", "drafting"),
            "verification": ("5", "verification"),
            "accepted-state": ("6", "runtime"),
            "runtime": ("7", "serving"),
        }
        route_ids = {route["id"] for route in survey["routes"]}
        if route_ids != section_by_route.keys():
            raise SystemExit("SpecDec survey routes changed; update paper binding explicitly")
        for route in survey["routes"]:
            route["paperSection"], route["paperAnchor"] = section_by_route[route["id"]]
        from html.parser import HTMLParser

        class HeadingIds(HTMLParser):
            def __init__(self):
                super().__init__()
                self.ids = set()
            def handle_starttag(self, tag, attrs):
                if tag in {"h1", "h2", "h3"}:
                    self.ids.update(value for key, value in attrs if key == "id")
        headings = HeadingIds()
        headings.feed((SOURCE / "paper.html").read_text(encoding="utf-8"))
        if not all(route["paperAnchor"] in headings.ids for route in survey["routes"]):
            raise SystemExit("Survey route is not a heading in the frozen academic paper")
        next(topic for topic in candidate["topics"] if topic["id"] == TOPIC)["survey"] = survey
        relative = Path("topic-papers") / TOPIC / paper["version"]
        src = staging / "word-reports" / relative
        dest = INDEX.parent / relative
        if dest.exists():
            if {p.name: p.read_bytes() for p in dest.iterdir()} != {p.name: p.read_bytes() for p in src.iterdir()}:
                raise SystemExit("Published paper version conflicts with existing asset bytes")
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src, dest)
        INDEX.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SURVEY.write_text(json.dumps(survey, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "topic": TOPIC, "version": paper["version"],
            "publication": str(dest.relative_to(ROOT)),
            "assetCount": len(paper["assets"]), "checks": checks,
            "surveyPaperVersion": survey["paperVersion"]
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Build-time publication of the verified SpecDec academic-paper snapshot.

The academic importer remains staging-only. This command promotes the validated
snapshot into the local static site on the dedicated editorial branch.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
TOPIC = "speculative-decoding"
INDEX = ROOT / "public" / "word-reports" / "topics.json"
SURVEY = ROOT / "topics" / TOPIC / "survey.json"


def verify_author_build(source):
    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("language") != "zh-CN" or manifest.get("sourceDirty") is not False or not manifest.get("sourceCommit"):
        raise SystemExit("Expected a clean versioned Chinese manuscript build")
    for name in ("paper.md", "references.bib", "paper.tex", "paper.html", "paper.pdf", "paper.docx", "sources.zip"):
        data = (source / name).read_bytes()
        if not data or manifest["artifacts"].get(name) != {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}:
            raise SystemExit(f"Author manifest mismatch: {name}")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="stage without modifying website")
    mode.add_argument("--publish", action="store_true", help="install on editorial branch")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--literature-cutoff", required=True)
    parser.add_argument("--manuscript-revision", required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    if args.publish:
        branch = subprocess.check_output(["git", "branch", "--show-current"], text=True, cwd=ROOT).strip()
        if not branch.startswith("research/specdec-survey-"):
            raise SystemExit("Publish only from a SpecDec editorial branch")
    manifest = verify_author_build(source)

    original = json.loads(INDEX.read_text(encoding="utf-8"))
    original_topic = next(t for t in original["topics"] if t["id"] == TOPIC)
    if json.loads(SURVEY.read_text(encoding="utf-8")) != original_topic["survey"]:
        raise SystemExit("Survey source and index differ")
    with tempfile.TemporaryDirectory(prefix="specdec-paper-stage-") as temp:
        staging = Path(temp)
        subprocess.run([
            sys.executable, str(ROOT / "scripts" / "import-academic-paper.py"),
            "--topic", TOPIC, "--source", str(source),
            "--output", str(staging), "--topics-index", str(INDEX),
            "--literature-cutoff", args.literature_cutoff,
            "--manuscript-revision", args.manuscript_revision,
        ], check=True, cwd=ROOT)
        result = json.loads((staging / "import-result.json").read_text(encoding="utf-8"))
        checks = result["htmlChecks"]
        if not (checks["scriptFreeAndSelfContained"] and checks["allInternalTargetsExist"]
                and checks["allInlineCitationTargetsExist"] and checks["embeddedFigures"] == 4
                and checks["mathML"] >= 15):
            raise SystemExit(f"Academic paper HTML failed semantic checks: {checks}")
        candidate = json.loads((staging / "word-reports" / "topics.json").read_text(encoding="utf-8"))
        paper = next(topic for topic in candidate["topics"] if topic["id"] == TOPIC)["academicPaper"]
        if "word" not in paper["assets"]:
            raise SystemExit("Final paper requires Word")
        survey = json.loads(SURVEY.read_text(encoding="utf-8"))
        survey["paperVersion"] = paper["version"]
        # A living topic survey is bound to both its report and its current
        # academic paper; every route must point to a real Pandoc heading.
        section_by_route = {
            "candidate": ("3", "section-3"),
            "verification": ("4", "section-4"),
            "accepted-state": ("5", "section-5"),
            "runtime": ("6", "section-6"),
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
        headings.feed((source / "paper.html").read_text(encoding="utf-8"))
        if not {f"section-{n}" for n in range(1, 10)} <= headings.ids:
            raise SystemExit("Expected nine chapter anchors")
        if not all(route["paperAnchor"] in headings.ids for route in survey["routes"]):
            raise SystemExit("Survey route is not a heading in the frozen academic paper")
        next(topic for topic in candidate["topics"] if topic["id"] == TOPIC)["survey"] = survey
        relative = Path("topic-papers") / TOPIC / paper["version"]
        src = staging / "word-reports" / relative
        dest = INDEX.parent / relative
        from topic_survey import validate_survey
        topic = next(t for t in candidate["topics"] if t["id"] == TOPIC)
        validate_survey(survey, topic)
        if verify_author_build(source) != manifest:
            raise SystemExit("Author build changed during staging")
        for previous, current in zip(original["topics"], candidate["topics"], strict=True):
            if previous["id"] != TOPIC and previous != current:
                raise SystemExit("Unrelated topic changed")
            if previous["id"] == TOPIC and {k: v for k, v in previous.items() if k not in {"academicPaper", "survey"}} != {k: v for k, v in current.items() if k not in {"academicPaper", "survey"}}:
                raise SystemExit("Report or candidate metadata changed")
        if args.check:
            print(json.dumps({"status": "staging_only", "version": paper["version"], "checks": checks, "authorCommit": manifest["sourceCommit"]}, ensure_ascii=False))
            return
        if dest.exists():
            if {p.name: p.read_bytes() for p in dest.iterdir()} != {p.name: p.read_bytes() for p in src.iterdir()}:
                raise SystemExit("Published paper version conflicts with existing asset bytes")
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src, dest)
        validate_survey(survey, topic, INDEX.parent)
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

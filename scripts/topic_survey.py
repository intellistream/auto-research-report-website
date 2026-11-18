"""Validate and import an accepted topic synthesis without changing frozen assets."""

from copy import deepcopy
from datetime import date
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import re
from tempfile import NamedTemporaryFile
from urllib.parse import urlsplit


REPO = Path(__file__).resolve().parents[1]
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]*")
VERSION = re.compile(r"[0-9a-f]{64}")
WORK_ID = re.compile(r"github:vllm-project/(?:vllm|vllm-ascend)#[1-9][0-9]*")
PENDING_REVIEW = "pending-review"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def text(value, label):
    require(isinstance(value, str) and bool(value.strip()), f"{label}: nonempty text required")


def identifier(value, label):
    require(isinstance(value, str) and bool(ID.fullmatch(value)), f"{label}: unsafe ID")


def records(value, label, *, empty=False):
    require(isinstance(value, list) and (empty or bool(value)), f"{label}: array required")
    require(all(isinstance(row, dict) for row in value), f"{label}: object array required")
    return value


def ids(value, label, allowed, *, empty=True):
    require(isinstance(value, list) and (empty or bool(value)), f"{label}: ID array required")
    for item in value:
        identifier(item, label)
    require(len(value) == len(set(value)), f"{label}: duplicate ID")
    require(set(value) <= set(allowed), f"{label}: unresolved ID")
    return set(value)


def iso_day(value, label):
    text(value, label)
    require(date.fromisoformat(value).isoformat() == value, f"{label}: ISO date required")


def public_url(value, label):
    text(value, label)
    url = urlsplit(value)
    require(url.scheme in {"https", "http"} and url.hostname and not url.username and not url.password,
            f"{label}: public HTTP(S) URL required")


class Anchors(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        self.ids.update(value for key, value in attrs if key == "id" and value)


def asset_path(root, relative):
    text(relative, "asset path")
    path = PurePosixPath(relative)
    require(not path.is_absolute() and ".." not in path.parts and "\\" not in relative
            and ":" not in relative, "unsafe asset path")
    return Path(root).joinpath(*path.parts)


def validate_survey(survey, topic, archive=None):
    require(isinstance(survey, dict), "survey: object required")
    require(type(survey.get("schemaVersion")) is int and survey["schemaVersion"] == 1,
            "survey.schemaVersion: expected 1")
    report, paper = topic.get("report", {}), topic.get("academicPaper", {})
    for key, target in (("reportVersion", report), ("paperVersion", paper)):
        value = survey.get(key)
        require(isinstance(value, str) and VERSION.fullmatch(value), f"{key}: SHA-256 required")
        require(value == target.get("version"), f"{key}: synthesis belongs to a different version")
    iso_day(survey.get("reviewedAt"), "reviewedAt")
    text(survey.get("thesis"), "thesis")
    references = {row["id"]: row for row in report.get("references", [])}
    evidence = {row["id"]: row for row in report.get("evidenceDetails", [])}
    gaps = {row["id"]: row for row in report.get("gaps", [])}
    anchors = None
    if archive is not None:
        parser = Anchors()
        parser.feed(asset_path(archive, paper["assets"]["html"]["path"]).read_text(encoding="utf-8"))
        anchors = parser.ids

    def bindings(row, label, *, gap=False):
        sources = ids(row.get("sourceIds"), f"{label}.sourceIds", references, empty=False)
        selected = ids(row.get("evidenceIds"), f"{label}.evidenceIds", evidence)
        for evidence_id in selected:
            require(set(evidence[evidence_id]["sourceIds"]) <= sources,
                    f"{label}: evidence sources missing from sourceIds")
        if gap:
            selected_gaps = ids(row.get("gapIds"), f"{label}.gapIds", gaps)
            for gap_id in selected_gaps:
                require(set(gaps[gap_id]["sourceIds"]) <= sources,
                        f"{label}: gap sources missing from sourceIds")

    routes = records(survey.get("routes"), "routes")
    route_ids = set()
    for row in routes:
        require(isinstance(row.get("id"), str) and re.fullmatch(r"[a-z0-9][a-z0-9-]*", row["id"]),
                "route.id: use lowercase letters, digits and hyphens")
        require(row["id"] not in route_ids, "duplicate route ID")
        route_ids.add(row["id"])
        for field in ("title", "problem", "assessment", "limitation", "paperSection", "paperAnchor"):
            text(row.get(field), f"route.{field}")
        anchor = row["paperAnchor"]
        require(not any(ord(c) < 32 or c in '<>"\'`#' for c in anchor), "route.paperAnchor: unsafe anchor")
        if anchors is not None:
            require(anchor in anchors, "route.paperAnchor: absent from the bound paper HTML")
        mechanism = row.get("mechanism")
        require(isinstance(mechanism, list) and bool(mechanism), "route.mechanism: text array required")
        for item in mechanism:
            text(item, "route.mechanism")
        bindings(row, f"route.{row['id']}", gap=True)

    update = survey.get("update")
    require(isinstance(update, dict), "update: object required")
    text(update.get("summary"), "update.summary")
    previous = update.get("previousRevision")
    require(type(previous) is int and 0 <= previous < report.get("revision", 0),
            "update.previousRevision: must precede the current report revision")
    if archive is not None and report.get("previousVersion"):
        old = json.loads(asset_path(archive, f"topic-reports/{topic['id']}/{report['previousVersion']}/report.json").read_text(encoding="utf-8"))
        require(previous == old["revision"], "update.previousRevision: not the predecessor revision")
    for row in records(update.get("evidence"), "update.evidence", empty=True):
        for field in ("title", "change"):
            text(row.get(field), f"update.evidence.{field}")
        bindings(row, "update.evidence")
    ids(update.get("nextGapIds"), "update.nextGapIds", gaps)

    if "researchAssessment" in survey:
        assessment = survey["researchAssessment"]
        require(isinstance(assessment, dict), "researchAssessment: object required")
        iso_day(assessment.get("asOf"), "researchAssessment.asOf")
        for field in ("scope", "summary"):
            text(assessment.get(field), f"researchAssessment.{field}")
        decisions = records(assessment.get("decisions"), "researchAssessment.decisions", empty=True)
        seen = set()
        for row in decisions:
            gap_id = row.get("gapId")
            identifier(gap_id, "researchAssessment.gapId")
            require(gap_id in gaps and gap_id not in seen, "researchAssessment.gapId: unknown or duplicate")
            seen.add(gap_id)
            require(row.get("decision") in {"missing_evidence", "evaluation_requirement"},
                    "researchAssessment.decision: unknown decision")
            for field in ("reason", "reopenWhen"):
                text(row.get(field), f"researchAssessment.{field}")
            urls = row.get("sourceUrls")
            require(isinstance(urls, list) and bool(urls), "researchAssessment.sourceUrls: array required")
            for url in urls:
                public_url(url, "researchAssessment.sourceUrls")

    if "pendingQuestions" in survey:
        pending = {row["workId"] for row in report.get("pendingEvidence", [])}
        seen = set()
        for row in records(survey["pendingQuestions"], "pendingQuestions", empty=True):
            work_id = row.get("workId")
            require(isinstance(work_id, str) and WORK_ID.fullmatch(work_id)
                    and work_id in pending and work_id not in seen,
                    "pendingQuestions.workId: unknown or duplicate pending candidate")
            seen.add(work_id)
            ids(row.get("routeIds"), "pendingQuestions.routeIds", route_ids, empty=False)
            for field in ("question", "missingEvidence"):
                text(row.get(field), f"pendingQuestions.{field}")
    return survey


def historical_binding(survey, topic, archive):
    """Validate an inactive guide against its original frozen evidence."""
    bound = deepcopy(topic)
    report_version, paper_version = survey["reportVersion"], survey["paperVersion"]
    if report_version != topic.get("report", {}).get("version"):
        path = f"topic-reports/{topic['id']}/{report_version}/report.json"
        bound["report"] = json.loads(asset_path(archive, path).read_text(encoding="utf-8"))
    if paper_version != topic.get("academicPaper", {}).get("version"):
        folder = f"topic-papers/{topic['id']}/{paper_version}"
        manifest = json.loads(asset_path(archive, f"{folder}/manifest.json").read_text(encoding="utf-8"))
        require(manifest.get("topicId") == topic["id"] and manifest.get("version") == paper_version,
                "historical paper manifest does not match its version")
        require("paper.html" in manifest.get("assets", {}), "historical paper HTML is missing")
        bound["academicPaper"] = {"version": paper_version,
                                  "assets": {"html": {"path": f"{folder}/paper.html"}}}
    validate_survey(survey, bound, archive)


def import_survey(source, index_path, topic_id="aclgraph", *, check=False):
    source, index_path = Path(source), Path(index_path)
    require(isinstance(topic_id, str) and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", topic_id),
            "unsafe topic ID")
    index = json.loads(index_path.read_text(encoding="utf-8"))
    require(index.get("schemaVersion") == 2, "topic index: expected schemaVersion 2")
    matches = [row for row in index["topics"] if row.get("id") == topic_id]
    require(len(matches) == 1, "topic index: expected one matching topic")
    topic = matches[0]
    survey = json.loads(source.read_text(encoding="utf-8"))
    if check and "survey" not in topic and isinstance(survey, dict):
        # A new evidence version can ship using the report-derived reader while
        # its concise guide is being reviewed. Never publish the stale guide.
        hashes_valid = all(isinstance(survey.get(key), str) and VERSION.fullmatch(survey[key])
                           for key in ("reportVersion", "paperVersion"))
        current_report = topic.get("report", {}).get("version")
        require(isinstance(current_report, str) and VERSION.fullmatch(current_report),
                "current report: SHA-256 required")
        stale = hashes_valid and (survey["reportVersion"] != current_report
                                 or survey["paperVersion"] != topic.get("academicPaper", {}).get("version"))
        if stale:
            historical_binding(survey, topic, index_path.parent)
            return PENDING_REVIEW
    validate_survey(survey, topic, index_path.parent)
    if check:
        require(topic.get("survey") == survey,
                "accepted survey differs from topics.json; run import-topic-survey.py to refresh it")
        return False
    if topic.get("survey") == survey:
        return False
    updated = deepcopy(index)
    next(row for row in updated["topics"] if row["id"] == topic_id)["survey"] = survey
    temporary = None
    try:
        with NamedTemporaryFile(dir=index_path.parent, prefix=".topic-survey-", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write((json.dumps(updated, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
        os.replace(temporary, index_path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return True

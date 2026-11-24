"""Freeze an academic manuscript into NON-public staging; never publish the live index.

stdlib only. The source directory is read-only. See --help and the staged README.
"""
import argparse
import base64
import copy
import hashlib
from html.parser import HTMLParser
import io
import json
from datetime import date
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import shutil
import tempfile
from urllib.parse import unquote, urlsplit
import zipfile
from xml.etree import ElementTree

REPO = Path(__file__).resolve().parents[1]
FILES = {"html": "paper.html", "pdf": "paper.pdf", "markdown": "paper.md", "latex": "paper.tex", "bibtex": "references.bib", "sources": "sources.zip"}
SOURCE_FILES = ("paper.md", "paper.tex", "references.bib", "paper-header.tex", "paper.css", "numeric.csl", "paper.docx")
WORD_SOURCE_FILES = ("build_web.py", "build_word.py", "publication-reference-map.json", "reference-identities.json", "source-register.json", "REVISION-NOTES.md")
FIGURE_SUFFIXES = {".tex", ".svg", ".pdf", ".png", ".jpg", ".jpeg"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def read_source(directory, name):
    path = directory / name
    require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(directory.resolve()), f"Missing or unsafe source: {name}")
    for ancestor in path.relative_to(directory).parents:
        require(not (directory / ancestor).is_symlink(), f"Symlink in source path: {name}")
    return path.read_bytes()


def inspect_css(css):
    require("\\" not in css, "Escaped CSS is outside the portable stylesheet profile")
    require(not re.search(r"@import\b|expression\s*\(|javascript\s*:", css, re.I), "CSS contains active or imported content")
    for url in re.findall(r"url\s*\(\s*['\"]?([^)'\"]+)", css, re.I):
        require(url.startswith(("data:", "#")), "HTML CSS has external resource")


class PaperHTML(HTMLParser):
    """Check portable, script-free HTML without rewriting its MathML or citations."""
    forbidden = {"script", "iframe", "frame", "frameset", "object", "embed", "base", "form", "input", "button", "textarea", "select", "audio", "video", "animate", "set", "foreignobject"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids, self.fragments, self.headings, self.citations = set(), [], [], []
        self.math, self.images, self.external_links = 0, 0, 0

    def handle_starttag(self, tag, attrs):
        require(tag not in self.forbidden, f"Active HTML element forbidden: {tag}")
        require(len({key for key, _ in attrs}) == len(attrs), "Duplicate HTML attribute")
        attrs = dict(attrs)
        require(not any(key.startswith("on") or key in {"srcdoc", "srcset", "formaction", "action", "ping"} for key in attrs), f"Active HTML attribute on {tag}")
        require(not (tag == "meta" and "http-equiv" in attrs), "HTTP-equiv metadata forbidden")
        if tag == "link":
            # Pandoc's self-contained mode encodes stylesheet contents in a data URL.
            match = re.fullmatch(r"data:text/css(?:;charset=utf-8)?(;base64)?,(.*)", attrs.get("href", ""), re.I | re.S)
            require(attrs.get("rel", "").lower() == "stylesheet" and match, "HTML stylesheet must be embedded, not remote")
            css = base64.b64decode(match[2], validate=True).decode("utf-8") if match[1] else unquote(match[2])
            inspect_css(css)
        if attrs.get("id"):
            require(attrs["id"] not in self.ids, f"Duplicate HTML id: {attrs['id']}")
            self.ids.add(attrs["id"])
            if tag in {"h1", "h2", "h3", "h4"}:
                self.headings.append(attrs["id"])
        self.citations.extend(attrs.get("data-cites", "").split())
        if tag == "math":
            self.math += 1
        if tag == "img":
            self.images += 1
            require(bool(attrs.get("alt")), "Figure requires alternative text")
        for key, value in attrs.items():
            if key == "style":
                inspect_css(value or "")
            if key == "src":
                require(tag == "img" and re.fullmatch(r"data:image/(?:svg\+xml|png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+", value or ""), "HTML image must be embedded data, not a remote or relative resource")
            if key in {"href", "xlink:href"}:
                if tag == "link":
                    continue
                value = value or ""
                if value.startswith("#"):
                    if value[1:]:
                        self.fragments.append(unquote(value[1:]))
                else:
                    parsed = urlsplit(value)
                    require(tag == "a" and parsed.scheme in {"https", "http"} and parsed.hostname and not parsed.username and not parsed.password, "Unsafe or non-self-contained HTML link")
                    self.external_links += 1


def inspect_html(data):
    html = data.decode("utf-8")
    require(not re.search(r"<script\b|@import\b|expression\s*\(|javascript\s*:", html, re.I), "HTML contains script or imported styles")
    for css in re.findall(r"<style\b[^>]*>(.*?)</style>", html, re.I | re.S):
        inspect_css(css)
    parser = PaperHTML()
    parser.feed(html)
    require(not set(parser.fragments) - parser.ids, "Unresolved internal HTML citation or heading target")
    require(all(f"ref-{key}" in parser.ids for key in parser.citations), "Unresolved inline citation bibliography target")
    require(parser.headings, "HTML requires headings with stable IDs")
    require(re.search(r"<title>\s*.+?</title>", html, re.S), "HTML requires a title")
    return {"headings": len(parser.headings), "internalLinks": len(parser.fragments), "inlineCitations": len(parser.citations), "distinctCitationTargets": len(set(parser.citations)), "externalLinks": parser.external_links, "mathML": parser.math, "embeddedFigures": parser.images, "allInternalTargetsExist": True, "allInlineCitationTargetsExist": True, "scriptFreeAndSelfContained": True}


def metadata_from_markdown(data, cutoff, revision):
    markdown = data.decode("utf-8")
    front = re.match(r"\A---\s*\n(.*?)\n---\s*\n", markdown, re.S)
    require(front, "Markdown requires YAML title/subtitle front matter")
    fields = {}
    for key in ("title", "subtitle"):
        match = re.search(rf"^{key}:\s*(.+?)\s*$", front[1], re.M)
        require(match, f"Markdown missing {key}")
        raw = match[1]
        fields[key] = json.loads(raw) if raw.startswith('"') else raw.strip("'")
    require(all(isinstance(value, str) and value.strip() for value in fields.values()), "Titles must be nonempty strings")
    abstract = re.search(r"^## 摘要[^\n]*\n+(.*?)(?=\n\*\*关键词)", markdown, re.M | re.S)
    keywords = re.search(r"^\*\*关键词[：:]\*\*\s*(.+)$", markdown, re.M)
    require(abstract and keywords, "Markdown requires the manuscript abstract and keywords")
    require(re.fullmatch(r"\d{4}-\d{2}-\d{2}", cutoff), "Cutoff must be YYYY-MM-DD")
    date.fromisoformat(cutoff)
    require(isinstance(revision, str) and revision.strip() and len(revision) <= 100, "Explicit manuscript revision required")
    return {"schemaVersion": 1, "title": fields["title"], "titleEn": fields["subtitle"], "abstract": abstract[1].strip(), "keywords": [word.strip() for word in re.split(r"[；;]", keywords[1]) if word.strip()], "literatureCutoff": cutoff, "manuscriptRevision": revision}


def inspect_docx(data):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as package:
            require({"[Content_Types].xml", "word/document.xml"} <= set(package.namelist()), "DOCX requires Word document parts")
            require(package.testzip() is None, "Corrupt DOCX package")
            if "docProps/custom.xml" in package.namelist():
                properties = ElementTree.fromstring(package.read("docProps/custom.xml"))
                for prop in properties:
                    if prop.get("name") not in {"bibliography", "csl"}:
                        continue
                    value = "".join(prop.itertext()).strip()
                    require(not (PureWindowsPath(value).is_absolute() or PurePosixPath(value).is_absolute() or value.lower().startswith("file://")),
                            "DOCX bibliography/csl property must use a portable relative path")
    except ElementTree.ParseError as error:
        raise ValueError("Invalid DOCX custom properties XML") from error
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as error:
        raise ValueError("Invalid DOCX package") from error


def source_readme(metadata, files):
    html_options = (" --csl=numeric.csl" if "numeric.csl" in files else "") + (" --css=paper.css" if "paper.css" in files else "")
    if "paper.docx" in files and "build_web.py" not in files and "build_word.py" not in files:
        return f"""# {metadata['title']} — editable source snapshot

Literature cutoff: {metadata['literatureCutoff']}
Manuscript revision: {metadata['manuscriptRevision']}

Markdown, TeX, Word, bibliography and referenced figures are editable.
The PDF and Word are separate renderings of the same manuscript.
Manual edits to either do not automatically update the other formats.

## PDF

Install XeLaTeX, ctex and the fonts specified in paper.tex. Run:

    xelatex -interaction=nonstopmode -halt-on-error paper.tex
    xelatex -interaction=nonstopmode -halt-on-error paper.tex
    xelatex -interaction=nonstopmode -halt-on-error paper.tex

## HTML

With Pandoc 3+, run:

    pandoc paper.md --citeproc --bibliography=references.bib{html_options} --metadata=link-citations:true --number-sections --standalone --mathml --embed-resources --output=paper.html

Formatting may differ from the frozen publication. Reimport the complete
reviewed outputs to obtain a new immutable version.
""".encode("utf-8")
    if "paper.docx" in files:
        return f"""# {metadata['title']} — editable source snapshot

Literature cutoff: {metadata['literatureCutoff']}
Manuscript revision: {metadata['manuscriptRevision']}

This package contains the editable Word manuscript, Markdown, independently
editable TeX, bibliography, PNG figures and formatting resources. It does not
contain downloaded third-party papers, authentication receipts or workflow logs.
The supplied build scripts and source registers preserve the current export
steps, citation-number map and versioned source identities.

## Word and PDF

The published PDF was exported from paper.docx. Open that file in Microsoft Word
to edit it and export a new PDF. Native equations, figure captions, table headers
and bibliography are editable. Word/font versions may change pagination and bytes.

To rebuild with the supplied Word formatting repairs, install Pandoc and Python
with python-docx, then run:

    python build_word.py --reference-doc paper.docx --output rebuilt.docx --pdf rebuilt.pdf

Review and render the result before replacing the published files. Later manual
Word edits are not copied back into Markdown automatically. The --pdf option
requires Windows and Microsoft Word; omit it to create only the editable DOCX.
Run python build_word.py --help for tool and path overrides.

## TeX alternative

paper.tex contains its rendered bibliography and references the PNG figures.
With XeLaTeX, ctex and the fonts named in paper.tex installed, run:

    xelatex -interaction=nonstopmode -halt-on-error paper.tex
    xelatex -interaction=nonstopmode -halt-on-error paper.tex

This produces a separate layout; its pagination need not match the Word PDF.

## HTML from Markdown

With Pandoc and Python with beautifulsoup4 installed, run:

    python build_web.py

This builds HTML and TeX from the same cited Markdown, applies the exporter's
compatibility handling, removes legacy active-content comments, normalizes
bibliography anchors to ref-1, ref-2, etc., and writes the citation-number map.
The headings already contain their numbers. HTML uses embedded figures and native
MathML. The exporter derives and checks citation and heading targets from the
Markdown source. Rebind the website's representative-work links to the new map
before import. Reimport completed outputs for a new immutable version.
""".encode("utf-8")
    return f"""# {metadata['title']} — editable source snapshot

Literature cutoff: {metadata['literatureCutoff']}
Manuscript revision: {metadata['manuscriptRevision']}

This package contains only editable manuscript sources, bibliography, original
figures and formatting resources. It contains no model requests/responses,
authentication receipts, downloaded third-party full texts or author-workflow logs.

## Rebuild the PDF

Install XeLaTeX with ctex and the fonts named in paper.tex (replace unavailable
fonts explicitly). From this directory run:

    xelatex -interaction=nonstopmode -halt-on-error paper.tex
    xelatex -interaction=nonstopmode -halt-on-error paper.tex

The supplied paper.tex is independently editable and already contains the rendered
bibliography. references.bib is also supplied for bibliography editing. The original
figure PDFs are included; their editable TikZ .tex and SVG representations accompany
them. Recompile the figure .tex files with XeLaTeX if editing those diagrams.

## Rebuild HTML from Markdown

With Pandoc 3+ run:

    pandoc paper.md --from=markdown+citations+tex_math_dollars --citeproc --bibliography=references.bib{html_options} --metadata=link-citations:true --number-sections --standalone --mathml --embed-resources --output=paper.html

HTML uses native MathML and embedded images; no JavaScript or remote CDN is needed.
Markdown/BibTeX and TeX are separate editable representations: rebuilding from
Markdown does not incorporate later manual TeX-only edits. Tool/font versions may
change layout and bytes; reimport the completed outputs to obtain a new version.
This source snapshot does not state editorial acceptance or expert certification.
""".encode("utf-8")


def source_zip(snapshot, metadata):
    files = {name: data for name, data in snapshot.items() if name in SOURCE_FILES or ("paper.docx" in snapshot and name in WORD_SOURCE_FILES) or name.startswith("figures/")}
    files["README.md"] = source_readme(metadata, files)
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            require(not re.search(rb"\bsk-[A-Za-z0-9_-]{24,}|\bBearer\s+[A-Za-z0-9._-]{24,}", data), f"Possible credential in source: {name}")
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data, compresslevel=9)
    return stream.getvalue(), sorted(files)


def stage_paper(source, output, index_path, topic_id, cutoff, revision):
    source, output, index_path = Path(source), Path(output).resolve(), Path(index_path)
    require(source.is_dir() and not source.is_symlink(), "Source directory missing or symlinked")
    source = source.resolve()
    public = (REPO / "public").resolve()
    require(not output.is_relative_to(public) and not public.is_relative_to(output), "This importer is staging-only; public output forbidden")
    require(not output.is_relative_to(source) and not source.is_relative_to(output), "Staging must not overlap the author directory")
    require(re.fullmatch(r"[a-z0-9][a-z0-9-]*", topic_id), "Invalid topic ID")
    index = json.loads(index_path.read_text(encoding="utf-8"))
    require(index.get("schemaVersion") in {1, 2}, "Unsupported topic index")
    topics = [topic for topic in index["topics"] if topic["id"] == topic_id]
    require(len(topics) == 1, "Topic must exist exactly once")
    paper_files = dict(FILES)
    word = source / "paper.docx"
    if word.exists() or word.is_symlink():
        paper_files["word"] = "paper.docx"
    names = {name for name in paper_files.values() if name != "sources.zip"}
    names.update(name for name in SOURCE_FILES if (source / name).exists())
    if "word" in paper_files:
        names.update(name for name in WORD_SOURCE_FILES if (source / name).exists())
    figures = source / "figures"
    if figures.exists():
        require(not figures.is_symlink(), "Figure directory must not be symlinked")
        # Only figure families referenced by the editable manuscript belong in the
        # source bundle; a stray downloaded PDF in figures/ is not copied.
        source_text = (read_source(source, "paper.md") + read_source(source, "paper.tex")).decode("utf-8")
        figure_stems = {str(Path(name).with_suffix("")) for name in re.findall(r"figures/[A-Za-z0-9_./-]+", source_text)}
        names.update(path.relative_to(source).as_posix() for path in figures.rglob("*") if path.is_file() and path.suffix.lower() in FIGURE_SUFFIXES and str(path.relative_to(source).with_suffix("")) in figure_stems)
    snapshot = {name: read_source(source, name) for name in sorted(names)}
    require(snapshot["paper.pdf"].startswith(b"%PDF-"), "Invalid PDF signature")
    if "paper.docx" in snapshot:
        inspect_docx(snapshot["paper.docx"])
    html_checks = inspect_html(snapshot["paper.html"])
    metadata = metadata_from_markdown(snapshot["paper.md"], cutoff, revision)
    require(metadata["title"] in snapshot["paper.html"].decode("utf-8"), "Markdown/HTML titles differ")
    archive, archive_names = source_zip(snapshot, metadata)
    # Do not freeze a mixed snapshot while the author is rebuilding it.
    for name, data in snapshot.items():
        require(read_source(source, name) == data, f"Source changed during import; retry after author build: {name}")
    artifacts = {name: snapshot[name] for name in paper_files.values() if name != "sources.zip"}
    artifacts["sources.zip"] = archive
    hashes = {name: digest(data) for name, data in sorted(artifacts.items())}
    identity = {"schemaVersion": 1, "topicId": topic_id, "metadata": metadata, "assets": hashes}
    version = hashlib.sha256(canonical(identity)).hexdigest()
    manifest = {**identity, "version": version}
    artifacts["manifest.json"] = canonical(manifest) + b"\n"
    relative = f"topic-papers/{topic_id}/{version}"
    paper = {**metadata, "version": version, "assets": {kind: {"path": f"{relative}/{name}", **hashes[name]} for kind, name in paper_files.items()}, "manifestPath": f"{relative}/manifest.json"}
    destination = output / "word-reports" / relative
    require(destination.resolve().is_relative_to(output), "Staging path escapes output root")
    for parent in destination.relative_to(output).parents:
        require(not (output / parent).is_symlink(), "Staging directories must not be symlinked")
    if destination.exists():
        require(destination.is_dir() and not destination.is_symlink(), "Unsafe frozen destination")
        require({path.name for path in destination.iterdir()} == set(artifacts), "Existing frozen version has different files")
        for name, data in artifacts.items():
            require(read_source(destination, name) == data, f"Immutable version collision/corruption: {name}")
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = Path(tempfile.mkdtemp(prefix=".paper-stage-", dir=destination.parent))
        try:
            for name, data in artifacts.items():
                (temporary / name).write_bytes(data)
            temporary.rename(destination)
        finally:
            if temporary.exists():
                require(temporary.resolve().parent == destination.parent.resolve(), "Unsafe temporary cleanup")
                shutil.rmtree(temporary)
    candidate = copy.deepcopy(index)
    next(topic for topic in candidate["topics"] if topic["id"] == topic_id)["academicPaper"] = paper
    for name, value in (("word-reports/topics.json", candidate), ("academic-paper.json", {"topicId": topic_id, "academicPaper": paper})):
        path = output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        require(not path.is_symlink(), f"Unsafe staging output: {name}")
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    result = {"status": "staging_only_not_published", "topicId": topic_id, "version": version, "academicPaper": paper, "htmlChecks": html_checks, "sourceZipEntries": archive_names, "assets": {name: digest(data) for name, data in artifacts.items()}, "sourceSnapshot": {name: digest(data) for name, data in snapshot.items()}, "destination": str(destination), "candidateIndex": str(output / "word-reports/topics.json")}
    result_path = output / "import-result.json"
    require(not result_path.is_symlink(), "Unsafe import-result staging output")
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path, help="non-public staging root; never a live publication directory")
    parser.add_argument("--topics-index", type=Path, default=REPO / "public/word-reports/topics.json", help="read-only input index")
    parser.add_argument("--topic", default="aclgraph")
    parser.add_argument("--literature-cutoff", required=True)
    parser.add_argument("--manuscript-revision", required=True, help="explicit draft/revision identity; not an acceptance claim")
    args = parser.parse_args()
    try:
        result = stage_paper(args.source, args.output, args.topics_index, args.topic, args.literature_cutoff, args.manuscript_revision)
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f"Import refused: {error}\n")
    print(json.dumps({key: result[key] for key in ("status", "topicId", "version", "destination")}, ensure_ascii=False))


if __name__ == "__main__":
    main()

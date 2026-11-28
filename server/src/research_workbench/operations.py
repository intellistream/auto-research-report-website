"""Offline, explicit-path cutover preparation. Mutations require --execute."""

import argparse
import hashlib
import json
import os
import re
import sqlite3
import stat
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

LEGACY_PATHS = (
    ("POST", "/api/research/jobs"),
    ("GET", "/api/research/jobs"),
    ("GET", "/api/research/jobs/{job_id}"),
    ("GET", "/api/research/jobs/{job_id}/report.html"),
    ("GET", "/api/research/jobs/{job_id}/report.pdf"),
    ("GET", "/api/research/jobs/{job_id}/report.json"),
    ("GET", "/api/research/jobs/{job_id}/report.html?download=1"),
    ("GET", "/api/research/jobs/{job_id}/report.pdf?download=1"),
    ("GET", "/api/research/jobs/{job_id}/report.json?download=1"),
)


def explicit_path(value, *, exists=False):
    path = Path(value)
    if not path.is_absolute() or path in {Path(path.anchor), Path.home()}:
        raise ValueError("an explicit dedicated absolute path is required")
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError("symlink paths are not supported for offline operations")
    if exists and not path.exists():
        raise ValueError("explicit source path does not exist")
    return path.resolve()


def private_directory(path):
    path.mkdir(parents=True, mode=0o700, exist_ok=True)
    if not path.is_dir() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError("operation directory must be private (mode 0700)")


@contextmanager
def read_only_database(path):
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=10)) as connection:
        yield connection


def file_sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def schema_role(connection):
    tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "jobs" in tables:
        if any(name.startswith("wb_") for name in tables):
            raise ValueError("mixed legacy and workbench database is forbidden")
        marker = None
        if "service_metadata" in tables:
            marker = connection.execute(
                "SELECT value FROM service_metadata WHERE key='audience'"
            ).fetchone()
        if marker is None or marker[0] != "public":
            raise ValueError("legacy archive requires an explicitly public anonymous database")
        return "legacy-anonymous"
    if any(name.startswith("wb_auth_") for name in tables) and any(
        name.startswith("wb_research_") for name in tables
    ):
        return "workbench"
    raise ValueError("database role is unknown")


def consistent_backup(source_db, output_dir, *, role, source_commit, execute=False):
    source = explicit_path(source_db, exists=True)
    output = explicit_path(output_dir)
    if not source.is_file() or output == source.parent or output.is_relative_to(source.parent):
        raise ValueError("backup directory must be separate from the live data directory")
    if role not in {"legacy-anonymous", "workbench"}:
        raise ValueError("explicit database role is required")
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise ValueError("source commit must be a full reviewed Git SHA")
    with read_only_database(source) as connection:
        if schema_role(connection) != role:
            raise ValueError("database role does not match the requested operation")
    plan = {
        "operation": "archive-legacy" if role == "legacy-anonymous" else "backup",
        "dryRun": not execute,
        "sourceDatabase": str(source),
        "outputDirectory": str(output),
        "role": role,
        "sourceCommit": source_commit,
        "sourceChanged": False,
        "oldEntrypointsClosed": False,
    }
    if not execute:
        return plan
    os.umask(0o077)
    private_directory(output)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    artifact = output / f"{role}-{stamp}-{uuid4().hex[:8]}.sqlite3"
    descriptor = os.open(artifact, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(descriptor)
    try:
        with (
            read_only_database(source) as live,
            closing(sqlite3.connect(artifact)) as backup,
            backup,
        ):
            live.backup(backup, pages=256, sleep=0.05)
            if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("backup integrity check failed")
            if schema_role(backup) != role:
                raise ValueError("backup database role changed")
        receipt = {
            "format": "workbench-backup-v1",
            "database": artifact.name,
            "role": role,
            "sourceCommit": source_commit,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "sha256": file_sha256(artifact),
            "integrity": "ok",
            "restorableWithoutCurrentRevocations": False,
        }
        receipt_file = artifact.with_suffix(".json")
        with receipt_file.open("x", encoding="utf-8") as stream:
            json.dump(receipt, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        return {**plan, "database": str(artifact), "receipt": str(receipt_file)}
    except Exception:
        # Only this call's exclusively-created incomplete file may be removed.
        artifact.unlink(missing_ok=True)
        raise


def inventory(manifest_path):
    manifest = explicit_path(manifest_path, exists=True)
    entries = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(entries, list) or not entries:
        raise ValueError("entry inventory must be a non-empty list")
    result = []
    for row in entries:
        if (
            not isinstance(row, dict)
            or set(row)
            != {"name", "baseUrl", "service", "tunnel", "publisher", "directPort", "dataDirectory"}
            or any(not isinstance(v, str) for v in row.values())
        ):
            raise ValueError("inventory entries require explicit documented string fields")
        parsed = urlsplit(row["baseUrl"])
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in {"", "/"}
        ):
            raise ValueError("inventory requires a credential-free base URL")
        result.append(
            {
                **row,
                "paths": [{"method": method, "path": path} for method, path in LEGACY_PATHS],
                "verifiedClosed": False,
                "requiredChecks": [
                    "stop new anonymous submissions and drain or record interrupted work",
                    "consistent SQLite archive with source version, private access and checksum",
                    "disable legacy service, direct port, tunnel, publisher and frontend fallback",
                    "verify every listed path at every entry after reviewed cutover",
                    "keep new member data; rollback must not reopen anonymous access",
                ],
            }
        )
    return {"operation": "inventory", "dryRun": True, "entries": result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="operation", required=True)
    listing = commands.add_parser("inventory")
    listing.add_argument("--manifest", type=Path, required=True)
    for name, role in (("backup", "workbench"), ("archive-legacy", "legacy-anonymous")):
        command = commands.add_parser(name)
        command.set_defaults(role=role)
        command.add_argument("--source-db", type=Path, required=True)
        command.add_argument("--output-dir", type=Path, required=True)
        command.add_argument("--source-commit", required=True)
        command.add_argument("--execute", action="store_true")
    restore = commands.add_parser("restore-stage")
    restore.add_argument("--receipt", type=Path, required=True)
    restore.add_argument("--current-db", type=Path, required=True)
    restore.add_argument("--deletion-journal", type=Path, required=True)
    restore.add_argument("--target-dir", type=Path, required=True)
    restore.add_argument("--report-days", type=int, default=90)
    restore.add_argument("--study-days", type=int, default=180)
    restore.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    try:
        if args.operation == "inventory":
            result = inventory(args.manifest)
        elif args.operation == "restore-stage":
            from .restore import stage_restore

            result = stage_restore(
                args.receipt,
                args.current_db,
                args.deletion_journal,
                args.target_dir,
                execute=args.execute,
                report_days=args.report_days,
                study_days=args.study_days,
            )
        else:
            result = consistent_backup(
                args.source_db,
                args.output_dir,
                role=args.role,
                source_commit=args.source_commit,
                execute=args.execute,
            )
    except (ValueError, OSError, RuntimeError, sqlite3.Error):
        # Do not print database content or an exception's potentially private text.
        parser.exit(
            2, "Operation refused: verify explicit paths, role, permissions and integrity.\n"
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

"""Restore into a new offline staging directory, never over a live database."""

import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from .operations import (
    explicit_path,
    file_sha256,
    private_directory,
    read_only_database,
    schema_role,
)
from .runtime import InstanceLock

TRANSIENT_TABLES = ("wb_auth_sessions", "wb_auth_oauth", "wb_auth_invitations", "wb_auth_notices")
MEMBER_COLUMNS = (
    "user_id",
    "github_id",
    "github_login",
    "is_admin",
    "status",
    "daily_generation_limit",
    "active_job_limit",
    "created_at",
    "last_login_at",
)


def _receipt(path):
    path = explicit_path(path, exists=True)
    receipt = json.loads(path.read_text(encoding="utf-8"))
    if (
        receipt.get("format") != "workbench-backup-v1"
        or receipt.get("role") != "workbench"
        or receipt.get("integrity") != "ok"
        or not isinstance(receipt.get("database"), str)
        or Path(receipt["database"]).name != receipt["database"]
    ):
        raise ValueError("only verified workbench backups can be restored")
    database = explicit_path(path.parent / receipt["database"], exists=True)
    if file_sha256(database) != receipt.get("sha256"):
        raise ValueError("backup checksum mismatch")
    return database


def _rows(connection, table):
    connection.row_factory = sqlite3.Row
    return [dict(row) for row in connection.execute(f"SELECT * FROM {table}")]


def _private_json(path, value):
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")


def _validate_current_journal(current, journal):
    facts = set()
    for line in journal.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        fact = json.loads(line)
        facts.add(
            (
                fact["kind"],
                fact["objectId"],
                fact["ownerUserId"],
                fact["studyId"],
                fact["at"],
                fact["reason"],
            )
        )
    for row in current.execute(
        "SELECT kind,object_id,owner_user_id,study_id,deleted_at,reason FROM wb_research_tombstones"
    ):
        if tuple(row) not in facts:
            raise ValueError("deletion journal is stale or incomplete")


def _newer_research_exists(current, restored):
    current.row_factory = sqlite3.Row
    restored.row_factory = sqlite3.Row
    for table in ("wb_research_studies", "wb_research_jobs"):
        for record in current.execute(f"SELECT * FROM {table}"):
            row = dict(record)
            original = restored.execute(
                f"SELECT * FROM {table} WHERE id=?", (row["id"],)
            ).fetchone()
            if original is None:
                return True
            original = dict(original)
            if row == original:
                continue
            if table == "wb_research_jobs" and row["report_json"] is None:
                fact = current.execute(
                    "SELECT 1 FROM wb_research_tombstones WHERE kind='report' AND object_id=?",
                    (row["id"],),
                ).fetchone()
                removed_fields = {
                    "report_json",
                    "html",
                    "pdf",
                    "report_expires_at",
                    "status",
                    "stage",
                    "error_code",
                    "retryable",
                }
                if fact and all(row[k] == original[k] for k in row if k not in removed_fields):
                    continue
            return True
    return False


def stage_restore(
    receipt_file,
    current_db,
    deletion_journal,
    target_dir,
    *,
    execute=False,
    report_days=90,
    study_days=180,
    clock=None,
):
    from .config import integer

    report_days = integer(report_days, "report_days", 1, 3650)
    study_days = integer(study_days, "study_days", 1, 3650)
    backup = _receipt(receipt_file)
    current = explicit_path(current_db, exists=True)
    journal = explicit_path(deletion_journal, exists=True)
    target = explicit_path(target_dir)
    if (
        backup == current
        or not current.is_file()
        or not journal.is_file()
        or target.exists()
        or target.is_relative_to(current.parent)
        or target.is_relative_to(backup.parent)
    ):
        raise ValueError(
            "restore requires separate current state and a new offline staging directory"
        )
    if stat_mode(journal) & 0o077:
        raise ValueError("latest deletion journal must be private")
    with read_only_database(backup) as old, read_only_database(current) as latest:
        if schema_role(old) != "workbench" or schema_role(latest) != "workbench":
            raise ValueError("anonymous data cannot be restored into a member workbench")
        old_origin = old.execute("SELECT value FROM wb_runtime_meta WHERE key='origin'").fetchone()
        current_origin = latest.execute(
            "SELECT value FROM wb_runtime_meta WHERE key='origin'"
        ).fetchone()
        _validate_current_journal(latest, journal)
        if not old_origin or old_origin != current_origin:
            raise ValueError("restore identities must belong to the same deployment")
    plan = {
        "operation": "restore-stage",
        "dryRun": not execute,
        "targetDirectory": str(target),
        "requiresCurrentMembershipState": True,
        "requiresLatestDeletionJournal": True,
        "revokeAllSessions": True,
        "promotedToLive": False,
    }
    if not execute:
        return plan
    from time import time

    from .auth import AuthStore
    from .research import ResearchConfig, ResearchStore

    clock = clock or time
    os.umask(0o077)
    # The current service must be stopped first. Never modify its DB or journal.
    with InstanceLock(current.parent):
        target.mkdir(mode=0o700, parents=True, exist_ok=False)
        _private_json(
            target / "restore-pending.json",
            {
                "operation": "restore-stage",
                "readyForStartup": False,
            },
        )
        destination = target / "workbench.sqlite3"
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(descriptor)
        with (
            read_only_database(backup) as source,
            closing(sqlite3.connect(destination)) as restored,
            restored,
        ):
            source.backup(restored)
        with (
            read_only_database(current) as latest,
            closing(sqlite3.connect(destination)) as restored,
            restored,
        ):
            _validate_current_journal(latest, journal)
            if _newer_research_exists(latest, restored):
                raise ValueError("newer research exists; reconcile it before any restore promotion")
            members = _rows(latest, "wb_auth_members")
            old_members = _rows(restored, "wb_auth_members")
            by_user = {row["user_id"]: row for row in members}
            by_github = {row["github_id"]: row for row in members}
            for row in old_members:
                known = by_user.get(row["user_id"])
                if known and known["github_id"] != row["github_id"]:
                    raise ValueError("stable identity mismatch in restore state")
                github = by_github.get(row["github_id"])
                if github and github["user_id"] != row["user_id"]:
                    raise ValueError(
                        "internal identity changed; explicit reconciliation is required"
                    )
                if known is None:
                    restored.execute(
                        "UPDATE wb_auth_members SET status='disabled',is_admin=0 WHERE user_id=?",
                        (row["user_id"],),
                    )
            # Preserve current qualification and limits, including disable/re-enable decisions.
            columns = ",".join(MEMBER_COLUMNS)
            placeholders = ",".join("?" for _ in MEMBER_COLUMNS)
            for row in members:
                existing = restored.execute(
                    "SELECT 1 FROM wb_auth_members WHERE user_id=?", (row["user_id"],)
                ).fetchone()
                values = [row[name] for name in MEMBER_COLUMNS]
                if existing:
                    assignments = ",".join(name + "=?" for name in MEMBER_COLUMNS[1:])
                    restored.execute(
                        f"UPDATE wb_auth_members SET {assignments} WHERE user_id=?",
                        values[1:] + [row["user_id"]],
                    )
                else:
                    restored.execute(
                        f"INSERT INTO wb_auth_members ({columns}) VALUES ({placeholders})", values
                    )
            for table in TRANSIENT_TABLES:
                restored.execute(f"DELETE FROM {table}")
            # A restore cannot reset the member's accepted generation ledger.
            usage = latest.execute("SELECT * FROM wb_research_usage")
            restored.execute("DELETE FROM wb_research_usage")
            for record in usage:
                row = dict(record)
                columns = ",".join(row)
                restored.execute(
                    f"INSERT INTO wb_research_usage ({columns}) VALUES ({','.join('?' for _ in row)})",
                    list(row.values()),
                )
        private_directory(target / "revocations")
        staged_journal = target / "revocations/research-deletions.jsonl"
        # Read latest facts only while the current directory's process lock is held.
        with staged_journal.open("xb") as stream:
            stream.write(journal.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
        auth = AuthStore(destination, clock=clock)
        auth.initialize()
        research = ResearchStore(
            destination,
            member_resolver=auth.require_active_member,
            clock=clock,
            config=ResearchConfig(
                report_retention_seconds=report_days * 86400,
                study_retention_seconds=study_days * 86400,
                deletion_journal=staged_journal,
            ),
        )
        research.replay_deletions()
        research.prune()
        research.recover_interrupted()
        with closing(sqlite3.connect(destination)) as restored, restored:
            if restored.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("restored database integrity failed")
            if restored.execute("SELECT count(*) FROM wb_auth_sessions").fetchone()[0]:
                raise ValueError("restored sessions must all be invalid")
        result = {
            **plan,
            "dryRun": False,
            "readyForReviewedStartup": True,
            "restoredAt": datetime.now(timezone.utc).isoformat(),
            "allSessionsRevoked": True,
            "latestMembershipsApplied": True,
            "deletionFactsReplayed": True,
            "expiryApplied": True,
            "stagedDeletionJournal": str(staged_journal),
        }
        _private_json(target / "restore-complete.json", result)
        (target / "restore-pending.json").unlink()
        return result


def stat_mode(path):
    import stat

    return stat.S_IMODE(path.stat().st_mode)

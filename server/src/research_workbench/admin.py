"""Admin-only display metadata; never read private research content."""

import sqlite3
from contextlib import closing, contextmanager
from datetime import datetime, timezone

_SYSTEM_EVENTS = {
    ("auth", "administrator.bootstrap"),
    ("research", "job.complete"),
    ("research", "job.fail"),
}


@contextmanager
def _reader(database):
    # Read-only mode must not recreate a lost database.
    with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("BEGIN")
        yield conn


def _member_logins(conn, user_ids):
    identities = list(dict.fromkeys(value for value in user_ids if value is not None))
    names = {}
    # Stay below SQLite's parameter limit even for an existing unpaged usage response.
    for start in range(0, len(identities), 400):
        batch = identities[start : start + 400]
        placeholders = ",".join("?" for _ in batch)
        for row in conn.execute(
            f"SELECT user_id,github_login FROM wb_auth_members WHERE user_id IN ({placeholders})",
            batch,
        ):
            names[row["user_id"]] = row["github_login"] or None
    return names


def with_member_logins(database, payload, row_key):
    """Append names by stable ID to an already-authorized queue/usage projection."""
    items = payload[row_key]
    with _reader(database) as conn:
        names = _member_logins(conn, (item.get("userId") for item in items))
    return {
        **payload,
        row_key: [{**item, "githubLogin": names.get(item.get("userId"))} for item in items],
    }


def audit_page(database, *, limit, offset):
    """Preserve recorded facts, with explicit actor/target roles and real pagination."""
    with _reader(database) as conn:
        rows = conn.execute(
            """SELECT 'auth' AS source,event_id AS id,actor_user_id AS userId,action,
               target_user_id AS targetUserId,NULL AS studyId,NULL AS jobId,
               created_at AS at,result FROM wb_auth_audit
               UNION ALL
               SELECT 'research','research:' || sequence,actor_user_id,action,
               NULL,study_id,job_id,at,result FROM wb_research_audit
               ORDER BY at DESC,id LIMIT ? OFFSET ?""",
            (limit, offset),
        ).fetchall()
        total = conn.execute(
            "SELECT (SELECT COUNT(*) FROM wb_auth_audit) + (SELECT COUNT(*) FROM wb_research_audit)"
        ).fetchone()[0]
        identities = []
        events = []
        for row in rows:
            system = (row["source"], row["action"]) in _SYSTEM_EVENTS
            actor_id = None if system else row["userId"]
            target_id = (
                row["userId"] if system and row["source"] == "research" else row["targetUserId"]
            )
            identities.extend((actor_id, target_id))
            events.append(
                {
                    **{
                        key: row[key]
                        for key in ("id", "userId", "action", "studyId", "jobId", "result")
                    },
                    "createdAt": datetime.fromtimestamp(row["at"], timezone.utc)
                    .isoformat()
                    .replace("+00:00", "Z"),
                    "actorType": "system" if system else "member" if actor_id else "unknown",
                    "actorUserId": actor_id,
                    "targetUserId": target_id,
                }
            )
        names = _member_logins(conn, identities)
        for event in events:
            event["actorGithubLogin"] = names.get(event["actorUserId"])
            event["targetGithubLogin"] = names.get(event["targetUserId"])
    return {
        "events": events,
        "total": total,
        "next_offset": offset + limit if offset + limit < total else None,
    }

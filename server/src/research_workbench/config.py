"""Explicit configuration for the same-origin private research service."""

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from .engine_protocol import EngineConfig


def absolute_path(value, label):
    if not value or not Path(value).is_absolute():
        raise ValueError(f"{label} requires an explicit absolute path")
    path = Path(value)
    if path == Path(path.anchor) or path == Path.home():
        raise ValueError(f"{label} must name a dedicated directory")
    return path.resolve()


def integer(value, label, minimum, maximum):
    try:
        result = int(value)
    except (ValueError, TypeError):
        raise ValueError(f"{label} must be an integer") from None
    if not minimum <= result <= maximum:
        raise ValueError(f"{label} is outside the supported range")
    return result


@dataclass(frozen=True)
class WorkbenchConfig:
    origin: str
    data_dir: Path
    web_dir: Path | None = None
    revocation_dir: Path | None = None
    allow_loopback_http: bool = False
    report_days: int = 90
    study_days: int = 180
    global_active_limit: int = 10
    minimum_free_bytes: int = 256 * 1024 * 1024
    maintenance: bool = False
    audit_days: int = 90
    engine: EngineConfig | None = None

    def __post_init__(self):
        parsed = urlsplit(self.origin)
        try:
            parsed.port
        except ValueError:
            raise ValueError("WORKBENCH_ORIGIN has an invalid port") from None
        local_http = (
            self.allow_loopback_http
            and parsed.scheme == "http"
            and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
        )
        if (
            not parsed.hostname
            or parsed.scheme != "https"
            and not local_http
            or self.origin != f"{parsed.scheme}://{parsed.netloc}"
            or parsed.username is not None
            or parsed.password is not None
            or parsed.hostname.endswith(".trycloudflare.com")
            or any(c.isspace() or c in "*;'<>\\" for c in self.origin)
        ):
            raise ValueError("WORKBENCH_ORIGIN must be one fixed HTTPS origin")
        object.__setattr__(self, "data_dir", absolute_path(self.data_dir, "WORKBENCH_DATA_DIR"))
        object.__setattr__(
            self,
            "revocation_dir",
            absolute_path(
                self.revocation_dir or self.data_dir / "revocations", "WORKBENCH_REVOCATION_DIR"
            ),
        )
        if self.web_dir is not None:
            website = absolute_path(self.web_dir, "WORKBENCH_WEB_DIR")
            if self.data_dir.is_relative_to(website) or self.revocation_dir.is_relative_to(website):
                raise ValueError("private data must be outside the static web directory")
            object.__setattr__(self, "web_dir", website)
        for name, lo, hi in (
            ("report_days", 1, 3650),
            ("study_days", 1, 3650),
            ("global_active_limit", 1, 10000),
            ("minimum_free_bytes", 0, 10**15),
            ("audit_days", 1, 3650),
        ):
            object.__setattr__(self, name, integer(getattr(self, name), name, lo, hi))

    @property
    def database(self):
        return self.data_dir / "workbench.sqlite3"

    @property
    def host(self):
        return urlsplit(self.origin).netloc.lower()

    @classmethod
    def from_env(cls, environment=None):
        env = os.environ if environment is None else environment
        flags = {}
        for key in ("WORKBENCH_ALLOW_LOOPBACK_HTTP", "WORKBENCH_MAINTENANCE"):
            value = env.get(key, "0")
            if value not in {"0", "1"}:
                raise ValueError(f"{key} must be 0 or 1")
            flags[key] = value == "1"
        return cls(
            origin=env.get("WORKBENCH_ORIGIN", ""),
            engine=EngineConfig.from_env(env),
            data_dir=env.get("WORKBENCH_DATA_DIR", ""),
            web_dir=env.get("WORKBENCH_WEB_DIR") or None,
            revocation_dir=env.get("WORKBENCH_REVOCATION_DIR") or None,
            allow_loopback_http=flags["WORKBENCH_ALLOW_LOOPBACK_HTTP"],
            report_days=integer(env.get("WORKBENCH_REPORT_DAYS", "90"), "report_days", 1, 3650),
            study_days=integer(env.get("WORKBENCH_STUDY_DAYS", "180"), "study_days", 1, 3650),
            global_active_limit=integer(
                env.get("WORKBENCH_GLOBAL_ACTIVE_LIMIT", "10"), "global_active_limit", 1, 10000
            ),
            minimum_free_bytes=integer(
                env.get("WORKBENCH_MINIMUM_FREE_BYTES", str(256 * 1024 * 1024)),
                "minimum_free_bytes",
                0,
                10**15,
            ),
            maintenance=flags["WORKBENCH_MAINTENANCE"],
            audit_days=integer(env.get("WORKBENCH_AUDIT_DAYS", "90"), "audit_days", 1, 3650),
        )


def authentication_config(config, environment=None):
    """Map the deployment environment to the auth module's typed constructor."""
    from .auth import AuthConfig

    env = os.environ if environment is None else environment
    result = AuthConfig(
        workbench_origin=config.origin,
        github_client_id=env.get("WORKBENCH_GITHUB_CLIENT_ID", ""),
        github_client_secret=env.get("WORKBENCH_GITHUB_CLIENT_SECRET", ""),
        bootstrap_github_id=integer(
            env.get("WORKBENCH_BOOTSTRAP_GITHUB_ID"), "bootstrap_github_id", 1, 2**63 - 1
        ),
        development_http=config.allow_loopback_http and config.origin.startswith("http://"),
        session_absolute_seconds=integer(
            env.get("WORKBENCH_SESSION_ABSOLUTE_SECONDS", str(7 * 86400)),
            "session_absolute_seconds",
            60,
            365 * 86400,
        ),
        session_idle_seconds=integer(
            env.get("WORKBENCH_SESSION_IDLE_SECONDS", "86400"),
            "session_idle_seconds",
            60,
            365 * 86400,
        ),
        default_daily_generation_limit=integer(
            env.get("WORKBENCH_DEFAULT_DAILY_LIMIT", "5"),
            "default_daily_generation_limit",
            0,
            100000,
        ),
        default_active_job_limit=integer(
            env.get("WORKBENCH_DEFAULT_ACTIVE_LIMIT", "1"), "default_active_job_limit", 1, 100
        ),
        login_return_path="/#/research",
    )
    if not result.configured:
        raise ValueError("fixed-origin OAuth and bootstrap identity must be configured")
    return result

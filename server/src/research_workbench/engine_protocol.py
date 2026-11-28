"""Version 1 server-only execution contract, independent of the research package."""

import hashlib
import ipaddress
import json
from dataclasses import dataclass, field
from urllib.parse import urlsplit

PROTOCOL_VERSION = 1
DEFAULT_REQUEST_TTL_SECONDS = 7 * 86400
MAX_ARTIFACT_BYTES = 64 * 1024 * 1024
EXECUTION_STATUSES = frozenset({"queued", "running", "complete", "failed", "cancelled", "cleared"})


def request_digest(*, query, days, generation_config, expires_at):
    payload = {
        "protocolVersion": 1,
        "query": query,
        "days": days,
        "generationConfig": generation_config,
        "expiresAt": expires_at,
    }
    return hashlib.sha256(
        json.dumps(
            payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode("utf-8")
    ).hexdigest()


@dataclass(frozen=True)
class EngineConfig:
    origin: str
    token: str = field(repr=False)
    generation_config: str = "default"
    timeout_seconds: float = 5
    request_ttl_seconds: int = DEFAULT_REQUEST_TTL_SECONDS
    allow_private_http: bool = False

    def __post_init__(self):
        parsed = urlsplit(self.origin)
        try:
            parsed.port
            ip = ipaddress.ip_address(parsed.hostname or "")
        except ValueError:
            ip = None
        local = parsed.hostname in {"127.0.0.1", "::1", "localhost"}
        private = (
            self.allow_private_http and ip is not None and ip.is_private and not ip.is_link_local
        )
        if (
            not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or self.origin != f"{parsed.scheme}://{parsed.netloc}"
            or parsed.scheme not in {"http", "https"}
            or parsed.scheme == "http"
            and not (local or private)
        ):
            raise ValueError("engine requires a fixed HTTPS or explicit private/loopback origin")
        if (
            not isinstance(self.token, str)
            or len(self.token) < 32
            or not self.token.isascii()
            or any(c.isspace() for c in self.token)
        ):
            raise ValueError(
                "engine requires a private server token of at least 32 ASCII characters"
            )
        if not self.generation_config or len(self.generation_config) > 128:
            raise ValueError("invalid generation configuration identity")
        if (
            not 0 < self.timeout_seconds <= 30
            or not 60 <= self.request_ttl_seconds <= DEFAULT_REQUEST_TTL_SECONDS
        ):
            raise ValueError("invalid engine request bounds")

    @classmethod
    def from_env(cls, env):
        origin, token = (
            env.get("WORKBENCH_ENGINE_ORIGIN", ""),
            env.get("WORKBENCH_ENGINE_TOKEN", ""),
        )
        if not origin and not token:
            return None
        flag = env.get("WORKBENCH_ENGINE_ALLOW_PRIVATE_HTTP", "0")
        if flag not in {"0", "1"}:
            raise ValueError("WORKBENCH_ENGINE_ALLOW_PRIVATE_HTTP must be 0 or 1")
        return cls(
            origin,
            token,
            env.get("WORKBENCH_ENGINE_GENERATION_CONFIG", "default"),
            allow_private_http=flag == "1",
        )

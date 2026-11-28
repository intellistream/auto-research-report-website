import hashlib
import json
from pathlib import Path

import pytest

from research_workbench.config import WorkbenchConfig
from research_workbench.engine_protocol import EngineConfig, request_digest


def test_digest_covers_all_immutable_input():
    value = {
        "query": "controlled",
        "days": 30,
        "generation_config": "default",
        "expires_at": 1800000000,
    }
    digest = request_digest(**value)
    payload = {
        "protocolVersion": 1,
        "query": "controlled",
        "days": 30,
        "generationConfig": "default",
        "expiresAt": 1800000000,
    }
    assert (
        digest
        == hashlib.sha256(
            json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
    )
    for field, changed in [
        ("query", "different"),
        ("days", 7),
        ("generation_config", "other"),
        ("expires_at", 1800000001),
    ]:
        assert request_digest(**{**value, field: changed}) != digest


def test_server_secret_never_repr_and_no_public_http():
    config = EngineConfig("http://127.0.0.1:8768", "x" * 32)
    assert "x" * 32 not in repr(config)
    with pytest.raises(ValueError):
        EngineConfig("http://public.example", "x" * 32)
    with pytest.raises(ValueError):
        EngineConfig("http://127.0.0.1:8768", "")
    assert EngineConfig.from_env({}) is None
    with pytest.raises(ValueError):
        EngineConfig.from_env({"WORKBENCH_ENGINE_ORIGIN": "http://127.0.0.1:8768"})


def test_website_configuration_can_read_history_with_engine_unconfigured(tmp_path):
    config = WorkbenchConfig("http://127.0.0.1:18775", tmp_path, allow_loopback_http=True)
    assert config.engine is None
    assert config.database.name == "workbench.sqlite3"


def test_common_runtime_has_no_upstream_or_sage_import():
    import ast

    root = Path(__file__).resolve().parents[1] / "src/research_workbench"
    for file in root.glob("*.py"):
        for node in ast.walk(ast.parse(file.read_text())):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or "").startswith(("sage_vllm_daily", "sage."))
            if isinstance(node, ast.Import):
                assert not any(
                    alias.name.startswith(("sage_vllm_daily", "sage.")) for alias in node.names
                )

"""Serve only the reviewed files listed by the private workbench build receipt."""

import hashlib
import json
import re
from pathlib import Path

from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles

RECEIPT_NAME = "workbench-release.json"


class WorkbenchStaticFiles(StaticFiles):
    def __init__(self, directory):
        root = Path(directory).resolve()
        receipt = json.loads((root / RECEIPT_NAME).read_text(encoding="utf-8"))
        if (
            receipt.get("format") != "research-workbench-web-v1"
            or receipt.get("api") != "same-origin"
            or receipt.get("base") != "/"
            or receipt.get("mode") != "workbench"
            or not re.fullmatch(r"[0-9a-f]{40}", receipt.get("sourceCommit", ""))
            or not isinstance(receipt.get("files"), dict)
            or "index.html" not in receipt["files"]
        ):
            raise ValueError("a reviewed same-origin workbench build receipt is required")
        for name, expected in receipt["files"].items():
            path = root / name
            if (
                not isinstance(name, str)
                or name.startswith(("/", "."))
                or "\\" in name
                or any(part.startswith(".") or part in {"..", ""} for part in Path(name).parts)
                or not path.resolve().is_relative_to(root)
                or path.is_symlink()
                or any(p.is_symlink() for p in path.parents if p != root)
                or path.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".key", ".pem", ".log"}
                or not isinstance(expected, str)
                or not re.fullmatch(r"[0-9a-f]{64}", expected)
                or not path.is_file()
                or hashlib.sha256(path.read_bytes()).hexdigest() != expected
            ):
                raise ValueError("workbench static artifact verification failed")
        self.allowed_files = frozenset(receipt["files"])
        self.source_commit = receipt["sourceCommit"]
        super().__init__(directory=root, html=True, follow_symlink=False)

    async def get_response(self, path, scope):
        requested = "index.html" if path in {"", ".", "/"} else path.strip("/")
        if requested not in self.allowed_files or requested.startswith(("api/", "auth/")):
            raise HTTPException(404)
        return await super().get_response(path, scope)

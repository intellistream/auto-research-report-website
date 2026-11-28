"""One website dispatcher process per persistent directory."""

import os
from pathlib import Path


class InstanceLock:
    """Use an OS advisory lock, released automatically if the process exits."""

    def __init__(self, directory: Path):
        self.directory = Path(directory).expanduser().resolve()
        self.stream = None

    def __enter__(self):
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        descriptor = os.open(self.directory / ".instance.lock", os.O_RDWR | os.O_CREAT, 0o600)
        self.stream = os.fdopen(descriptor, "r+b")
        try:
            if os.name == "nt":
                import msvcrt

                if self.stream.seek(0, os.SEEK_END) == 0:
                    self.stream.write(b"0")
                    self.stream.flush()
                self.stream.seek(0)
                msvcrt.locking(self.stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.stream.close()
            self.stream = None
            raise RuntimeError("Research data directory is already in use") from exc
        return self

    def __exit__(self, *_):
        if self.stream is None:
            return
        try:
            if os.name == "nt":
                import msvcrt

                self.stream.seek(0)
                msvcrt.locking(self.stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.stream.fileno(), fcntl.LOCK_UN)
        finally:
            self.stream.close()
            self.stream = None

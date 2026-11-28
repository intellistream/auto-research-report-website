"""Production logs contain event metadata, never interpolated application text."""

import logging
from datetime import datetime, timezone


class MetadataOnlyFormatter(logging.Formatter):
    # Unrecognized third-party messages become a generic event. In particular,
    # httpx request URLs, Uvicorn tracebacks and OAuth callback queries are dropped.
    EVENTS = {
        "Workbench request failed (%s)": "request_failed",
        "Workbench maintenance failed (%s)": "maintenance_failed",
        "Research worker stopped (%s)": "worker_stopped",
        "Research job %s failed (%s)": "generation_failed",
        "Research PDF unavailable (%s); HTML is available": "pdf_unavailable",
    }

    def format(self, record):
        event = (
            self.EVENTS.get(record.msg, "runtime_event")
            if isinstance(record.msg, str)
            else "runtime_event"
        )
        stamp = datetime.fromtimestamp(record.created, timezone.utc).isoformat()
        return f"{stamp} {record.levelname} {event}"


def log_configuration():
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"metadata": {"()": MetadataOnlyFormatter}},
        "handlers": {
            "metadata": {
                "class": "logging.StreamHandler",
                "formatter": "metadata",
                "stream": "ext://sys.stderr",
            }
        },
        "root": {"handlers": ["metadata"], "level": "INFO"},
        "loggers": {
            name: {"handlers": [], "propagate": True, "level": "INFO"}
            for name in (
                "uvicorn",
                "uvicorn.error",
                "uvicorn.access",
                "httpx",
                "httpcore",
                "py.warnings",
            )
        },
    }

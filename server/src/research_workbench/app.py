"""The private workbench entry. Legacy anonymous routes are never mounted."""

import asyncio
import logging
import os
import shutil
import sqlite3
import stat
from contextlib import asynccontextmanager, closing, suppress
from time import time

from fastapi import Depends, FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.exceptions import HTTPException

from .admin import audit_page, with_member_logins
from .config import WorkbenchConfig, authentication_config
from .runtime import InstanceLock
from .security import RequestBoundary, error_response
from .web import WorkbenchStaticFiles

LOG = logging.getLogger(__name__)


def _prepare_directory(config):
    config.data_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
    if stat.S_IMODE(config.data_dir.stat().st_mode) & 0o077:
        raise ValueError("workbench data directory must be private (mode 0700)")
    if (config.data_dir / "research.sqlite3").exists():
        raise ValueError("legacy research data must be archived separately")
    if (config.data_dir / "restore-pending.json").exists():
        raise ValueError("offline restore checks have not completed")
    config.revocation_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
    if stat.S_IMODE(config.revocation_dir.stat().st_mode) & 0o077:
        raise ValueError("revocation directory must be private (mode 0700)")
    if (config.data_dir / ".workbench-initialized").exists() and not config.database.is_file():
        raise ValueError("initialized persistent database is missing; restore review is required")
    if config.database.is_symlink():
        raise ValueError("workbench database must not be a symlink")
    with closing(sqlite3.connect(config.database)) as connection, connection:
        tables = {
            row[0]
            for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        if any(not name.startswith(("wb_", "sqlite_")) for name in tables):
            raise ValueError("legacy or unknown tables cannot be adopted")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS wb_runtime_meta (key TEXT PRIMARY KEY, value TEXT)"
        )
        for key, value in (
            ("audience", "private-workbench"),
            ("version", "1"),
            ("origin", config.origin),
        ):
            row = connection.execute(
                "SELECT value FROM wb_runtime_meta WHERE key=?", (key,)
            ).fetchone()
            if row is not None and row[0] != value:
                raise ValueError("workbench data directory belongs to another deployment")
            connection.execute("INSERT OR IGNORE INTO wb_runtime_meta VALUES (?, ?)", (key, value))
    config.database.chmod(0o600)
    journal = config.revocation_dir / "research-deletions.jsonl"
    descriptor = os.open(
        journal, os.O_WRONLY | os.O_APPEND | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600
    )
    os.close(descriptor)


def _services(config, auth_config, github, engine_client, dispatcher_factory, clock):
    from .auth import AuthService, AuthStore, require_admin, require_member
    from .research import RemoteDispatcher, ResearchConfig, ResearchService, ResearchStore
    from .research.engine_client import EngineClient

    class AdminDisplayResearchStore(ResearchStore):
        # The research module still owns authorization, ordering, timing and accounting.
        def admin_queue(self, user, *, limit=20, offset=0):
            payload = super().admin_queue(user, limit=limit, offset=offset)
            return with_member_logins(config.database, payload, "jobs")

        def admin_usage(self, user, *, day=None):
            payload = super().admin_usage(user, day=day)
            return with_member_logins(config.database, payload, "usage")

    auth_store = AuthStore(config.database, clock=clock)
    auth = AuthService(auth_config, auth_store, github=github)
    auth.initialize()
    research = AdminDisplayResearchStore(
        config.database,
        member_resolver=auth_store.require_active_member,
        config=ResearchConfig(
            report_retention_seconds=config.report_days * 86400,
            study_retention_seconds=config.study_days * 86400,
            max_active_jobs=config.global_active_limit,
            deletion_journal=config.revocation_dir / "research-deletions.jsonl",
            audit_retention_seconds=config.audit_days * 86400,
        ),
        clock=clock,
    )
    research.prune()
    client = engine_client if engine_client is not None else EngineClient(config.engine)
    factory = dispatcher_factory or RemoteDispatcher
    worker = factory(research, client, clock=clock)
    service = ResearchService(
        research,
        member_dependency=require_member,
        admin_dependency=require_admin,
        worker=worker,
        model_identity=lambda: {"generationConfig": config.engine.generation_config}
        if config.engine
        else {"unconfigured": True},
    )
    return auth, research, worker, service


def _maintenance(config, store, clock):
    store.prune()
    now = clock()
    retention = config.audit_days * 86400
    with closing(sqlite3.connect(config.database)) as connection, connection:
        for table in ("wb_auth_oauth", "wb_auth_invitations", "wb_auth_notices"):
            connection.execute(f"DELETE FROM {table} WHERE expires_at<=?", (now,))
        connection.execute("DELETE FROM wb_auth_audit WHERE created_at<=?", (now - retention,))
        connection.execute(
            "DELETE FROM wb_auth_sessions WHERE expires_at<=? OR (revoked_at IS NOT NULL AND revoked_at<=?)",
            (now - retention, now - retention),
        )


async def _maintenance_loop(application, config, store, clock):
    while True:
        await asyncio.sleep(300)
        try:
            await asyncio.to_thread(_maintenance, config, store, clock)
            application.state.maintenance_failed = False
        except Exception as exc:
            application.state.maintenance_failed = True
            LOG.error("Workbench maintenance failed (%s)", type(exc).__name__)


def create_app(
    *,
    config=None,
    auth_config=None,
    github=None,
    engine_client=None,
    dispatcher_factory=None,
    clock=time,
):
    """Constructor injection is for controlled tests; no fake-identity environment mode exists."""
    from .auth import AuthSecurityMiddleware, require_admin

    config = config or WorkbenchConfig.from_env()
    auth_config = auth_config or authentication_config(config)
    if not auth_config.configured or auth_config.workbench_origin != config.origin:
        raise ValueError(
            "auth must use the configured workbench origin and real session implementation"
        )
    static = WorkbenchStaticFiles(config.web_dir) if config.web_dir is not None else None

    @asynccontextmanager
    async def lifespan(application):
        with InstanceLock(config.data_dir):
            _prepare_directory(config)
            auth, store, worker, research = _services(
                config,
                auth_config,
                github,
                engine_client,
                dispatcher_factory,
                clock,
            )
            descriptor = os.open(
                config.data_dir / ".workbench-initialized",
                os.O_WRONLY | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0),
                0o600,
            )
            os.close(descriptor)
            application.state.workbench_auth = auth
            application.state.research_store = store
            application.state.research_worker = worker
            # A repeated controlled lifespan must not accumulate stale feature routes.
            application.router.routes = list(base_routes)
            application.include_router(auth.router)
            application.include_router(research.router)
            if static is not None:
                application.mount("/", static, name="workbench-static")
            _maintenance(config, store, clock)
            application.state.maintenance_failed = False
            worker.start()
            maintenance_task = asyncio.create_task(
                _maintenance_loop(application, config, store, clock)
            )
            try:
                yield
            finally:
                maintenance_task.cancel()
                with suppress(asyncio.CancelledError):
                    await maintenance_task
                await asyncio.to_thread(worker.stop)
                application.state.workbench_auth = None
                application.state.research_worker = None

    application = FastAPI(
        title="Private research workbench",
        version="4.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    application.state.workbench_config = config

    @application.exception_handler(HTTPException)
    async def safe_http_error(request: Request, exc):
        detail = exc.detail
        if (
            isinstance(detail, dict)
            and isinstance(detail.get("code"), str)
            and isinstance(detail.get("message"), str)
        ):
            return JSONResponse(
                {"detail": detail}, status_code=exc.status_code, headers=exc.headers
            )
        if exc.status_code == 404:
            return error_response(404, "not_found", "内容不存在、已到期或当前账号无法访问。")
        return error_response(
            exc.status_code, "request_rejected", "请求未完成，请检查输入或重新登录。"
        )

    @application.exception_handler(RequestValidationError)
    async def invalid_input(request: Request, exc):
        # Pydantic error details can contain the original private input.
        return error_response(422, "invalid_input", "输入内容无效，请检查后重试。")

    @application.get("/healthz")
    async def health():
        return {"status": "ok", "service": "private-research-workbench"}

    @application.get("/readyz")
    async def ready():
        worker = getattr(application.state, "research_worker", None)
        if (
            config.maintenance
            or getattr(application.state, "maintenance_failed", False)
            or not worker
            or not worker.ready()
            or shutil.disk_usage(config.data_dir).free < config.minimum_free_bytes
        ):
            return error_response(503, "not_ready", "研究服务暂不可接收新的生成。")
        try:
            with closing(
                sqlite3.connect(config.database.as_uri() + "?mode=rw", uri=True, timeout=1)
            ) as connection:
                marker = connection.execute(
                    "SELECT value FROM wb_runtime_meta WHERE key='audience'"
                ).fetchone()
                if marker != ("private-workbench",):
                    raise sqlite3.OperationalError("invalid database role")
        except sqlite3.Error:
            return error_response(503, "not_ready", "研究服务暂不可接收新的生成。")
        return {"status": "ready", "service": "private-research-workbench"}

    @application.middleware("http")
    async def generation_readiness(request, call_next):
        path = request.url.path.rstrip("/")
        generation = (
            request.method == "POST"
            and path.startswith("/api/research/studies/")
            and (path.endswith("/jobs") or path.endswith("/retry"))
        )
        if generation and (
            config.maintenance
            or getattr(application.state, "maintenance_failed", False)
            or not getattr(application.state, "research_worker", None)
            or not application.state.research_worker.ready()
            or shutil.disk_usage(config.data_dir).free < config.minimum_free_bytes
        ):
            return error_response(503, "not_ready", "研究服务暂不可接收新的生成，请稍后重试。")
        return await call_next(request)

    @application.get("/api/admin/audit")
    def audit(
        user=Depends(require_admin),
        limit: int = Query(default=50, ge=1, le=100),
        offset: int = Query(default=0, ge=0, le=1000000),
    ):
        return audit_page(config.database, limit=limit, offset=offset)

    @application.get("/research", include_in_schema=False)
    async def research_page():
        return RedirectResponse("/#/research", status_code=303)

    application.add_middleware(AuthSecurityMiddleware, config=auth_config)
    application.add_middleware(RequestBoundary, config=config)
    base_routes = list(application.router.routes)
    return application

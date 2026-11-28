"""Bounded same-origin requests and safe responses, including error responses."""

import asyncio
import logging

from starlette.responses import JSONResponse

LOG = logging.getLogger(__name__)
MAX_BODY_BYTES = 16 * 1024
MAX_BODY_SECONDS = 10
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https://avatars.githubusercontent.com; "
    "connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; "
    "form-action 'self'; frame-ancestors 'self'"
)


def error_response(status, code, message):
    return JSONResponse({"detail": {"code": code, "message": message}}, status_code=status)


class RequestBoundary:
    def __init__(self, app, *, config):
        self.app = app
        self.config = config

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def safe_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                headers = dict(message.get("headers", []))
                headers[b"cache-control"] = b"no-store"
                headers[b"x-content-type-options"] = b"nosniff"
                headers[b"referrer-policy"] = b"no-referrer"
                headers[b"x-frame-options"] = b"SAMEORIGIN"
                headers[b"permissions-policy"] = b"camera=(), microphone=(), geolocation=()"
                headers.setdefault(b"content-security-policy", CSP.encode("ascii"))
                if self.config.origin.startswith("https://"):
                    headers[b"strict-transport-security"] = b"max-age=31536000"
                # dict would collapse multiple Set-Cookie headers; preserve them.
                cookies = [(k, v) for k, v in message.get("headers", []) if k == b"set-cookie"]
                headers.pop(b"set-cookie", None)
                message = {**message, "headers": list(headers.items()) + cookies}
            await send(message)

        async def reject(status, code, message):
            await error_response(status, code, message)(scope, receive, safe_send)

        headers = scope.get("headers", [])
        hosts = [v.decode("latin-1").lower() for k, v in headers if k == b"host"]
        if hosts != [self.config.host]:
            await reject(400, "invalid_host", "请求入口无效。")
            return
        origins = [v.decode("latin-1") for k, v in headers if k == b"origin"]
        if origins and origins != [self.config.origin]:
            await reject(403, "origin_rejected", "请从研究工作台发起操作。")
            return
        path = scope["path"].rstrip("/")
        if (
            path == "/api/research/jobs"
            or path.startswith("/api/research/jobs/")
            or path in {"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}
        ):
            await reject(404, "not_found", "内容不存在、已到期或当前账号无法访问。")
            return
        unsafe = scope["method"] not in {"GET", "HEAD", "OPTIONS"}
        if unsafe:
            if origins != [self.config.origin]:
                await reject(403, "origin_rejected", "请从研究工作台发起操作。")
                return
            lengths = [v for k, v in headers if k == b"content-length"]
            if lengths and (
                len(lengths) != 1 or not lengths[0].isdigit() or len(lengths[0].lstrip(b"0")) > 6
            ):
                await reject(400, "invalid_length", "请求长度无效。")
                return
            if lengths and int(lengths[0].lstrip(b"0") or b"0") > MAX_BODY_BYTES:
                await reject(413, "request_too_large", "请求内容过长。")
                return
            body = bytearray()
            try:
                async with asyncio.timeout(MAX_BODY_SECONDS):
                    while True:
                        part = await receive()
                        if part["type"] == "http.disconnect":
                            return
                        body.extend(part.get("body", b""))
                        if len(body) > MAX_BODY_BYTES:
                            await reject(413, "request_too_large", "请求内容过长。")
                            return
                        if not part.get("more_body", False):
                            break
            except TimeoutError:
                await reject(408, "request_timeout", "提交请求超时，请检查提交结果。")
                return
            delivered = False

            async def bounded_receive():
                nonlocal delivered
                if delivered:
                    return await receive()
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}

            upstream_receive = bounded_receive
        else:
            upstream_receive = receive
        try:
            await self.app(scope, upstream_receive, safe_send)
        except Exception as exc:
            # Never format the exception, traceback, URL, query, body or headers.
            LOG.error("Workbench request failed (%s)", type(exc).__name__)
            if not started:
                await reject(503, "service_unavailable", "研究服务暂不可用，请稍后重试。")

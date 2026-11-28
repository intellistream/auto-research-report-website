# Internal execution protocol v1

Frozen T04 common contract for T01/T02, NOT a browser API.
Website owns memberships, personal quota, research IDs and report access.
Engine has a separate SQLite and authenticates only the website server.

## Fixed routes and authentication

Every /internal/v1 request requires exactly one Authorization: Bearer <server-token>
header, no browser Origin or Cookie. No credential appears in VITE variables.
Default listeners are loopback; remote operation requires fixed HTTPS or an explicitly
controlled private network. Missing credentials refuse service. No anonymous fallback.

- PUT /internal/v1/executions/{executionId}: persistent acceptance; 202 new or 200 same.
- GET /internal/v1/executions/{executionId}: status; 404 only if never accepted.
- GET /internal/v1/executions/{executionId}/artifacts/{format}: html/json/pdf bytes only.
- POST /internal/v1/executions/{executionId}/cancel: request cooperative cancellation.
- POST /internal/v1/executions/{executionId}/ack: clear terminal artifact bytes after
  website archive/deletion; retain ID/digest/started tombstone forever. Running returns
  409; cancel then reconcile/ack later.

executionId is a UUID generated ONCE in website acceptance transaction.
cancel/ack body is {requestDigest}. Identity mismatch is 409.
Never send owner, Cookie, GitHub credentials, quotas or arbitrary artifact URLs.

## Immutable submission

PUT exact keys: {protocolVersion:1,requestDigest:lowercase-sha256,query:string,days:int,
generationConfig:string,expiresAt:int-UTC-epoch-seconds}.
days is 7/30/90/180/365; query keeps 2..120 character bound.
expiresAt is immutable at acceptance, at most 7 days ahead.
Use research_workbench.engine_protocol.request_digest over the other five fields:
canonical JSON ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False;
UTF-8 SHA256.

Same ID/digest returns original including failure/cancellation. Different input/digest:
409 execution_conflict. Cleared ID:409 execution_gone, never resurrected.
Unknown expired request:422 execution_expired. Configuration mismatch:409 configuration_changed.
Those two rejections never started. Already accepted IDs stay queryable after expiry.
Timeout is UNKNOWN: GET same ID before resending SAME immutable request.
Never refund uncertainty, change ID or start a second model attempt automatically.

## Status

Successful metadata responses directly return:
{protocolVersion:1,executionId,requestDigest,generationConfig,
 status:queued|running|complete|failed|cancelled|cleared,started:bool,stage:string|null,
 createdAt:number,updatedAt:number,startedAt:number|null,finishedAt:number|null,
 revision:positive-int,cancelRequested:bool,errorCode:string|null,
 artifacts:{format:{sha256,bytes,version,contentType}}}.
Times are UTC epoch seconds; revision increases monotonically. Website checks ID/digest/
revision/terminal monotonicity. started is durable and never resets.
Stages retain known research names, unknown never invents progress.
Errors: {detail:{code,message}}, no private input, exception, URL or token.

Complete requires html+json. PDF optional, missing does not fail other formats.
Artifact version=1, immutable; Content-Length/type and ETag match metadata hash.
Website uses configured origin, fixed ID, allowlisted format, no redirects; validates
version/size/SHA256 and archives bytes after checking tombstone/expiry/ownership.
Each artifact max 64 MiB. Duplicate results never cause another charge.

Queued cancel never starts. Running cancel is cooperative at progress/final commit;
cancelRequested can stay true while computation unwinds. Late completion is discarded.
Cleanup retains ID/digest/started facts. Engine restart preserves queued; old running
becomes failed/errorCode=interrupted/started=true, no automatic rerun.
Website restart reconciles mapping, never calls old local recover_interrupted.
Safe error codes: generation_failed,interrupted,configuration_changed,execution_expired,
cancelled. Only confirmed before-start failure can refund ONCE; unknown cannot.

## Parallel composition

Package: server/src/research_workbench. Shared modules T04; auth T01; research T02.
T01 keeps auth exports, database/Cookie/CSRF compatibility.
T02 supplies research.ResearchStore/ResearchConfig/ResearchService/RemoteDispatcher,
research.engine_client.EngineClient. EngineClient(config:EngineConfig|None) supports
offline/unconfigured history. RemoteDispatcher(store,client,*,clock=time) exposes
start/notify/stop/ready; ResearchService keeps worker=dispatcher compatibility.
T02 owns durable dispatch/reconcile/cleanup and schema, without changing original IDs/
report bytes/usage. T04 app no longer calls recover_interrupted or imports upstream.
create_app supports engine_client and dispatcher_factory injections for controlled tests.

Backend-only settings: WORKBENCH_ENGINE_ORIGIN,TOKEN,GENERATION_CONFIG and optional
WORKBENCH_ENGINE_ALLOW_PRIVATE_HTTP. Shared EngineConfig is in engine_protocol and
WorkbenchConfig.engine. Missing config means history-only, unavailable generation.
No fallback local/anonymous executor.

# Private workbench release artifact

The website's default build remains the public Pages site. It never receives
member databases, deletion logs, OAuth secrets or private reports. Set the
public workflow variable `VITE_WORKBENCH_ORIGIN` to the reviewed fixed HTTPS
origin only when the private entry has passed acceptance. The public research
navigation shows a safe unconfigured message until then.

In a clean checkout containing the T03 workbench (website PR #87), use Node.js22:

~~~sh
npm ci
node scripts/build-workbench.mjs --output /absolute/new/private-web-release
~~~

The T04 tool requires the private build capability, fixes
`VITE_WORKBENCH_MODE=enabled`, `VITE_BASE_PATH=/`, clears the public-origin
link and all old anonymous API/discovery/proxy settings, and runs the real
TypeScript/Vite build. It refuses dirty source and an existing output.
It never pushes, publishes Pages, changes DNS or starts a backend.

The output contains a `workbench-release.json` receipt with
`format=research-workbench-web-v1`, `api=same-origin`, root base, source SHA
and every file hash. The upstream private app validates this receipt and serves
only listed assets. Keep the artifact read-only after review and transfer it
through the approved deployment channel. A regular Pages build cannot be used
in its place.

T04's integration patch maps the producer's `needs_revision` status to the
reader's existing “需进一步核查” state. The backend's report and evidence status
remain authoritative; this does not turn a failed review into approval.

The release preparation also updates the existing AJV, React Router and Vite
dependencies to patched versions. Vitest is a test dependency; its older major
still had critical advisories after a minor update, so its verified patched
version is recorded in package.json and package-lock.json. The current test
suite and real workbench build must pass after any dependency change.

Validation uses controlled identities, actual backend sessions and generated
fixtures; it does not claim real GitHub OAuth or public-domain acceptance.
See the upstream `docs/workbench-server.md` for persistence, safe logging,
backup/restore, old anonymous shutdown and rollback instructions.

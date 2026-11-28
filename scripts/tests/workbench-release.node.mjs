import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { sealBuild } from "../build-workbench.mjs";

test("workbench receipt fixes same-origin mode, source version and exact file bytes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "workbench-release-"));
  await writeFile(path.join(dir, "index.html"), "<html>controlled workbench</html>");
  const receipt = await sealBuild(dir, "a".repeat(40));
  assert.equal(receipt.api, "same-origin");
  assert.equal(receipt.mode, "workbench");
  assert.equal(receipt.base, "/");
  assert.equal(receipt.sourceCommit, "a".repeat(40));
  assert.equal(receipt.files["index.html"], createHash("sha256").update(await readFile(path.join(dir, "index.html"))).digest("hex"));
  await assert.rejects(() => sealBuild(dir, "a".repeat(40)), /already exists/);
});

test("runtime database and symlink do not become static workbench assets", async () => {
  const privateDir = await mkdtemp(path.join(tmpdir(), "workbench-private-"));
  await writeFile(path.join(privateDir, "index.html"), "entry");
  await writeFile(path.join(privateDir, "workbench.sqlite3"), "PRIVATE");
  await assert.rejects(() => sealBuild(privateDir, "a".repeat(40)), /runtime/);
  const linkedDir = await mkdtemp(path.join(tmpdir(), "workbench-linked-"));
  await writeFile(path.join(linkedDir, "index.html"), "entry");
  await symlink(path.join(linkedDir, "index.html"), path.join(linkedDir, "copy.html"));
  await assert.rejects(() => sealBuild(linkedDir, "a".repeat(40)), /symlink/);
});

/** Build a versioned, same-origin private workbench outside the Pages artifact. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => createHash("sha256").update(value).digest("hex");

export async function sealBuild(directory, sourceCommit) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error("A full reviewed Git SHA is required.");
  const files = {};
  async function visit(folder) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, item.name);
      const relative = path.relative(directory, full).split(path.sep).join("/");
      if (item.name.startsWith(".") || item.isSymbolicLink()) throw new Error("Hidden files and symlinks are forbidden.");
      if (item.isDirectory()) { await visit(full); continue; }
      if (!item.isFile() || /\.(?:db|sqlite3?|key|pem|log)$/i.test(item.name)) {
        throw new Error("Private runtime files must not be packaged as web assets.");
      }
      if (relative === "workbench-release.json") throw new Error("A build receipt already exists.");
      files[relative] = digest(await readFile(full));
    }
  }
  await visit(directory);
  if (!files["index.html"]) throw new Error("The workbench entry is missing.");
  const receipt = {
    format: "research-workbench-web-v1", mode: "workbench", api: "same-origin",
    base: "/", sourceCommit, files: Object.fromEntries(Object.entries(files).sort()),
  };
  await writeFile(path.join(directory, "workbench-release.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  return receipt;
}

export async function buildWorkbench(output) {
  if (!path.isAbsolute(output) || path.parse(output).root === output) throw new Error("Use a dedicated absolute output directory.");
  try { await lstat(output); throw new Error("The output must not already exist; artifacts are immutable."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const origin = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim();
  if (origin !== "https://github.com/intellistream/auto-research-report-website.git") throw new Error("Unexpected website repository origin.");
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
  if (dirty) throw new Error("Commit or isolate source changes before building a versioned workbench.");
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  await mkdir(path.dirname(output), { recursive: true });
  const staging = output + ".building-" + process.pid;
  await mkdir(staging, { recursive: false, mode: 0o700 });
  // Workbench mode is an explicit private build; no runtime address discovery or cross-origin proxy.
  execFileSync("npm", ["run", "build", "--", "--mode", "workbench", "--outDir", staging], {
    cwd: root, stdio: "inherit",
    env: {
      ...process.env, VITE_BASE_PATH: "/", VITE_RESEARCH_MODE: "private",
      VITE_WORKBENCH_MODE: "enabled", VITE_WORKBENCH_ORIGIN: "", VITE_RESEARCH_API_BASE: "",
      VITE_RESEARCH_API_CONFIG_URL: "", RESEARCH_API_PROXY: "",
    },
  });
  await sealBuild(staging, sourceCommit);
  await rename(staging, output);
  return { directory: output, sourceCommit, mode: "workbench", api: "same-origin", deployed: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== "--output") throw new Error("Usage: node scripts/build-workbench.mjs --output /absolute/new-artifact-directory");
    console.log(JSON.stringify(await buildWorkbench(process.argv[3]), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Workbench build failed.");
    process.exitCode = 1;
  }
}

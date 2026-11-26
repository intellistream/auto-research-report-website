import { readFile, mkdir, writeFile, rename, rm, realpath } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { screenModPrs } from "./lib/mod-pr-screening.mjs";

const USAGE = "node scripts/screen-mod-prs.mjs --corpus .qa/mod-community/corpus-v1 --out .qa/mod-community/screening-v1 [--profiles data/group-research/retrieval-profiles.json]";

function within(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { throw new Error(`Cannot read JSON ${file}: ${error.message}`); }
}
async function qaOutput(root, destination) {
  const qa = path.resolve(root, ".qa");
  const target = path.resolve(root, destination);
  if (!within(qa, target)) throw new Error("Screening output must stay under the repository .qa directory; it is not public site data.");
  // Check existing ancestors before mkdir so a symlink cannot redirect output into public/.
  const rootReal = await realpath(root);
  let ancestor = target;
  while (true) {
    try {
      const resolved = await realpath(ancestor);
      const expected = path.resolve(rootReal, path.relative(root, ancestor));
      if (resolved !== expected) throw new Error("Screening output cannot traverse a symlink outside its .qa path.");
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
  return target;
}

try {
  const { values } = parseArgs({ options: {
    corpus: { type: "string" }, out: { type: "string" }, profiles: { type: "string" }, help: { type: "boolean" },
  }, strict: true, allowPositionals: false });
  if (values.help) {
    console.log(USAGE);
  } else {
    if (!values.corpus || !values.out) throw new Error(`Explicit --corpus and --out are required. ${USAGE}`);
    const root = process.cwd();
    const output = await qaOutput(root, values.out);
    const corpusDirectory = path.resolve(root, values.corpus);
    const [corpus, manifest, profiles] = await Promise.all([
      readJson(path.join(corpusDirectory, "works.json")),
      readJson(path.join(corpusDirectory, "manifest.json")),
      readJson(path.resolve(root, values.profiles || "data/group-research/retrieval-profiles.json")),
    ]);
    if (manifest.schemaVersion !== 1 || !manifest.corpusId || manifest.corpusId !== corpus.corpusId) {
      throw new Error("manifest.json and works.json must describe the same schemaVersion 1 corpusId.");
    }
    const result = screenModPrs({ corpus, profiles });
    await mkdir(output, { recursive: true });
    const temporary = [];
    try {
      for (const name of ["candidates", "coverage"]) {
        const pending = path.join(output, `.${name}-${randomUUID()}.tmp`);
        temporary.push(pending);
        await writeFile(pending, `${JSON.stringify(result[name], null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      }
      for (const [index, name] of ["candidates", "coverage"].entries()) {
        await rename(temporary[index], path.join(output, `${name}.json`));
      }
    } finally {
      await Promise.all(temporary.map(file => rm(file, { force: true })));
    }
    console.log(JSON.stringify({
      corpusId: corpus.corpusId, profileHash: result.coverage.profileHash, rulesVersion: result.candidates.rulesVersion,
      modsScreened: result.coverage.mods.length, corpusWorks: result.coverage.corpusWorkCount,
      candidates: result.candidates.candidates.length, reviewedCount: 0,
      output: path.relative(root, output).split(path.sep).join("/"),
    }));
  }
} catch (error) {
  console.error(`MOD screening failed: ${error.message}`);
  process.exitCode = 1;
}

#!/usr/bin/env node
import { buildCommunityCorpus, writeCommunityCorpus, DEFAULT_SOURCES } from "./lib/community-corpus.mjs";

const help = [
  "Build the offline, site-admitted community PR corpus (QA only).",
  "",
  "Usage: node scripts/build-community-corpus.mjs --out .qa/mod-community/corpus-v1",
  "  --sources <repo-relative.json>  Explicit source whitelist (default: " + DEFAULT_SOURCES + ")",
  "  --generated-at <ISO timestamp>  Optional reproducible manifest clock; excluded from corpusId",
  "  --help                         Print usage",
  "",
  "No network requests, model calls, package hooks, daily imports or public-data writes.",
].join("\n");

function argumentsFor(argv) {
  const options = { root: process.cwd(), sources: DEFAULT_SOURCES, out: ".qa/mod-community/corpus-v1" };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i];
    if (name === "--help") return null;
    if (!["--sources", "--out", "--generated-at"].includes(name)) throw new Error("Unknown argument: " + name);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error("Missing value for " + name);
    options[name === "--generated-at" ? "generatedAt" : name.slice(2)] = value;
  }
  return options;
}

try {
  const options = argumentsFor(process.argv.slice(2));
  if (!options) process.stdout.write(help + "\n");
  else {
    const result = await buildCommunityCorpus(options);
    const summary = await writeCommunityCorpus(result, options);
    process.stdout.write(JSON.stringify({ ...summary, flowCheck: result.manifest.flowCheck.status }, null, 2) + "\n");
  }
} catch (error) {
  process.stderr.write("Community corpus build failed: " + error.message + "\n");
  process.exitCode = 1;
}

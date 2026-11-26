import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildBundle, loadInputs, publishLocal, validateSchema } from "./lib/group-research.mjs";
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => value.startsWith("--") ? [...pairs,[value.slice(2),all[i+1]]] : pairs,[]));
const root = process.cwd();
try {
  if (!args["source-dir"] || !args["evidence-dir"]) throw new Error("Explicit --source-dir and --evidence-dir are required; this command never fetches data.");
  const lock = JSON.parse(await readFile(args["source-lock"] || "data/group-research/sources.lock.json","utf8"));
  const curation = JSON.parse(await readFile(args.curation || "data/group-research/curation.json","utf8"));
  const previous = args.previous ? JSON.parse(await readFile(args.previous,"utf8")) : null;
  const inputs = await loadInputs(args["source-dir"],args["evidence-dir"],lock,curation);
  const bundle = buildBundle({...inputs,previous});
  await validateSchema(bundle,root);
  const index = await publishLocal(bundle,args.out || "public/group-research",previous,args["audit-dir"] || path.join(root,".qa/group-research-withdrawn"));
  console.log(JSON.stringify({snapshotId:index.currentSnapshotId,counts:index.snapshots.at(-1).counts}));
} catch(error) { console.error(error.message); process.exitCode=1; }

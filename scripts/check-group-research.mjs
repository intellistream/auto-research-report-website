import { verifyPublic, validateSchema } from "./lib/group-research.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
try {
 const root=process.cwd(), directory=path.join(root,"public/group-research");
 const index=await verifyPublic(directory);
 for(const row of index.snapshots.filter(s=>!s.withdrawn)) await validateSchema(JSON.parse(await readFile(path.join(directory,row.bundlePath),"utf8")),root);
 console.log("Group MOD snapshots verified: "+index.snapshots.filter(s=>!s.withdrawn).length);
} catch(error) { console.error(error.message); process.exitCode=1; }

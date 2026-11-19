import { spawnSync } from "node:child_process";

for (const topic of ["aclgraph", "speculative-decoding"]) {
  const python = process.platform === "win32" ? "python" : "python3";
  const result = spawnSync(python,
    ["scripts/import-topic-survey.py", "--topic", topic, "--source", `topics/${topic}/survey.json`, "--check"],
    { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

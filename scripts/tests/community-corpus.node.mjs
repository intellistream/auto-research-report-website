import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir, rm, access, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { normalizePrIdentity, indexDailyReport, buildCommunityCorpus, writeCommunityCorpus,
  canonicalStringify, sha256 } from "../lib/community-corpus.mjs";

const root = process.cwd();
const clock = "2026-11-26T08:00:00.000Z";
const id = (number, repo = "example/engine") => "github:" + repo + "#" + number;
const url = (number, repo = "example/engine") => "https://github.com/" + repo + "/pull/" + number;
const entry = (number, options = {}) => ({ kind: "entry", number: "V" + number,
  title: "PR " + number, workId: id(number),
  paragraphs: [[{ text: "问题：原始输入与效果条件保持完整。" }], [{ text: "来源", url: url(number) }]], ...options });
const report = (entries, day = "2026-11-01", version = "current") => ({
  schemaVersion: 1, day, sha256: version, sections: [{ key: "decode", title: "解码", blocks: entries }]
});
const pr = (number, options = {}) => ({ id: id(number), kind: "pr", decision: "included",
  title: "Material " + number, url: url(number), topics: ["reuse"], ...options });
async function put(directory, file, value) {
  await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
  await writeFile(path.join(directory, file), typeof value === "string" ? value : JSON.stringify(value));
}
async function fixture(t, topicSources = [], extraPolicy = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "community-corpus-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const policy = { schemaVersion: 1, rulesVersion: "test/1", scope: "isolated fixture",
    daily: { catalog: "public/word-reports/catalog.json", flowIndex: "public/word-reports/flow-index.json",
      versionPolicy: "catalog_current_only" }, topicSources, exclusions: [], ...extraPolicy };
  await put(directory, "data/group-research/corpus-sources.json", policy);
  await put(directory, "public/word-reports/catalog.json", { schemaVersion: 1, days: {
    "2026-11-01": { current: "current", versions: [
      { sha256: "old", path: "2026-11-01/old/report.json" },
      { sha256: "current", path: "2026-11-01/current/report.json" }] }
  } });
  await put(directory, "public/word-reports/2026-11-01/current/report.json", report([entry(1)]));
  await put(directory, "public/word-reports/2026-11-01/old/report.json", report([entry(900)], "2026-11-01", "old"));
  await put(directory, "public/word-reports/flow-index.json", { schemaVersion: 1,
    entries: [{ day: "2026-11-01", version: "current", number: "V1", workId: id(1) }] });
  return { directory, policy, build: options => buildCommunityCorpus({ root: directory, generatedAt: clock, ...options }) };
}
const descriptor = (adapter, filename = adapter) => ({
  id: adapter, adapter, path: "materials/" + filename + ".json", include: ["fixture whitelist"], boundary: "explicit"
});

test("full GitHub identity normalizes URL variants; identical numbers in different repositories stay distinct", () => {
  const expected = { workId: "github:example/engine#12", repository: "example/engine", number: 12, url: url(12) };
  for (const value of ["github:Example/Engine#12", url(12), url(12) + "?diff=split#discussion_r1",
    url(12) + "/files", url(12) + "/commits/abcd", url(12) + ".patch", "http://GITHUB.COM/Example/Engine/pull/12/"]) {
    assert.deepEqual(normalizePrIdentity(value), expected);
  }
  assert.notEqual(normalizePrIdentity(id(12, "example/other")).workId, expected.workId);
  for (const value of ["#12", "vllm#12", "paper:arxiv:1234.56789", url(0), id("01"),
    "https://api.github.com/repos/example/engine/pulls/12", "https://github.com/example/engine/issues/12",
    "https://github.com/example/engine/blob/12/file.py", "https://github.com/example/engine/tree/12",
    "https://github.com/example/engine/commit/12", "https://github.com.evil.test/example/engine/pull/12",
    "https://user:secret@github.com/example/engine/pull/12", url(12) + "/not-a-pr-view",
    "github:example/engine#9007199254740992"]) assert.equal(normalizePrIdentity(value), null, value);
});

test("a declared main PR keeps an explicitly linked prerequisite separate, with exact original text and pointers", () => {
  const raw = entry(65103, { number: "V17", paragraphs: [
    [{ text: "问题：扫描开销。" }], [{ text: "优化方法：复用归一化。" }],
    [{ text: "在前置 #65102 的 707.5 微秒上继续减少。（" },
      { text: "主体 #65103", url: url(65103) }, { text: "、" }, { text: "前置 #65102", url: url(65102) }, { text: "）" }]
  ] });
  const result = indexDailyReport(report([raw]), { sourceFile: "daily/report.json", day: "2026-11-01", version: "current" });
  assert.equal(result.counts.entryOccurrences, 1);
  assert.equal(result.counts.mainOccurrences, 1);
  assert.equal(result.counts.explicitPrLinkOccurrences, 2);
  const main = result.records.find(row => row.observation.role === "daily_main");
  const dependency = result.records.find(row => row.identity.number === 65102);
  assert.equal(main.identity.number, 65103);
  assert.equal(dependency.observation.role, "daily_reference");
  assert.equal(dependency.observation.referenceKind, "prerequisite");
  assert.equal(dependency.observation.mainWorkId, id(65103));
  assert.equal(dependency.observation.jsonPointer, "/sections/0/blocks/0/paragraphs/2/3/url");
  assert.deepEqual(main.observation.raw, raw);
  assert.equal(main.observation.text, "问题：扫描开销。\n\n优化方法：复用归一化。\n\n在前置 #65102 的 707.5 微秒上继续减少。（主体 #65103、前置 #65102）");
  assert.equal(new URL("https://local.test" + dependency.observation.href).searchParams.get("section"), "V17");
});

test("multi-PR entries keep all declared identities; ambiguous unlabelled links do not become arbitrary mains", () => {
  const multi = entry(11, { workIds: [id(12)], paragraphs: [[{ text: "主一", url: url(11) },
    { text: "主二", url: url(12) }, { text: "对照 #13", url: url(13) }]] });
  const projected = indexDailyReport(report([multi]), { sourceFile: "a.json", day: "2026-11-01", version: "current" });
  assert.equal(projected.counts.entryOccurrences, 1);
  assert.equal(projected.counts.mainOccurrences, 2);
  assert.equal(projected.records.find(row => row.identity.number === 13).observation.referenceKind, "comparison");
  const ambiguous = { ...multi };
  delete ambiguous.workId; delete ambiguous.workIds;
  const uncertain = indexDailyReport(report([ambiguous]), { sourceFile: "a.json", day: "2026-11-01", version: "current" });
  assert.equal(uncertain.counts.mainOccurrences, 0);
  assert.equal(uncertain.records.length, 3);
  assert.ok(uncertain.records.every(row => row.observation.role === "daily_reference"));
  assert.equal(uncertain.notes[0].kind, "ambiguous_main_identity");
  const single = entry(14); delete single.workId;
  const inferred = indexDailyReport(report([single]), { sourceFile: "a.json", day: "2026-11-01", version: "current" });
  assert.equal(inferred.records[0].identity.workId, id(14));
  assert.equal(inferred.notes[0].kind, "main_inferred_from_single_link");
});

test("catalog current versions define intake; old versions, unrelated JSON and papers do not enter PR counts", async t => {
  const f = await fixture(t);
  const papers = { kind: "entry", number: "P1", title: "独立论文", workId: "paper:arxiv:2601.00001",
    paragraphs: [[{ text: "论文", url: "https://arxiv.org/abs/2601.00001" },
      { text: "代码", url: "https://github.com/example/engine/blob/main/paper.md" }]] };
  const current = report([entry(1), papers]);
  current.sections[0].blocks.push({ kind: "paragraph", parts: [{ text: "来源示意", url: "https://github.com/example/engine/issues/91" }] });
  await put(f.directory, "public/word-reports/2026-11-01/current/report.json", current);
  await put(f.directory, "materials/unlisted.json", { entries: [pr(901)] });
  const built = await f.build();
  assert.deepEqual(built.works.works.map(row => row.workId), [id(1)]);
  assert.equal(built.manifest.counts.dailyPaperEntryOccurrences, 1);
  assert.equal(built.manifest.currentReports[0].excludedVersions, 1);
  assert.ok(!built.manifest.inputs.some(input => /old\/report|unlisted/.test(input.path)));
  assert.equal(built.manifest.flowCheck.status, "matched");
});

test("missing/duplicate current pointers, version mismatches, synthetic reports and escaped paths fail before output", async t => {
  const f = await fixture(t);
  const catalogPath = "public/word-reports/catalog.json";
  const catalog = JSON.parse(await readFile(path.join(f.directory, catalogPath), "utf8"));
  catalog.days["2026-11-01"].current = "missing";
  await put(f.directory, catalogPath, catalog);
  await assert.rejects(f.build(), /exactly one version/);
  catalog.days["2026-11-01"].current = "current";
  catalog.days["2026-11-01"].versions.push(catalog.days["2026-11-01"].versions[1]);
  await put(f.directory, catalogPath, catalog);
  await assert.rejects(f.build(), /exactly one version/);
  catalog.days["2026-11-01"].versions.pop();
  catalog.days["2026-11-01"].versions[1].path = "../outside.json";
  await put(f.directory, catalogPath, catalog);
  await assert.rejects(f.build(), /repository-relative/);
  catalog.days["2026-11-01"].versions[1].path = "2026-11-01/current/report.json";
  await put(f.directory, catalogPath, catalog);
  await put(f.directory, "public/word-reports/2026-11-01/current/report.json", report([entry(1)], "2026-11-02", "current"));
  await assert.rejects(f.build(), /identity\/version mismatch/);
  await put(f.directory, "public/word-reports/2026-11-01/current/report.json", { ...report([entry(1)]), synthetic: true });
  await assert.rejects(f.build(), /Synthetic/);
  await assert.rejects(access(path.join(f.directory, ".qa")));
});

test("KV intake excludes search receipts/rejected/pending material; snapshots require admitted membership; topic KV legacy is excluded", async t => {
  const descriptors = ["kv_research", "kv_community", "kv_weekly"].map(adapter => descriptor(adapter));
  descriptors.push({ ...descriptor("topic_index"), excludeTopicIds: ["kv-cache"] });
  const f = await fixture(t, descriptors);
  await put(f.directory, descriptors[0].path, { entries: [pr(10), pr(11, { decision: "excluded" }),
    pr(12, { decision: "pending" }), pr(13, { kind: "paper" })] });
  await put(f.directory, descriptors[1].path, { edition: "2026-11-23", newEntries: [pr(14)],
    snapshots: [pr(10, { checkedAt: "2026-11-23", headSha: "new", baseline: { checkedAt: "2026-11-17", headSha: "old" } }), pr(14), pr(91)], stories: [], evidenceReview: { checks: [] },
    observations: [], followUps: [], search: { candidates: [pr(92), pr(10)] } });
  await put(f.directory, descriptors[2].path, { sources: [
    { ...pr(10), id: "recheck", workId: id(10), kind: "pr", url: "https://github.com/a/fork/tree/abc",
      version: "abc", checkedAt: "2026-11-24" },
    { id: "paper", kind: "paper", workId: "paper:arxiv:2601.00001", url: url(93) },
    { id: "proposal", kind: "proposal", workId: "github-issue:example/engine#94", url: "https://github.com/example/engine/issues/94" }
  ], reports: [], revisions: [] });
  await put(f.directory, descriptors[3].path, { topics: [
    { id: "kv-cache", entries: [pr(95, { workId: id(95) })] },
    { id: "aclgraph", entries: [pr(15, { workId: id(15), day: "2026-11-01", version: "current", number: "A1" })],
      report: { version: "frozen-topic-version", asOf: "2026-11-18", references: [
        { id: "E1", kind: "pr", title: "PR", url: url(16) },
        { id: "D1", kind: "documentation", title: "Code", url: "https://github.com/example/engine/blob/main/a" },
        { id: "P1", kind: "paper", title: "Paper", url: url(96) },
        { id: "E2", kind: "pr", title: "Issue miscitation", url: "https://github.com/example/engine/issues/97" }
      ], evidenceDetails: [{ id: "E1-detail", mechanism: "机制正文", sourceIds: ["E1"] }] } }
  ] });
  const built = await f.build(), works = new Map(built.works.works.map(work => [work.workId, work]));
  assert.deepEqual([...works.keys()].sort(), [1, 10, 14, 15, 16].map(n => id(n)).sort());
  assert.equal(built.manifest.counts.topicNewPRs, 4);
  assert.equal(built.diagnostics.sources.find(row => row.adapter === "kv_community").excluded.raw_search_candidates, 2);
  assert.equal(built.diagnostics.sources.find(row => row.adapter === "topic_index").excluded["superseded_kv-cache"], 1);
  assert.equal(works.get(id(10)).observations.find(row => row.referenceKind === "material" && row.sourceFile.includes("kv_weekly")).sourceUrl,
    "https://github.com/a/fork/tree/abc");
  assert.ok(works.get(id(16)).observations.some(row => row.text.includes("机制正文")));
  assert.ok(works.get(id(16)).observations.every(row => row.topicReportVersion === "frozen-topic-version" && row.topicReportAsOf === "2026-11-18"));
  const baseline = works.get(id(10)).observations.find(row => row.referenceKind === "baseline_state");
  assert.equal(baseline.observedAt, "2026-11-17");
  assert.equal(baseline.prVersion.headSha, "old");
  assert.equal(built.diagnostics.notes.find(row => row.kind === "non_pr_reference_url").url,
    "https://github.com/example/engine/issues/97");
});

test("repository identity conflicts inside a typed PR record cannot silently merge different works", async t => {
  const source = descriptor("kv_research"), f = await fixture(t, [source]);
  await put(f.directory, source.path, { entries: [pr(10, { url: url(10, "example/different") })] });
  await assert.rejects(f.build(), /Conflicting PR identities/);
});

test("repeated daily observations and topic copies merge by full identity while retaining all source records", async t => {
  const source = descriptor("kv_research"), f = await fixture(t, [source]);
  const catalog = JSON.parse(await readFile(path.join(f.directory, "public/word-reports/catalog.json"), "utf8"));
  catalog.days["2026-11-02"] = { current: "later", versions: [{ sha256: "later", path: "2026-11-02/later/report.json" }] };
  await put(f.directory, "public/word-reports/catalog.json", catalog);
  await put(f.directory, "public/word-reports/2026-11-02/later/report.json", report([entry(1)], "2026-11-02", "later"));
  await put(f.directory, source.path, { entries: [pr(1), pr(1, { id: id(1, "example/other"), url: url(1, "example/other") })] });
  const built = await f.build(), one = built.works.works.find(work => work.workId === id(1));
  assert.equal(one.observations.length, 3);
  assert.equal(new Set(one.observations.map(row => row.id)).size, 3);
  assert.equal(built.manifest.counts.dailyMainOccurrences, 2);
  assert.equal(built.manifest.counts.dailyMainUniquePRs, 1);
  assert.equal(built.manifest.counts.totalUniquePRs, 2);
  assert.equal(built.manifest.periodEnd, "2026-11-02");
  assert.equal(built.manifest.flowCheck.missingMainOccurrencesFromFlow.length, 1);
});

test("flow is a version-aware cross-check and cannot introduce a stale or duplicate extra PR", async t => {
  const f = await fixture(t);
  const row = { day: "2026-11-01", version: "current", number: "V1", workId: id(1) };
  await put(f.directory, "public/word-reports/flow-index.json", { schemaVersion: 1, entries: [
    row, row, { ...row, version: "old", workId: id(999) }
  ] });
  const built = await f.build();
  assert.equal(built.manifest.counts.flowOccurrences, 3);
  assert.equal(built.manifest.counts.flowCurrentOccurrences, 2);
  assert.equal(built.manifest.counts.flowStaleOccurrences, 1);
  assert.equal(built.manifest.counts.flowDuplicateOccurrences, 1);
  assert.deepEqual(built.works.works.map(work => work.workId), [id(1)]);
  assert.equal(built.manifest.flowCheck.status, "differences");
});

async function runtimeFixture(t) {
  const source = descriptor("kv_research");
  const runtime = { entryPoint: "src/TopicPages.tsx", indexLoader: "src/Loader.tsx", indexRequest: "topics.json",
    staticJson: [source.path], globs: [{ module: "src/weekly.ts", pattern: "../weekly/*.json",
      directory: "weekly", suffix: ".json", adapter: "specdec_weekly", selection: "all direct imported editions" }] };
  const f = await fixture(t, [source], { runtime });
  await put(f.directory, source.path, { entries: [pr(10)] });
  await put(f.directory, "src/TopicPages.tsx",
    'import data from "../materials/kv_research.json";\nimport type X from "../unused.json";\nimport { type Y } from "../unused-two.json";\nexport * from "./weekly";\n');
  await put(f.directory, "src/Loader.tsx", 'const value = useJson("topics.json");\n');
  await put(f.directory, "src/weekly.ts",
    'const files = import.meta.glob<Edition>("../weekly/*.json", { eager: true, import: "default" });\n');
  await put(f.directory, "weekly/2026-11-01.json", { id: "2026-11-01", sources: [
    pr(20, { workId: id(20), number: "V20" })], stories: [], otherGroups: [], tracking: [], synthesis: [] });
  await put(f.directory, "weekly/2026-11-08.json", { id: "2026-11-08", sources: [
    pr(20, { workId: id(20), number: "V20", headSha: "later" })], stories: [], otherGroups: [], tracking: [], synthesis: [] });
  await put(f.directory, "weekly/draft/ignored.json", { sources: [pr(99)] });
  await put(f.directory, "unused.json", { entries: [pr(98)] });
  return f;
}

test("actual runtime imports and exact nonrecursive glob define the topic source boundary; type-only imports are ignored", async t => {
  const f = await runtimeFixture(t), built = await f.build();
  assert.deepEqual(built.diagnostics.runtimeImportGraph.staticJson, ["materials/kv_research.json"]);
  assert.deepEqual(built.works.works.map(work => work.workId).sort(), [id(1), id(10), id(20)].sort());
  assert.equal(built.works.works.find(work => work.workId === id(20)).observations.length, 2);
  assert.equal(built.manifest.sourceWhitelist.filter(source => source.adapter === "specdec_weekly").length, 2);
  assert.ok(!built.manifest.inputs.some(input => /unused|draft/.test(input.path)));
  await put(f.directory, "src/TopicPages.tsx", 'import data from "../materials/kv_research.json";\nimport "../new.json";\nexport * from "./weekly";\n');
  await put(f.directory, "new.json", { entries: [pr(97)] });
  await assert.rejects(f.build(), /Runtime JSON whitelist drift/);
});

test("an added runtime glob or removed topic-index loader requires a reviewed policy update", async t => {
  const f = await runtimeFixture(t);
  await put(f.directory, "src/weekly.ts", 'const files=import.meta.glob("../weekly/**/*.json");\n');
  await assert.rejects(f.build(), /glob whitelist drift/);
  await put(f.directory, "src/weekly.ts", 'const files=import.meta.glob("../weekly/*.json");\n');
  await put(f.directory, "src/Loader.tsx", "const value = null;\n");
  await assert.rejects(f.build(), /no longer requested/);
});

test("corpusId ignores generation time and unadmitted files, but changes with an admitted input hash", async t => {
  const f = await fixture(t);
  const first = await f.build(), second = await f.build({ generatedAt: "2026-11-27T09:00:00.000Z" });
  assert.equal(first.manifest.corpusId, second.manifest.corpusId);
  assert.deepEqual(first.works, second.works);
  assert.notEqual(first.manifest.generatedAt, second.manifest.generatedAt);
  await put(f.directory, "public/word-reports/2026-11-01/old/report.json", report([entry(901)], "2026-11-01", "old"));
  assert.equal((await f.build()).manifest.corpusId, first.manifest.corpusId);
  const changed = report([entry(1, { title: "真实输入修订" })]);
  await put(f.directory, "public/word-reports/2026-11-01/current/report.json", changed);
  const third = await f.build();
  assert.notEqual(third.manifest.corpusId, first.manifest.corpusId);
  assert.notEqual(third.manifest.inputs.find(input => input.role === "current_daily_report").sha256,
    first.manifest.inputs.find(input => input.role === "current_daily_report").sha256);
});

test("full text publication is restricted to .qa, with verifiable output hashes and no public or symlink escape", async t => {
  const f = await fixture(t), built = await f.build();
  await writeCommunityCorpus(built, { root: f.directory, out: ".qa/corpus" });
  const works = await readFile(path.join(f.directory, ".qa/corpus/works.json"));
  const diagnostics = await readFile(path.join(f.directory, ".qa/corpus/diagnostics.json"));
  const manifest = JSON.parse(await readFile(path.join(f.directory, ".qa/corpus/manifest.json"), "utf8"));
  assert.equal(sha256(works), manifest.worksSha256);
  assert.equal(sha256(diagnostics), manifest.diagnosticsSha256);
  assert.equal(JSON.parse(works).corpusId, manifest.corpusId);
  await assert.rejects(writeCommunityCorpus(built, { root: f.directory, out: "public/corpus" }), /under repository .qa/);
  await put(f.directory, "outside/placeholder", "");
  await symlink(path.join(f.directory, "outside"), path.join(f.directory, ".qa/link"));
  await assert.rejects(writeCommunityCorpus(built, { root: f.directory, out: ".qa/link" }), /symlink escapes/);
  await assert.rejects(access(path.join(f.directory, "outside/works.json")));
});

test("stable serialization is independent of object insertion order and matches JSON omission rules", () => {
  assert.equal(canonicalStringify({ b: 2, a: 1, missing: undefined }), '{"a":1,"b":2}');
  assert.equal(canonicalStringify({ b: { d: 4, c: 3 }, a: 1 }), canonicalStringify({ a: 1, b: { c: 3, d: 4 } }));
});

test("real current site corpus retains the known PR sources and prerequisite without asserting frozen totals", async () => {
  const built = await buildCommunityCorpus({ root, generatedAt: clock });
  const { counts } = built.manifest;
  assert.equal(built.manifest.flowCheck.status, "matched");
  assert.equal(counts.dailyMainOccurrences, counts.flowCurrentOccurrences);
  assert.equal(counts.totalUniquePRs, counts.dailyAllUniquePRs + counts.topicNewPRs);
  assert.equal(counts.totalUniquePRs, built.works.works.length);
  assert.equal(counts.totalObservations, built.works.works.reduce((sum, work) => sum + work.observations.length, 0));
  const works = new Map(built.works.works.map(work => [work.workId, work]));
  const dependency = works.get("github:vllm-project/vllm#65102");
  const source = dependency.observations.find(row => row.day === "2026-11-02" && row.entryNumber === "V17" && row.role === "daily_reference");
  assert.equal(source.mainWorkId, "github:vllm-project/vllm#65103");
  assert.equal(source.referenceKind, "prerequisite");
  assert.ok(!dependency.observations.some(row => row.role === "daily_main"));
  for (const [repo, numbers] of [["vllm", [59774, 60130, 61589, 66558]], ["vllm-ascend", [19708, 19976, 21191]]])
    for (const number of numbers) assert.ok(works.has("github:vllm-project/" + repo + "#" + number), repo + "#" + number);
  assert.ok(built.manifest.inputs.every(input => !path.isAbsolute(input.path) && /^[a-f0-9]{64}$/.test(input.sha256)));
  assert.ok(built.works.works.every(work => work.repository.includes("/") && work.observations.every(row => row.href.startsWith("/"))));
});

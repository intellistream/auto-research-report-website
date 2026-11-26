import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm, access, symlink } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { RULES_VERSION, normalizeText, canonicalWorkIdentity, validateProfiles, screenModPrs, hashProfiles } from "../lib/mod-pr-screening.mjs";

const root = process.cwd();
const runFile = promisify(execFile);
const realProfiles = JSON.parse(await readFile(path.join(root, "data/group-research/retrieval-profiles.json"), "utf8"));
const frozenBytes = await readFile(path.join(root, realProfiles.scope.sourceFile));
const frozen = JSON.parse(frozenBytes).payload;

function profilesFor(...componentIds) {
  const document = structuredClone(realProfiles);
  document.profiles = document.profiles.filter(profile => componentIds.includes(profile.componentId));
  document.scope.expectedModCount = componentIds.length;
  return document;
}
function smallProfiles() {
  return { schemaVersion: 1, rulesVersion: RULES_VERSION, weakTerms: ["cache", "attention", "boundary"], profiles: [{
    modId: "mod:fixture:retrieval", componentId: "retrieval", problem: "隔离测试：草稿 KV 的检索约束", mechanism: "检索已提交的草稿 KV", stageIds: ["speculative"],
    groups: [
      { id: "object", kind: "object", label: "草稿 KV", terms: ["draft KV", "草稿KV"] },
      { id: "mechanism", kind: "mechanism", label: "检索", terms: ["retrieval", "检索"] },
      { id: "alias", kind: "alias", label: "专名", terms: ["DiffSpec"] },
      { id: "context", kind: "context", label: "辅助环节", terms: ["decode", "prefill"] },
    ], rules: [{ id: "object+mechanism", all: ["object", "mechanism"] }],
  }] };
}
function observation(text, overrides = {}) {
  return { id: "daily:fixture:1", role: "daily_main", sourceFile: "public/word-reports/fixture/report.json",
    jsonPointer: "/chapters/0/entries/0", title: "隔离测试条目", text,
    href: "/reports/2026-11-02?version=fixture&section=V17", ...overrides };
}
function work(text = "draft KV retrieval", overrides = {}) {
  return { workId: "github:vllm-project/vllm#1", title: "隔离测试 PR", url: "https://github.com/vllm-project/vllm/pull/1",
    repository: "vllm-project/vllm", number: 1, observations: [observation(text)], ...overrides };
}
function corpus(works = []) {
  return { schemaVersion: 1, corpusId: "fixture:screening-only", works };
}
function screen(works, profiles = smallProfiles()) {
  return screenModPrs({ corpus: corpus(works), profiles });
}
function pointerValue(document, pointer) {
  return pointer.split("/").slice(1).reduce((current, key) => current[key.replace(/~1/g, "/").replace(/~0/g, "~")], document);
}

test("all 38 profiles preserve frozen public facts, source locators, aliases and disclosed interfaces", () => {
  validateProfiles(realProfiles);
  assert.equal(realProfiles.profiles.length, 38);
  assert.deepEqual(realProfiles.profiles.map(profile => profile.modId).sort(), frozen.mods.map(mod => mod.id).sort());
  assert.equal(createHash("sha256").update(frozenBytes).digest("hex"), realProfiles.scope.sourceSha256);
  for (const profile of realProfiles.profiles) {
    const mod = pointerValue(JSON.parse(frozenBytes), profile.source.jsonPointer);
    assert.equal(profile.modId, mod.id);
    assert.equal(profile.problem, mod.facts.problem);
    assert.equal(profile.problemBasis, mod.facts.problemBasis);
    assert.equal(profile.mechanism, mod.facts.summary);
    assert.deepEqual(profile.applicability, mod.facts.compatibility);
    assert.deepEqual(profile.stageIds, mod.stages);
    assert.deepEqual(profile.source.officialSourceRefs, mod.sourceRefs);
    assert.ok(mod.aliases.every(alias => profile.aliases.includes(alias)));
    const disclosed = JSON.stringify(mod.facts);
    for (const name of profile.interfaces) assert.ok(disclosed.includes(name), `${profile.componentId}: undisclosed API ${name}`);
  }
  for (const id of ["core-attention-boundary", "ascend-attention-boundary", "hust-m01-correction", "short-prefill-tail"]) {
    const profile = realProfiles.profiles.find(profile => profile.componentId === id);
    assert.equal(profile.problemBasis, "source_insufficient");
    assert.ok(profile.problem.includes("尚未"));
    assert.ok(!profile.groups.some(group => group.kind === "problem"));
  }
});

test("NFKC, punctuation and bilingual expressions retain exact original matched text and UTF-16 offsets", () => {
  assert.equal(normalizeText("  ＫＶ＿Ｃａｃｈｅ—ＩＮＴ８  "), "kv cache int8");
  assert.equal(normalizeText("Cafe\u0301"), "café");
  const source = corpus([work("😀 KV缓存使用动态 ＩＮＴ８ 逐通道量化。")]);
  const output = screenModPrs({ corpus: source, profiles: profilesFor("quantized-kv-cache-migration") });
  assert.equal(output.candidates.candidates.length, 1);
  const matches = output.candidates.candidates[0].matchedGroups.flatMap(group => group.matches);
  assert.ok(matches.some(match => match.matchedText === "ＩＮＴ８"));
  assert.ok(matches.some(match => match.matchedText === "KV缓存"));
  for (const match of matches) {
    const original = pointerValue(source, match.corpusJsonPointer);
    assert.equal(original.slice(match.span.start, match.span.end), match.matchedText);
    assert.ok(match.excerpt.includes(match.matchedText));
    assert.equal(match.sourceFile, source.works[0].observations[0].sourceFile);
    assert.equal(match.jsonPointer, "/chapters/0/entries/0");
    assert.equal(match.observationId, "daily:fixture:1");
  }
});

test("a dedicated alias still requires another signal, and Latin substring matches are rejected", () => {
  const profiles = smallProfiles();
  profiles.profiles[0].rules = [{ id: "alias+object", all: ["alias", "object"] }];
  assert.equal(screen([work("ＤｉｆｆＳｐｅｃ 的草稿KV")], profiles).candidates.candidates.length, 1);
  for (const text of ["DiffSpec", "notdiffspecx draft KV", "diffspec2 draft KV"]) {
    assert.equal(screen([work(text)], profiles).candidates.candidates.length, 0, text);
  }
});

test("an explicit public interface combines with the actual object instead of qualifying by itself", () => {
  const profiles = profilesFor("prefill-admission");
  const output = screen([work("通过 long_prefill_token_threshold 管理短请求准入。")], profiles);
  assert.equal(output.candidates.candidates.length, 1);
  assert.ok(output.candidates.candidates[0].matchedGroups.some(group => group.kind === "interface"));
  assert.equal(screen([work("long_prefill_token_threshold")], profiles).candidates.candidates.length, 0);
});

test("weak standalone words and stage-only matches do not recall candidates across all 38 MODs", () => {
  for (const text of ["cache attention boundary", "缓存 注意力 边界", "prefill decode startup scheduling", "worker graph state H2D"]) {
    const output = screen([work(text)], realProfiles);
    assert.equal(output.candidates.candidates.length, 0, text);
    assert.ok(output.coverage.mods.every(mod => mod.candidateCount === 0 && mod.reviewedCount === 0));
  }
});

test("six known PR title/context fixtures remain searchable; #21191 does not imply boundary search", () => {
  const cases = [
    ["quantized-kv-cache-migration", "[ROCm] Octave KV (`ROCM_OCTAVE`): native 3-bit KV cache backend for AMD GPUs"],
    ["diffspec", "[Core][Spec Decode] Lookahead block hashes for EAGLE prefix caching"],
    ["hust-joint-packed", "[KV Offload] SimpleCPUOffload: one host buffer per rank, opt-in HugeTLB pages"],
    ["sealed-serving-warmup", "[Refactor][Triton] triton warmup jit"],
    ["kv-materialization-arrival-control", "[Core] Count KV connector hits in cache-aware admission"],
    ["prefix-router-migration", "[Feature][Proxy] Add opt-in prefill session affinity", "【隔离测试语境，非原文摘录】会话亲和路由"],
  ];
  for (const [id, title, context = ""] of cases) {
    const output = screen([work(context, { title })], profilesFor(id));
    assert.equal(output.candidates.candidates.length, 1, id);
    assert.equal(output.candidates.candidates[0].status, "needs_review");
  }
  const title = "[Performance][Attention] Reuse device query boundaries to avoid redundant H2D";
  const output = screen([work("复用设备端 query 边界，移除冗余 H2D 拷贝。", { title })], profilesFor("core-attention-boundary", "ascend-attention-boundary"));
  assert.equal(output.candidates.candidates.length, 0);
});

test("overlapping or repeated alias/object subphrases count as one signal", () => {
  const profiles = smallProfiles();
  profiles.profiles[0].groups.find(group => group.id === "mechanism").terms = ["compact draft KV"];
  assert.equal(screen([work("compact draft KV; compact draft KV", { title: "compact draft KV" })], profiles).candidates.candidates.length, 0);
});

test("signals combine within one observation, never from unrelated observations; stage metadata cannot exclude a match", () => {
  const separated = work("", { observations: [observation("draft KV", { id: "one" }), observation("retrieval", { id: "two", role: "topic" })] });
  assert.equal(screen([separated]).candidates.candidates.length, 0);
  const together = work("retrieval", { observations: [observation("retrieval", { title: "draft KV", stageIds: ["startup"] })] });
  assert.equal(screen([together]).candidates.candidates.length, 1);
});

test("cross-source observations and URL variants merge by full identity, preserving reference roles", () => {
  const main = observation("draft KV retrieval", { id: "daily-main" });
  const reference = observation("草稿KV检索", { id: "daily-reference", role: "daily_reference", mainWorkId: "github:vllm-project/vllm#2", referenceKind: "prerequisite" });
  const topic = observation("draft KV retrieval", { id: "topic", role: "topic", sourceFile: "public/topic/fixture.json", jsonPointer: "/works/0" });
  const duplicate = work("", { workId: "github:VLLM-PROJECT/VLLM#1", repository: "VLLM-PROJECT/VLLM",
    url: "https://github.com/VLLM-PROJECT/VLLM/pull/1/files?view=split#diff-a", observations: [topic, main] });
  const output = screen([work("", { observations: [main, reference] }), duplicate]);
  assert.equal(output.candidates.candidates.length, 1);
  const candidate = output.candidates.candidates[0];
  assert.equal(candidate.workId, "github:vllm-project/vllm#1");
  assert.equal(candidate.url, "https://github.com/vllm-project/vllm/pull/1");
  assert.deepEqual(candidate.observationIds, ["daily-main", "daily-reference", "topic"]);
  const match = candidate.matchedGroups.flatMap(group => group.matches).find(match => match.role === "daily_reference");
  assert.equal(match.mainWorkId, "github:vllm-project/vllm#2");
  assert.equal(match.referenceKind, "prerequisite");
  assert.equal(output.coverage.mods[0].candidateCount, 1);
  assert.equal(output.coverage.corpusWorkCount, 1);
});

test("same-number PRs from different repositories remain two separate works and candidates", () => {
  const other = work("draft KV retrieval", { workId: "github:vllm-project/vllm-ascend#1", repository: "vllm-project/vllm-ascend",
    url: "https://github.com/vllm-project/vllm-ascend/pull/1" });
  const output = screen([work(), other]);
  assert.equal(output.candidates.candidates.length, 2);
  assert.equal(new Set(output.candidates.candidates.map(candidate => candidate.id)).size, 2);
  assert.equal(output.coverage.mods[0].candidateCount, 2);
});

test("identity mismatch, non-PR URLs, bad locators and conflicting observations fail instead of reporting screened", () => {
  for (const overrides of [
    { url: "https://github.com/vllm-project/vllm-ascend/pull/1" }, { number: 2 },
    { url: "https://github.com/vllm-project/vllm/issues/1" }, { workId: "paper:arxiv:1" },
    { observations: [observation("draft KV retrieval", { sourceFile: "/absolute/private.json" })] },
    { observations: [observation("draft KV retrieval", { sourceFile: "../private.json" })] },
    { observations: [observation("draft KV retrieval", { sourceFile: "https://example.com/private.json" })] },
    { observations: [observation("draft KV retrieval", { href: "https://github.com/example/repo" })] },
    { observations: [observation("draft KV"), observation("retrieval")] },
  ]) assert.throws(() => screen([work("", overrides)]));
  assert.equal(canonicalWorkIdentity(work("", { url: "https://www.github.com/vllm-project/vllm/pull/1/commits?x=1#sha" })).workId,
    "github:vllm-project/vllm#1");
});

test("title-only evidence records a corpus title pointer without inventing observation/original-code review", () => {
  const output = screen([work("", { title: "draft KV retrieval", observations: [] })]);
  const candidate = output.candidates.candidates[0];
  assert.equal(candidate.evidenceScope, "local_corpus_title_only");
  assert.deepEqual(candidate.observationIds, []);
  assert.ok(candidate.matchedGroups.every(group => group.matches.every(match => match.field === "work.title"
    && match.corpusJsonPointer === "/works/0/title" && match.sourceFile === null && match.observationId === null)));
  assert.equal(output.coverage.mods[0].reviewedCount, 0);
});

test("empty corpus and no hits still cover all 38 MODs with an honest corpusId and zero reviewed counts", () => {
  for (const works of [[], [work("unrelated document formatting")]]) {
    const output = screen(works, realProfiles);
    assert.equal(output.coverage.mods.length, 38);
    assert.equal(output.coverage.corpusId, "fixture:screening-only");
    assert.equal(output.candidates.corpusId, output.coverage.corpusId);
    assert.deepEqual(output.candidates.candidates, []);
    for (const mod of output.coverage.mods) {
      assert.equal(mod.screeningStatus, "screened");
      assert.equal(mod.candidateCount, 0);
      assert.equal(mod.pendingCount, 0);
      assert.equal(mod.reviewedCount, 0);
      assert.ok(mod.note.includes("未命中不表示社区无人研究"));
      if (!works.length) assert.ok(mod.note.includes("corpus 为空"));
    }
  }
});

test("candidate and pending counts are per MOD/PR pair; automatic screening never emits supported or confidence", () => {
  const output = screen([work("KV缓存采用 INT8 量化；Triton warmup。")], realProfiles);
  assert.ok(output.candidates.candidates.length >= 2);
  for (const candidate of output.candidates.candidates) {
    assert.equal(candidate.status, "needs_review");
    assert.equal(candidate.screeningOnly, true);
    assert.ok(!Object.hasOwn(candidate, "confidence"));
    assert.ok(!Object.hasOwn(candidate, "reviewStatus"));
  }
  for (const mod of output.coverage.mods) {
    assert.equal(mod.candidateCount, output.candidates.candidates.filter(candidate => candidate.modId === mod.modId).length);
    assert.equal(mod.pendingCount, mod.candidateCount);
    assert.equal(mod.reviewedCount, 0);
  }
  assert.ok(!JSON.stringify(output).includes('"supported"'));
});

test("canonical profile hash and pair IDs are repeatable; profile edits change the recorded hash", () => {
  const profiles = smallProfiles();
  const source = [work()];
  const beforeProfiles = JSON.stringify(profiles), beforeCorpus = JSON.stringify(source);
  const first = screen(source, profiles), second = screen(source, profiles);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(profiles), beforeProfiles);
  assert.equal(JSON.stringify(source), beforeCorpus);
  assert.equal(hashProfiles(profiles), hashProfiles({ profiles: profiles.profiles, weakTerms: profiles.weakTerms,
    rulesVersion: profiles.rulesVersion, schemaVersion: profiles.schemaVersion }));
  profiles.profiles[0].groups[0].terms.push("draft cache");
  const edited = screen(source, profiles);
  assert.notEqual(edited.coverage.profileHash, first.coverage.profileHash);
  assert.equal(edited.candidates.candidates[0].id, first.candidates.candidates[0].id);
});

test("invalid profiles cannot make a weak term, one group, or stage context count as independent evidence", () => {
  for (const mutate of [
    document => { document.profiles[0].groups[0].terms = ["ＣＡＣＨＥ"]; },
    document => { document.profiles[0].rules[0].all = ["object"]; },
    document => { document.profiles[0].rules[0].all = ["object", "context"]; },
    document => { document.profiles.push(structuredClone(document.profiles[0])); },
    document => { document.scope = { expectedModCount: 38 }; },
  ]) {
    const profiles = smallProfiles(); mutate(profiles);
    assert.throws(() => screen([work()], profiles));
  }
});

async function temporaryQa() {
  await mkdir(path.join(root, ".qa"), { recursive: true });
  return mkdtemp(path.join(root, ".qa", "mod-pr-screening-test-"));
}
async function writeInputs(directory, document = corpus([work()])) {
  const input = path.join(directory, "corpus");
  await mkdir(input);
  await writeFile(path.join(input, "works.json"), JSON.stringify(document));
  await writeFile(path.join(input, "manifest.json"), JSON.stringify({ schemaVersion: 1, corpusId: document.corpusId }));
  const profileFile = path.join(directory, "profiles.json");
  await writeFile(profileFile, JSON.stringify(smallProfiles()));
  return { input, profileFile };
}
function runCli(args) {
  return runFile(process.execPath, [path.join(root, "scripts/screen-mod-prs.mjs"), ...args], { cwd: root });
}

test("CLI consumes the shared manifest/works interface and writes only candidates.json and coverage.json under QA", async () => {
  const directory = await temporaryQa();
  try {
    const { input, profileFile } = await writeInputs(directory);
    const output = path.join(directory, "screening");
    const { stdout } = await runCli(["--corpus", input, "--out", output, "--profiles", profileFile]);
    const summary = JSON.parse(stdout);
    assert.equal(summary.modsScreened, 1);
    assert.equal(summary.candidates, 1);
    assert.equal(summary.reviewedCount, 0);
    const candidates = JSON.parse(await readFile(path.join(output, "candidates.json"), "utf8"));
    const coverage = JSON.parse(await readFile(path.join(output, "coverage.json"), "utf8"));
    assert.equal(candidates.corpusId, coverage.corpusId);
    assert.equal(candidates.profileHash, coverage.profileHash);
    assert.equal(coverage.mods[0].pendingCount, 1);
    assert.equal(coverage.mods[0].reviewedCount, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("CLI rejects mismatched/missing corpus inputs without writing success artifacts", async () => {
  const directory = await temporaryQa();
  try {
    const { input, profileFile } = await writeInputs(directory);
    const output = path.join(directory, "screening");
    await writeFile(path.join(input, "manifest.json"), JSON.stringify({ schemaVersion: 1, corpusId: "different" }));
    await assert.rejects(() => runCli(["--corpus", input, "--out", output, "--profiles", profileFile]), /same.*corpusId/);
    await assert.rejects(() => access(output));
    await rm(path.join(input, "manifest.json"));
    await assert.rejects(() => runCli(["--corpus", input, "--out", output, "--profiles", profileFile]), /Cannot read JSON/);
    await assert.rejects(() => access(output));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("CLI keeps private candidate reasons out of public directories, including symlink redirects", async () => {
  const directory = await temporaryQa();
  try {
    const { input, profileFile } = await writeInputs(directory);
    const forbidden = path.join(root, "public", path.basename(directory));
    await assert.rejects(() => runCli(["--corpus", input, "--out", forbidden, "--profiles", profileFile]), /must stay under.*\.qa/);
    await assert.rejects(() => access(forbidden));
    const link = path.join(directory, "linked-public");
    await symlink(path.join(root, "public"), link, "dir");
    await assert.rejects(() => runCli(["--corpus", input, "--out", path.join(link, "screening"), "--profiles", profileFile]), /symlink/);
    await assert.rejects(() => access(path.join(root, "public", "screening", "candidates.json")));
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("model-family context alone cannot create a SliceGPT pruning lead; plural KV objects are searchable", () => {
  const genericLoader = screen([work("Llama Qwen2.5 loader compatibility check")], profilesFor("slicegpt-migration"));
  assert.equal(genericLoader.candidates.candidates.length, 0);
  const plural = screen([work("Quantized KV caches use INT8 storage.")], profilesFor("quantized-kv-cache-migration"));
  assert.equal(plural.candidates.candidates.length, 1);
});

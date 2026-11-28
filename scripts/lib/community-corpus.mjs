import { createHash } from "node:crypto";
import { readFile, realpath, readdir, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

export const SCHEMA_VERSION = 1;
export const DEFAULT_SOURCES = "data/group-research/corpus-sources.json";
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort(compare);
const unique = values => [...new Set(values)];
const pointerEscape = value => String(value).replace(/~/g, "~0").replace(/\//g, "~1");
const pointerChild = (base, key) => base + "/" + pointerEscape(key);
const json = value => JSON.stringify(value, null, 2) + "\n";
export const sha256 = value => createHash("sha256").update(value).digest("hex");
export function canonicalStringify(value) {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalStringify).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).filter(key => value[key] !== undefined).sort(compare)
    .map(key => JSON.stringify(key) + ":" + canonicalStringify(value[key])).join(",") + "}";
  return JSON.stringify(value);
}

/** Only a full stable identity or an actual GitHub /pull URL identifies a PR.
 * Repository aliases, issue/blob/tree/commit links and bare #numbers are never inferred.
 */
export function normalizePrIdentity(value) {
  if (typeof value !== "string") return null;
  const input = value.trim();
  let match = input.match(/^github:([a-z0-9_.-]+)\/([a-z0-9_.-]+)#([1-9][0-9]*)$/i);
  if (!match) {
    let url;
    try { url = new URL(input); } catch { return null; }
    if (!["https:", "http:"].includes(url.protocol) || url.hostname.toLowerCase() !== "github.com"
      || url.username || url.password || url.port) return null;
    match = url.pathname.match(/^\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)\/pull\/([1-9][0-9]*)(?:(?:\/(?:files|commits|checks)(?:\/[a-z0-9_.-]+)?)|(?:\.(?:patch|diff)))?\/?$/i);
  }
  if (!match || [match[1], match[2]].some(part => part === "." || part === "..")) return null;
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number)) return null;
  const repository = (match[1] + "/" + match[2]).toLowerCase();
  return { workId: "github:" + repository + "#" + number, repository, number,
    url: "https://github.com/" + repository + "/pull/" + number };
}

function recordIdentity(record, locator) {
  const candidates = [record.workId, record.id, record.url].map(normalizePrIdentity).filter(Boolean);
  const identities = unique(candidates.map(item => item.workId));
  check(identities.length <= 1, "Conflicting PR identities at " + locator + ": " + identities.join(", "));
  const identity = candidates[0];
  if (identity && typeof record.number === "number")
    check(record.number === identity.number, "PR number mismatch at " + locator);
  if (identity && record.repo)
    check(record.repo.toLowerCase() === identity.repository, "PR repository mismatch at " + locator);
  return identity || null;
}

function flattenText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenText).filter(Boolean).join("\n");
  if (value && typeof value === "object") return Object.values(value).map(flattenText).filter(Boolean).join("\n");
  return "";
}

function explicitLinks(value, base = "") {
  const result = [];
  if (Array.isArray(value)) value.forEach((item, i) => result.push(...explicitLinks(item, pointerChild(base, i))));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const jsonPointer = pointerChild(base, key);
      if (key === "url" && typeof item === "string")
        result.push({ url: item, text: value.text || value.label || value.title || "", jsonPointer });
      else if (item && typeof item === "object") result.push(...explicitLinks(item, jsonPointer));
    }
  }
  return result;
}

function dailyText(block) {
  if (Array.isArray(block.paragraphs)) return block.paragraphs
    .map(parts => parts.map(part => part.text || "").join("")).join("\n\n");
  if (Array.isArray(block.parts)) return block.parts.map(part => part.text || "").join("");
  return flattenText(block);
}

export function classifyDailyReference(identity, block) {
  // Match a phrase attached to this exact number; another PR's "前置" is insufficient.
  const text = dailyText(block), n = String(identity.number);
  const attached = new RegExp("(?:前置|prerequisite|依赖|依存|depends?\\s+on|dependency|对照|比较|compare|关联|相关)[^#。；;\\n]{0,24}#\\s*" + n + "(?![0-9])", "i").exec(text);
  if (!attached) return "unclassified";
  if (/^(?:前置|prerequisite)/i.test(attached[0])) return "prerequisite";
  if (/^(?:依赖|依存|depends?|dependency)/i.test(attached[0])) return "dependency";
  if (/^(?:对照|比较|compare)/i.test(attached[0])) return "comparison";
  return "related";
}

function makeObservation(identity, options) {
  const { sourceFile, jsonPointer, role, referenceKind, ...rest } = options;
  const id = "obs:" + sha256(canonicalStringify({ workId: identity.workId, sourceFile, jsonPointer, role,
    referenceKind: referenceKind || null })).slice(0, 32);
  return { identity, observation: { id, role, sourceFile, jsonPointer, ...rest,
    ...(referenceKind ? { referenceKind } : {}) } };
}

/** Current-version admission happens before this pure projection. */
export function indexDailyReport(report, { sourceFile, day, version }) {
  check(report.day === day && report.sha256 === version, "Daily identity/version mismatch: " + sourceFile);
  check(Array.isArray(report.sections), "Missing daily sections: " + sourceFile);
  const records = [], notes = [];
  const counts = { entryOccurrences: 0, mainOccurrences: 0, explicitPrLinkOccurrences: 0,
    paperEntryOccurrences: 0, ambiguousEntries: 0 };
  const explicitPrIds = [];
  const href = entryNumber => "/reports/" + day + "?" + new URLSearchParams({
    version, ...(entryNumber ? { section: entryNumber } : {})
  }).toString();
  report.sections.forEach((section, si) => {
    let groupTitle;
    check(Array.isArray(section.blocks), "Missing daily blocks: " + sourceFile + "/sections/" + si);
    section.blocks.forEach((block, bi) => {
      if (block.kind === "group") groupTitle = block.title;
      const pointer = "/sections/" + si + "/blocks/" + bi;
      const links = explicitLinks(block, pointer);
      const prLinks = links.map(link => ({ ...link, identity: normalizePrIdentity(link.url) })).filter(link => link.identity);
      counts.explicitPrLinkOccurrences += prLinks.length;
      explicitPrIds.push(...prLinks.map(link => link.identity.workId));
      const paper = section.key === "papers" || /^paper:/i.test(block.workId || "") || /^P[0-9]/.test(block.number || "");
      if (block.kind === "entry" && paper) counts.paperEntryOccurrences++;
      let mains = [];
      if (block.kind === "entry" && !paper) {
        mains = unique([block.workId, ...(block.workIds || [])].map(normalizePrIdentity).filter(Boolean).map(item => item.workId))
          .map(normalizePrIdentity);
        const linked = unique(prLinks.map(link => link.identity.workId));
        if (!mains.length && linked.length === 1) {
          mains = [normalizePrIdentity(linked[0])];
          notes.push({ kind: "main_inferred_from_single_link", sourceFile, jsonPointer: pointer, workId: linked[0] });
        } else if (!mains.length && linked.length > 1) {
          counts.ambiguousEntries++;
          notes.push({ kind: "ambiguous_main_identity", sourceFile, jsonPointer: pointer, workIds: linked });
        }
      }
      const common = { sourceFile, day, version, entryNumber: block.number,
        sectionKey: section.key, sectionTitle: section.title, ...(groupTitle ? { groupTitle } : {}),
        href: href(block.number), title: block.title || section.title, text: dailyText(block), raw: block, links };
      if (mains.length) counts.entryOccurrences++;
      for (const identity of mains) {
        counts.mainOccurrences++;
        const primaryLink = prLinks.find(link => link.identity.workId === identity.workId);
        records.push(makeObservation(identity, { ...common, role: "daily_main", jsonPointer: pointer,
          mainWorkId: identity.workId, sourceUrl: primaryLink?.url || identity.url,
          ...(primaryLink ? { linkPointer: primaryLink.jsonPointer } : {}) }));
      }
      for (const link of prLinks) {
        if (mains.some(identity => identity.workId === link.identity.workId)) continue;
        records.push(makeObservation(link.identity, { ...common, role: "daily_reference",
          jsonPointer: link.jsonPointer, title: link.text || block.title || section.title,
          sourceUrl: link.url, ...(mains[0] ? { mainWorkId: mains[0].workId } : {}),
          referenceKind: classifyDailyReference(link.identity, block) }));
      }
    });
  });
  return { records, counts, explicitPrIds, notes };
}

function relativePath(value) {
  check(typeof value === "string" && value.length > 0 && !value.includes("\\")
    && !value.includes("\0") && !path.posix.isAbsolute(value)
    && !/^[a-z]:/i.test(value) && !value.split("/").some(part => !part || part === "." || part === ".."),
  "Expected a repository-relative path: " + value);
  return value;
}

async function inputLoader(root) {
  const actualRoot = await realpath(root), files = new Map(), data = new Map();
  async function read(relative, role) {
    relativePath(relative);
    const absolute = await realpath(path.join(actualRoot, relative));
    const inside = path.relative(actualRoot, absolute);
    check(inside !== ".." && !inside.startsWith(".." + path.sep) && !path.isAbsolute(inside),
      "Input escapes repository: " + relative);
    if (!data.has(relative)) {
      const bytes = await readFile(absolute);
      files.set(relative, { path: relative, sha256: sha256(bytes), role });
      data.set(relative, bytes);
    } else if (files.get(relative).role !== role) {
      const entry = files.get(relative);
      entry.roles = sorted(unique([entry.role, ...(entry.roles || []), role]));
    }
    return data.get(relative);
  }
  return { root: actualRoot, read, files, async json(relative, role) {
    try { return JSON.parse((await read(relative, role)).toString("utf8")); }
    catch (error) { throw new Error("Cannot read JSON " + relative + ": " + error.message); }
  }, async verifyUnchanged() {
    for (const input of files.values())
      check(sha256(await readFile(path.join(actualRoot, input.path))) === input.sha256,
        "Input changed during corpus build: " + input.path + "; rerun after the edit completes.");
  } };
}

/** Parse the actual TypeScript import graph; type-only imports do not admit data. */
async function runtimeGraph(loader, policy) {
  if (!policy) return { modules: [], staticJson: [], globs: [], edges: [] };
  const modules = new Set(), staticJson = new Set(), globs = [], edges = [];
  async function resolveImport(from, specifier) {
    if (!specifier.startsWith(".")) return null;
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    if (/\.(css|svg|png|jpg|webp)$/.test(relative)) return null;
    const choices = path.posix.extname(relative) ? [relative] :
      [relative + ".ts", relative + ".tsx", relative + ".js", relative + ".mjs", relative + "/index.ts", relative + "/index.tsx"];
    for (const candidate of choices) {
      relativePath(candidate);
      try { await realpath(path.join(loader.root, candidate)); return candidate; } catch { /* try next extension */ }
    }
    throw new Error("Unresolved runtime import: " + from + " -> " + specifier);
  }
  async function visit(file) {
    if (modules.has(file)) return;
    modules.add(file);
    if (file.endsWith(".json")) { staticJson.add(file); return; }
    const source = (await loader.read(file, "runtime_import_graph")).toString("utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    check(tree.parseDiagnostics.length === 0, "Cannot parse runtime module: " + file);
    const imports = [];
    for (const statement of tree.statements) {
      if (ts.isImportDeclaration(statement)) {
        const clause = statement.importClause;
        if (clause?.isTypeOnly) continue;
        if (clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.length && clause.namedBindings.elements.every(item => item.isTypeOnly)) continue;
        imports.push(statement.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier) {
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)
          && statement.exportClause.elements.every(item => item.isTypeOnly)) continue;
        imports.push(statement.moduleSpecifier.text);
      }
    }
    function walk(node) {
      if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0])) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) imports.push(node.arguments[0].text);
        else if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "glob"
          && node.expression.expression.getText(tree) === "import.meta")
          globs.push({ module: file, pattern: node.arguments[0].text });
      }
      ts.forEachChild(node, walk);
    }
    walk(tree);
    for (const specifier of unique(imports)) {
      const target = await resolveImport(file, specifier);
      if (target) { edges.push({ from: file, to: target }); await visit(target); }
    }
  }
  await visit(policy.entryPoint);
  check(canonicalStringify(sorted(staticJson)) === canonicalStringify(sorted(policy.staticJson)),
    "Runtime JSON whitelist drift; review corpus-sources.json against TopicPages imports.");
  const observedGlobs = globs.sort((a, b) => compare(a.module + a.pattern, b.module + b.pattern));
  const expectedGlobs = policy.globs.map(({ module, pattern }) => ({ module, pattern }))
    .sort((a, b) => compare(a.module + a.pattern, b.module + b.pattern));
  check(canonicalStringify(observedGlobs) === canonicalStringify(expectedGlobs),
    "Runtime glob whitelist drift; review corpus-sources.json.");
  const indexLoader = (await loader.read(policy.indexLoader, "runtime_index_loader")).toString("utf8");
  check(indexLoader.includes('"' + policy.indexRequest + '"') || indexLoader.includes("'" + policy.indexRequest + "'"),
    "Configured topic index is no longer requested by the runtime loader.");
  for (const glob of policy.globs) {
    relativePath(glob.directory);
    const resolvedPattern = path.posix.normalize(path.posix.join(path.posix.dirname(glob.module), glob.pattern));
    check(resolvedPattern === glob.directory + "/*" + glob.suffix,
      "Glob boundary is not the runtime's direct JSON directory.");
  }
  return { entryPoint: policy.entryPoint, indexLoader: policy.indexLoader,
    modules: sorted(modules), staticJson: sorted(staticJson), globs: observedGlobs,
    edges: edges.sort((a, b) => compare(a.from + a.to, b.from + b.to)) };
}

function nestedValues(value, key) {
  const values = [];
  if (Array.isArray(value)) value.forEach(item => values.push(...nestedValues(item, key)));
  else if (value && typeof value === "object") {
    for (const [name, item] of Object.entries(value)) {
      if (name === key) values.push(...(Array.isArray(item) ? item : [item]));
      else if (item && typeof item === "object") values.push(...nestedValues(item, key));
    }
  }
  return values;
}

function topicProjector(documents, notes) {
  const records = [], sourceStats = [];
  const get = adapter => documents.find(item => item.source.adapter === adapter)?.data;
  const includedKv = new Map();
  for (const record of [...(get("kv_research")?.entries || []), ...(get("kv_community")?.newEntries || [])]) {
    if (record.kind !== "pr" || record.decision !== "included") continue;
    const identity = recordIdentity(record, "KV library");
    if (identity) includedKv.set(identity.workId, record);
  }
  const weeklySources = new Map((get("kv_weekly")?.sources || []).map(item => [item.id, item]));
  function emit(doc, identity, pointer, raw, href, options = {}) {
    if (!identity) return;
    const primary = options.primary || raw;
    const title = primary.title || primary.originalTitle || primary.label || identity.workId;
    const prVersion = Object.fromEntries(["headSha", "baseSha", "state", "merged", "draft", "mergeCommitSha",
      "createdAt", "updatedAt", "mergedAt"].filter(key => primary[key] !== undefined).map(key => [key, primary[key]]));
    records.push(makeObservation(identity, { role: "topic", sourceFile: doc.source.path, jsonPointer: pointer,
      title, text: flattenText(raw), raw, href, sourceUrl: primary.url || identity.url,
      topicId: options.topicId || doc.data.topicId || "kv-cache",
      ...(options.topicReportVersion ? { topicReportVersion: options.topicReportVersion } : {}),
      ...(options.topicReportAsOf ? { topicReportAsOf: options.topicReportAsOf } : {}),
      sourceId: doc.source.id, referenceKind: options.referenceKind || "material",
      ...(primary.day || primary.sourceDay ? { day: primary.day || primary.sourceDay } : {}),
      ...(primary.version || primary.sourceVersion || doc.data.edition || doc.data.id || doc.data.asOf
        ? { version: String(primary.version || primary.sourceVersion || doc.data.edition || doc.data.id || doc.data.asOf) } : {}),
      ...(primary.checkedAt || primary.sourceCheckedAt || doc.data.checkedAt || doc.data.asOf
        ? { observedAt: primary.checkedAt || primary.sourceCheckedAt || doc.data.checkedAt || doc.data.asOf } : {}),
      ...(Object.keys(prVersion).length ? { prVersion } : {}),
      ...(options.primaryPointer ? { primaryPointer: options.primaryPointer } : {}) }));
  }
  function emitRecord(doc, raw, pointer, href, options) {
    const identity = recordIdentity(raw, doc.source.path + pointer);
    if (identity) emit(doc, identity, pointer, raw, href, options);
  }
  function kvHref(id, view = "evidence") {
    return "/topics/kv-cache?" + new URLSearchParams({ view, q: id }).toString();
  }
  function contextForIds(doc, raw, pointer, ids, href, lookup = includedKv, options = {}) {
    for (const id of unique(ids)) {
      const identity = normalizePrIdentity(id), primary = identity && lookup.get(identity.workId);
      if (!primary) {
        notes.push({ kind: "unresolved_or_not_admitted_context_reference", sourceFile: doc.source.path,
          jsonPointer: pointer, value: id });
        continue;
      }
      emit(doc, identity, pointer, raw, href, { ...options, primary, referenceKind: options.referenceKind || "cited_context" });
    }
  }
  for (const doc of documents) {
    const start = records.length, data = doc.data, adapter = doc.source.adapter;
    const ignored = {};
    if (adapter === "kv_research") {
      data.entries.forEach((row, i) => {
        if (row.kind === "pr" && row.decision === "included")
          emitRecord(doc, row, "/entries/" + i, kvHref(row.id));
        else ignored[row.kind === "pr" ? "decision_" + row.decision : "paper"] =
          (ignored[row.kind === "pr" ? "decision_" + row.decision : "paper"] || 0) + 1;
      });
    } else if (adapter === "kv_community") {
      data.newEntries.forEach((row, i) => {
        if (row.kind === "pr" && row.decision === "included") emitRecord(doc, row, "/newEntries/" + i, kvHref(row.id));
      });
      for (const key of ["snapshots", "stories"]) (data[key] || []).forEach((row, i) => {
        const identity = recordIdentity(row, doc.source.path + "/" + key + "/" + i);
        if (identity && includedKv.has(identity.workId)) {
          emit(doc, identity, "/" + key + "/" + i, row, kvHref(identity.workId, key === "stories" ? "report" : "evidence"));
          if (key === "snapshots" && row.baseline)
            emit(doc, identity, "/" + key + "/" + i + "/baseline", row.baseline, kvHref(identity.workId),
              { primary: { ...row, ...row.baseline }, referenceKind: "baseline_state" });
        }
      });
      (data.evidenceReview?.checks || []).forEach((row, i) => {
        const identity = recordIdentity(row, doc.source.path + "/evidenceReview/checks/" + i);
        if (identity && includedKv.has(identity.workId))
          emit(doc, identity, "/evidenceReview/checks/" + i, row, kvHref(identity.workId), { referenceKind: "source_recheck" });
      });
      (data.observations || []).forEach((row, i) => contextForIds(doc, row, "/observations/" + i,
        row.storySlugs.flatMap(slug => data.stories.filter(story => story.slug === slug).map(story => story.id)),
        "/topics/kv-cache?view=report&edition=" + data.edition));
      (data.followUps || []).forEach((row, i) => contextForIds(doc, row, "/followUps/" + i, row.ids,
        "/topics/kv-cache?view=report&edition=" + data.edition));
      ignored.raw_search_candidates = data.search?.candidates?.length || 0;
    } else if (adapter === "kv_study") {
      const methods = new Map(data.methods.map(row => [row.workId, row]));
      data.methods.forEach((row, i) => emitRecord(doc, row, "/methods/" + i,
        "/topics/kv-cache?view=compare&part=kv-pr-" + row.number));
      (data.sources || []).forEach((row, i) => {
        if (normalizePrIdentity(row.url)) emitRecord(doc, row, "/sources/" + i, "/topics/kv-cache?view=compare");
        else ignored.non_pr_sources = (ignored.non_pr_sources || 0) + 1;
      });
      for (const key of ["observations", "questions"]) (data[key] || []).forEach((row, i) =>
        contextForIds(doc, row, "/" + key + "/" + i,
          data.methods.filter(method => (row.numbers || []).includes(method.number)).map(method => method.workId),
          "/topics/kv-cache?view=compare", methods));
    } else if (adapter === "kv_overview") {
      for (const [pointer, row] of [...(data.judgments || []).map((row, i) => ["/judgments/" + i, row]),
        ...(data.directions || []).map((row, i) => ["/directions/" + i, row]), ["/validation", data.validation]]) {
        if (!row) continue;
        contextForIds(doc, row, pointer, row.evidence?.prs || [], "/topics/kv-cache");
        for (const sourceId of row.evidence?.sources || []) {
          const primary = weeklySources.get(sourceId);
          if (primary?.kind !== "pr") continue;
          const identity = recordIdentity(primary, "KV weekly source " + sourceId);
          emit(doc, identity, pointer + "/evidence/sources/" + (row.evidence.sources.indexOf(sourceId)), row,
            "/topics/kv-cache", { primary, referenceKind: "cited_context" });
        }
      }
    } else if (adapter === "kv_synthesis") {
      data.groups.forEach((row, i) => {
        const lookup = new Map([...includedKv].filter(([, record]) => record.topics?.includes(row.id)));
        contextForIds(doc, row, "/groups/" + i, row.engineeringIds,
          "/topics/kv-cache?view=survey&topic=" + row.id, lookup);
      });
    } else if (adapter === "kv_weekly") {
      const lookup = new Map();
      data.sources.forEach((row, i) => {
        if (row.kind !== "pr") { ignored[row.kind] = (ignored[row.kind] || 0) + 1; return; }
        const identity = recordIdentity(row, doc.source.path + "/sources/" + i);
        if (identity) {
          lookup.set(identity.workId, row);
          emit(doc, identity, "/sources/" + i, row, "/topics/kv-cache?" +
            (row.readingSearch || new URLSearchParams({ view: "evidence", q: identity.workId }).toString()));
        }
      });
      (data.revisions || []).forEach((row, i) => contextForIds(doc, row, "/revisions/" + i,
        [row.workId], "/topics/kv-cache?view=report", lookup, { referenceKind: "source_revision" }));
      data.reports.forEach((report, ri) => {
        for (const key of ["questions", "progress"]) (report[key] || []).forEach((row, i) =>
          contextForIds(doc, row, "/reports/" + ri + "/" + key + "/" + i,
            nestedValues(row, "sourceIds").map(id => weeklySources.get(id)).filter(source => source?.kind === "pr")
              .map(source => source.workId), "/topics/kv-cache?view=report&week=" + report.week, lookup));
      });
    } else if (adapter === "aclgraph_analysis" || adapter === "problem_analysis") {
      const wrapped = adapter === "problem_analysis";
      const topicId = wrapped ? doc.source.topicId : "aclgraph";
      check(typeof topicId === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topicId),
        "Expected a valid analysis topic ID: " + doc.source.path);
      const problems = wrapped ? data.problems : data;
      check(Array.isArray(problems), "Expected ACL Graph analysis problem array: " + doc.source.path);
      problems.forEach((problem, pi) => {
        if (problem.papers?.length) ignored.paper = (ignored.paper || 0) + problem.papers.length;
        const problemContext = { id: problem.id, index: problem.index, slug: problem.slug,
          title: problem.title, shortTitle: problem.shortTitle, priorityBadge: problem.priorityBadge, gap: problem.gap };
        (problem.prs || []).forEach((card, ci) => {
          const pointer = (wrapped ? "/problems" : "") + "/" + pi + "/prs/" + ci;
          const locator = doc.source.path + pointer;
          const repoNumberId = typeof card.repository === "string" && Number.isSafeInteger(card.number)
            ? "github:" + card.repository + "#" + card.number : null;
          const candidates = [card.prId, repoNumberId, card.url].filter(value => value !== undefined);
          const identities = candidates.map(normalizePrIdentity);
          check(identities.length > 0 && identities.every(Boolean), "Missing or invalid ACL Graph PR identity at " + locator);
          const identity = identities[0];
          check(identities.every(item => item.workId === identity.workId), "Conflicting ACL Graph PR identities at " + locator);
          check(repoNumberId && normalizePrIdentity(repoNumberId)?.workId === identity.workId,
            "ACL Graph PR repository/number mismatch at " + locator);
          const href = "/topics/" + topicId + "?" + new URLSearchParams({ view: "analysis",
            problem: String(problem.id), card: String(card.id) }).toString();
          emit(doc, identity, pointer, { ...card, problemContext }, href, { primary: card, topicId });
        });
      });
    } else if (adapter === "specdec_weekly") {
      const lookup = new Map(data.sources.map(row => [row.workId, row]));
      data.sources.forEach((row, i) => emitRecord(doc, row, "/sources/" + i,
        "/topics/speculative-decoding?view=report&edition=" + data.id, { topicId: "speculative-decoding" }));
      for (const key of ["stories", "otherGroups", "tracking", "synthesis"]) (data[key] || []).forEach((row, i) =>
        contextForIds(doc, row, "/" + key + "/" + i, row.sourceIds || [],
          "/topics/speculative-decoding?view=report&edition=" + data.id +
          (row.slug ? "&part=week-" + row.slug : ""), lookup, { topicId: "speculative-decoding" }));
    } else if (adapter === "topic_index") {
      data.topics.forEach((topic, ti) => {
        if ((doc.source.excludeTopicIds || []).includes(topic.id)) {
          ignored["superseded_" + topic.id] = (topic.entries || []).length;
          return;
        }
        const base = "/topics/" + ti, report = topic.report, topicId = topic.id;
        const route = "/topics/" + topicId;
        (topic.entries || []).forEach((row, i) => emitRecord(doc, row, base + "/entries/" + i,
          route + "?view=evidence&q=" + encodeURIComponent(row.workId), { topicId }));
        if (!report) return;
        const reportRoute = route + "?view=report" + (topicId === "speculative-decoding" ? "&edition=2026-11-18" : "");
        const refs = new Map();
        (report.references || []).forEach((row, i) => {
          if (row.kind !== "pr") { ignored["reference_" + row.kind] = (ignored["reference_" + row.kind] || 0) + 1; return; }
          const identity = recordIdentity(row, doc.source.path + base + "/report/references/" + i);
          if (!identity) {
            notes.push({ kind: "non_pr_reference_url", sourceFile: doc.source.path,
              jsonPointer: base + "/report/references/" + i, url: row.url });
            return;
          }
          refs.set(row.id, { ...row, workId: identity.workId });
          emit(doc, identity, base + "/report/references/" + i, row,
            reportRoute + "&part=survey-ref-" + row.id, { topicId, topicReportVersion: report.version, topicReportAsOf: report.asOf });
        });
        (report.pendingEvidence || []).forEach((row, i) => emitRecord(doc, row,
          base + "/report/pendingEvidence/" + i, reportRoute, { topicId, topicReportVersion: report.version, topicReportAsOf: report.asOf, referenceKind: "pending_evidence" }));
        for (const key of ["evidenceDetails", "sections", "taxonomy", "gaps", "bottleneckMigration", "conclusions"])
          (report[key] || []).forEach((row, i) => {
            const identities = unique(nestedValues(row, "sourceIds").map(id => refs.get(id)?.workId).filter(Boolean));
            for (const workId of identities) {
              const primary = [...refs.values()].find(ref => ref.workId === workId);
              emit(doc, normalizePrIdentity(workId), base + "/report/" + key + "/" + i, row,
                reportRoute + "&part=" + (key === "evidenceDetails" ? "survey-evidence-" + row.id :
                  key === "sections" ? "survey-section-" + i : key === "gaps" ? "survey-gap-" + row.id :
                  key === "taxonomy" ? "survey-route-" + i : key === "bottleneckMigration" ? "survey-taxonomy" : "survey-top"),
                { primary, topicId, topicReportVersion: report.version, topicReportAsOf: report.asOf, referenceKind: "cited_context" });
            }
          });
      });
    } else throw new Error("Unknown topic source adapter: " + adapter);
    const projected = records.slice(start);
    sourceStats.push({ sourceId: doc.source.id, path: doc.source.path, adapter,
      observations: projected.length, uniquePRs: new Set(projected.map(row => row.identity.workId)).size, excluded: ignored });
  }
  return { records, sourceStats };
}

export async function buildCommunityCorpus({ root = process.cwd(), sources = DEFAULT_SOURCES,
  generatedAt = new Date().toISOString() } = {}) {
  check(Number.isFinite(Date.parse(generatedAt)), "Invalid generatedAt timestamp");
  const loader = await inputLoader(root), policy = await loader.json(sources, "source_policy");
  check(policy.schemaVersion === 1 && policy.rulesVersion && policy.daily?.versionPolicy === "catalog_current_only",
    "Unsupported corpus source policy");
  for (const file of policy.implementationSources || []) await loader.read(file, "corpus_implementation");
  const graph = await runtimeGraph(loader, policy.runtime);
  const catalog = await loader.json(policy.daily.catalog, "daily_catalog");
  check(catalog.schemaVersion === 1 && catalog.days && !Array.isArray(catalog.days), "Unsupported daily catalog");
  const dailyBase = path.posix.dirname(policy.daily.catalog), dailyRecords = [], explicitIds = [], notes = [], currentReports = [];
  const dailyCounts = { entryOccurrences: 0, mainOccurrences: 0, explicitPrLinkOccurrences: 0, paperEntryOccurrences: 0, ambiguousEntries: 0 };
  for (const day of Object.keys(catalog.days).sort(compare)) {
    check(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day), "Invalid catalog day: " + day);
    const entry = catalog.days[day];
    check(Array.isArray(entry.versions), "Missing catalog versions for " + day);
    const matches = entry.versions.filter(version => version.sha256 === entry.current);
    check(matches.length === 1, "Catalog current must resolve to exactly one version for " + day);
    const current = matches[0];
    relativePath(current.path);
    check(current.path === day + "/" + entry.current + "/report.json",
      "Unexpected catalog current report path for " + day);
    const sourceFile = dailyBase + "/" + current.path, report = await loader.json(sourceFile, "current_daily_report");
    check(!report.synthetic, "Synthetic daily report is outside corpus scope: " + sourceFile);
    const projected = indexDailyReport(report, { sourceFile, day, version: entry.current });
    dailyRecords.push(...projected.records); explicitIds.push(...projected.explicitPrIds); notes.push(...projected.notes);
    for (const key of Object.keys(dailyCounts)) dailyCounts[key] += projected.counts[key];
    currentReports.push({ day, version: entry.current, path: sourceFile, excludedVersions: entry.versions.length - 1 });
  }
  const flow = await loader.json(policy.daily.flowIndex, "flow_index_cross_check");
  check(flow.schemaVersion === 1 && Array.isArray(flow.entries), "Unsupported flow index");
  const versionByDay = new Map(currentReports.map(report => [report.day, report.version]));
  const flowCurrent = flow.entries.filter(row => versionByDay.get(row.day) === row.version);
  const flowStale = flow.entries.filter(row => versionByDay.get(row.day) !== row.version);
  const documents = [];
  check(Array.isArray(policy.topicSources), "Missing explicit topic source whitelist");
  const declaredPaths = new Set();
  for (const source of policy.topicSources) {
    check(!declaredPaths.has(source.path), "Duplicate topic source path: " + source.path);
    if (policy.runtime) check([...policy.runtime.staticJson,
      path.posix.join(dailyBase, policy.runtime.indexRequest)].includes(source.path),
      "Topic source is not consumed by a declared runtime import or index request: " + source.path);
    declaredPaths.add(source.path);
    documents.push({ source, data: await loader.json(source.path, "topic_material") });
  }
  if (policy.runtime) {
    for (const file of policy.runtime.staticJson)
      check(declaredPaths.has(file), "Runtime JSON lacks a source adapter: " + file);
    for (const glob of policy.runtime.globs) {
      const entries = await readdir(path.join(loader.root, relativePath(glob.directory)), { withFileTypes: true });
      for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
        if (!entry.name.endsWith(glob.suffix)) continue;
        check(entry.isFile(), "Glob source must be a regular JSON file: " + entry.name);
        const file = glob.directory + "/" + entry.name;
        documents.push({ source: { id: glob.adapter + ":" + entry.name, path: file, adapter: glob.adapter,
          include: ["/sources", "cited stories/otherGroups/tracking/synthesis"], boundary: glob.selection },
        data: await loader.json(file, "runtime_glob_topic_material") });
      }
    }
  }
  const topical = topicProjector(documents, notes), allRecords = [...dailyRecords, ...topical.records];
  const worksById = new Map(), observationIds = new Set();
  for (const { identity, observation } of allRecords) {
    check(!observationIds.has(observation.id), "Duplicate observation ID: " + observation.id);
    observationIds.add(observation.id);
    if (!worksById.has(identity.workId)) worksById.set(identity.workId, { ...identity, title: observation.title, observations: [] });
    const work = worksById.get(identity.workId);
    // Prefer an actual main-entry title over a bare auxiliary citation label.
    if (!work.observations.some(item => item.role === "daily_main") && observation.role === "daily_main") work.title = observation.title;
    work.observations.push(observation);
  }
  const works = [...worksById.values()].sort((a, b) => compare(a.workId, b.workId));
  for (const work of works) work.observations.sort((a, b) =>
    compare(a.sourceFile + a.jsonPointer + a.role + a.id, b.sourceFile + b.jsonPointer + b.role + b.id));
  const idsFor = records => new Set(records.map(row => row.identity.workId));
  const main = dailyRecords.filter(row => row.observation.role === "daily_main"),
    references = dailyRecords.filter(row => row.observation.role === "daily_reference"),
    mainIds = idsFor(main), referenceIds = idsFor(references), dailyIds = idsFor(dailyRecords),
    topicIds = idsFor(topical.records), flowIds = new Set(flowCurrent.map(row => normalizePrIdentity(row.workId)?.workId).filter(Boolean));
  check(flowCurrent.every(row => normalizePrIdentity(row.workId)), "Invalid PR identity in current flow index");
  const difference = (left, right) => sorted([...left].filter(id => !right.has(id)));
  const flowKey = row => [row.day, row.version, row.number, normalizePrIdentity(row.workId)?.workId].join("|");
  const mainKeys = new Set(main.map(row => [row.observation.day, row.observation.version,
    row.observation.entryNumber, row.identity.workId].join("|")));
  const flowKeys = new Set(flowCurrent.map(flowKey));
  const flowCheck = { status: "matched",
    missingMainOccurrencesFromFlow: difference(mainKeys, flowKeys),
    flowOccurrencesWithoutDailyMain: difference(flowKeys, mainKeys),
    missingMainPRsFromFlow: difference(mainIds, flowIds), flowPRsWithoutDailyMain: difference(flowIds, mainIds),
    duplicateFlowOccurrences: flowCurrent.length - flowKeys.size,
    staleFlowOccurrences: flowStale.map(row => ({ day: row.day, version: row.version, workId: row.workId, entryNumber: row.number })) };
  if (Object.entries(flowCheck).some(([key, value]) => key !== "status" && (Array.isArray(value) ? value.length : value)))
    flowCheck.status = "differences";
  const counts = {
    dailyReports: currentReports.length, dailyEntryOccurrences: dailyCounts.entryOccurrences,
    dailyMainOccurrences: dailyCounts.mainOccurrences, dailyMainUniquePRs: mainIds.size,
    dailyExplicitPrLinkOccurrences: dailyCounts.explicitPrLinkOccurrences, dailyExplicitPrLinkUniquePRs: new Set(explicitIds).size,
    dailyReferenceOccurrences: references.length, dailyReferenceUniquePRs: referenceIds.size,
    dailyReferenceOnlyUniquePRs: difference(referenceIds, mainIds).length, dailyAllUniquePRs: dailyIds.size,
    dailyPaperEntryOccurrences: dailyCounts.paperEntryOccurrences, ambiguousDailyEntries: dailyCounts.ambiguousEntries,
    topicObservations: topical.records.length, topicUniquePRs: topicIds.size,
    topicNewPRs: difference(topicIds, dailyIds).length, totalUniquePRs: works.length,
    totalObservations: allRecords.length, flowOccurrences: flow.entries.length,
    flowCurrentOccurrences: flowCurrent.length, flowUniquePRs: flowIds.size,
    flowDuplicateOccurrences: flowCheck.duplicateFlowOccurrences, flowStaleOccurrences: flowStale.length
  };
  const repositories = sorted(new Set(works.map(work => work.repository))).map(repository => {
    const members = works.filter(work => work.repository === repository).map(work => work.workId);
    const countIn = set => members.filter(id => set.has(id)).length;
    return { repository, dailyMainUniquePRs: countIn(mainIds), dailyReferenceUniquePRs: countIn(referenceIds),
      dailyAllUniquePRs: countIn(dailyIds), topicUniquePRs: countIn(topicIds),
      topicNewPRs: members.filter(id => topicIds.has(id) && !dailyIds.has(id)).length, totalUniquePRs: members.length };
  });
  const inputs = [...loader.files.values()].sort((a, b) => compare(a.path, b.path));
  const corpusId = sha256(canonicalStringify({ schemaVersion: 1, rulesVersion: policy.rulesVersion, inputs, works }));
  const worksDocument = { schemaVersion: SCHEMA_VERSION, corpusId, works };
  const diagnostics = { schemaVersion: SCHEMA_VERSION, corpusId, flowCheck,
    dailyReferenceOnlyWorkIds: difference(referenceIds, mainIds), topicNewWorkIds: difference(topicIds, dailyIds),
    runtimeImportGraph: graph, sources: topical.sourceStats, notes };
  const manifest = { schemaVersion: SCHEMA_VERSION, corpusId, generatedAt, rulesVersion: policy.rulesVersion,
    scope: policy.scope, inputs, periodStart: currentReports[0]?.day || null,
    periodEnd: currentReports.at(-1)?.day || null, currentReports, counts, repositories,
    countDefinitions: {
      dailyEntryOccurrences: "Current daily entry records with one or more explicit/inferred primary PR identities; one entry is counted once.",
      dailyMainOccurrences: "One observation per declared primary PR in a current daily entry. Repeated days retain separate observations.",
      dailyMainUniquePRs: "Distinct full owner/repository#number identities from daily_main observations.",
      dailyExplicitPrLinkOccurrences: "Every explicit GitHub /pull link in current daily blocks, including the primary link.",
      dailyReferenceOccurrences: "Explicit links to PRs other than the declared primary workId; no promotion to a primary entry.",
      dailyAllUniquePRs: "Union of daily_main and daily_reference identities.",
      topicUniquePRs: "Distinct PR identities from the source whitelist, including materials already present in daily reports.",
      topicNewPRs: "Topic PR identities absent from all current daily primary and reference observations.",
      totalUniquePRs: "Union of current daily primary PRs, current daily references, and admitted topic PRs.",
      flowOccurrences: "Raw flow-index entries, cross-check only; never an additional intake source.",
      periodStart: "First current daily report day; not a PR creation date or a topic source timestamp."
    },
    sourceWhitelist: documents.map(doc => ({ id: doc.source.id, path: doc.source.path, adapter: doc.source.adapter,
      include: doc.source.include, boundary: doc.source.boundary,
      ...(doc.data.edition || doc.source.adapter === "specdec_weekly" ? { edition: doc.data.edition || doc.data.id } : {}),
      ...Object.fromEntries(["revision", "asOf", "checkedAt", "periodStart", "periodEnd", "materialThrough", "editedAt"]
        .filter(key => doc.data[key] !== undefined).map(key => [key, doc.data[key]])) })),
    exclusions: policy.exclusions || [], flowCheck,
    rebuild: { command: "node scripts/build-community-corpus.mjs --out .qa/mod-community/corpus-v1",
      identity: "SHA-256 of canonical {schemaVersion,rulesVersion,inputs,works}; generatedAt is excluded.",
      network: "No network access. Existing local data and installed TypeScript parser only.",
      outputScope: "QA only; full source records and diagnostics must remain outside public/." },
    worksSha256: sha256(json(worksDocument)), diagnosticsSha256: sha256(json(diagnostics)) };
  await loader.verifyUnchanged();
  return { manifest, works: worksDocument, diagnostics };
}

export async function writeCommunityCorpus(result, { root = process.cwd(), out }) {
  const actualRoot = await realpath(root), absolute = path.resolve(actualRoot, out), relative = path.relative(actualRoot, absolute);
  check(relative.startsWith(".qa" + path.sep), "Full corpus output must be under repository .qa/.");
  await mkdir(absolute, { recursive: true });
  const resolved = await realpath(absolute);
  check(path.relative(actualRoot, resolved).startsWith(".qa" + path.sep), "Corpus output symlink escapes .qa/.");
  // Publish the manifest last, so readers can detect an interrupted/mismatched bundle.
  for (const [name, value] of [["works.json", result.works], ["diagnostics.json", result.diagnostics], ["manifest.json", result.manifest]]) {
    const target = path.join(resolved, name), temporary = target + ".tmp-" + process.pid;
    await writeFile(temporary, json(value), { flag: "wx" });
    await rename(temporary, target);
  }
  return { corpusId: result.manifest.corpusId, counts: result.manifest.counts,
    out: path.relative(actualRoot, resolved).split(path.sep).join("/") };
}

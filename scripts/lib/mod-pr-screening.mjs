import { createHash } from "node:crypto";

export const RULES_VERSION = "mod-pr-screening/1";
const GROUP_KINDS = new Set(["object", "mechanism", "problem", "interface", "alias", "context"]);
const SOURCE_ROLES = new Set(["daily_main", "daily_reference", "topic"]);
const REQUIRED_WEAK_TERMS = ["cache", "caches", "attention", "boundary", "boundaries", "缓存", "注意力", "边界"];
const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
const latinOrNumber = /[\p{Script=Latin}\p{Number}]/u;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function hashProfiles(document) {
  return sha(stableJson(document));
}

// Keep offsets into the original string, including full-width and combining forms.
// Punctuation/underscore/dash variants separate words; Latin tokens require boundaries.
function searchText(value) {
  const source = String(value);
  let text = "";
  const starts = [], ends = [];
  for (const { segment, index } of segmenter.segment(source)) {
    for (const character of segment.normalize("NFKC").toLowerCase()) {
      const normalized = /[\p{L}\p{N}]/u.test(character) ? character : " ";
      if (normalized === " " && (!text || text.endsWith(" "))) {
        if (text.endsWith(" ")) ends[ends.length - 1] = index + segment.length;
        continue;
      }
      text += normalized;
      for (let i = 0; i < normalized.length; i++) {
        starts.push(index);
        ends.push(index + segment.length);
      }
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return { source, text, starts, ends };
}
export function normalizeText(value) {
  return searchText(value).text;
}
function validRelativeFile(value) {
  return nonempty(value) && !value.includes("\\") && !/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(value)
    && !value.split("/").includes("..");
}
function canonicalId(value) {
  const match = /^github:([a-z\d_.-]+)\/([a-z\d_.-]+)#([1-9]\d*)$/i.exec(String(value));
  invariant(match && Number.isSafeInteger(Number(match[3])), `Invalid PR workId: ${value}`);
  return `github:${match[1].toLowerCase()}/${match[2].toLowerCase()}#${Number(match[3])}`;
}
function identityFromUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid PR URL: ${value}`); }
  invariant(url.protocol === "https:" && ["github.com", "www.github.com"].includes(url.hostname)
    && !url.username && !url.password && !url.port, `Invalid GitHub PR URL: ${value}`);
  const match = /^\/([^/]+)\/([^/]+)\/pull\/([1-9]\d*)(?:\/(?:files|commits|checks))?\/?$/.exec(url.pathname);
  invariant(match, `Not a GitHub PR URL: ${value}`);
  return canonicalId(`github:${match[1]}/${match[2]}#${match[3]}`);
}
export function canonicalWorkIdentity(work) {
  const id = canonicalId(work.workId);
  invariant(identityFromUrl(work.url) === id, `PR URL/workId mismatch: ${work.workId}`);
  invariant(nonempty(work.repository), `Missing repository: ${work.workId}`);
  invariant(Number.isSafeInteger(work.number) && work.number > 0, `Invalid PR number: ${work.workId}`);
  invariant(canonicalId(`github:${work.repository}#${work.number}`) === id,
    `Repository/number/workId mismatch: ${work.workId}`);
  const match = /^github:(.+)#(\d+)$/.exec(id);
  return { workId: id, repository: match[1], number: Number(match[2]), url: `https://github.com/${match[1]}/pull/${match[2]}` };
}

export function validateProfiles(document) {
  invariant(document?.schemaVersion === 1, "Unsupported retrieval profile schemaVersion");
  invariant(document.rulesVersion === RULES_VERSION, "Retrieval profile rulesVersion does not match the implementation");
  invariant(Array.isArray(document.profiles) && document.profiles.length > 0, "No MOD profiles supplied");
  if (document.scope?.expectedModCount !== undefined) {
    invariant(document.profiles.length === document.scope.expectedModCount, "Incomplete MOD profile coverage");
  }
  invariant(Array.isArray(document.weakTerms) && document.weakTerms.every(nonempty), "Invalid weakTerms");
  const weak = new Set([...REQUIRED_WEAK_TERMS, ...document.weakTerms].map(normalizeText));
  const modIds = new Set(), componentIds = new Set();
  for (const profile of document.profiles) {
    invariant(nonempty(profile.modId) && nonempty(profile.componentId), "A MOD profile is missing its identity");
    invariant(!modIds.has(profile.modId) && !componentIds.has(profile.componentId), `Duplicate MOD profile: ${profile.modId}`);
    modIds.add(profile.modId);
    componentIds.add(profile.componentId);
    invariant(nonempty(profile.problem) && nonempty(profile.mechanism), `Missing public facts: ${profile.modId}`);
    invariant(Array.isArray(profile.stageIds), `Missing stage context: ${profile.modId}`);
    invariant(Array.isArray(profile.groups) && Array.isArray(profile.rules) && profile.rules.length > 0,
      `Missing retrieval groups/rules: ${profile.modId}`);
    const groups = new Map();
    for (const group of profile.groups) {
      invariant(nonempty(group.id) && !groups.has(group.id) && GROUP_KINDS.has(group.kind), `Invalid group: ${profile.modId}/${group.id}`);
      invariant(Array.isArray(group.terms) && group.terms.length > 0 && group.terms.every(nonempty), `Empty terms: ${profile.modId}/${group.id}`);
      const terms = group.terms.map(normalizeText);
      invariant(terms.every(nonempty), `Empty normalized term: ${profile.modId}/${group.id}`);
      if (group.kind !== "context") {
        invariant(terms.every(term => !weak.has(term)), `Weak standalone term in rule group: ${profile.modId}/${group.id}`);
      }
      groups.set(group.id, group);
    }
    const ruleIds = new Set();
    for (const rule of profile.rules) {
      invariant(nonempty(rule.id) && !ruleIds.has(rule.id), `Duplicate or missing rule ID: ${profile.modId}`);
      ruleIds.add(rule.id);
      invariant(Array.isArray(rule.all) && rule.all.length >= 2 && new Set(rule.all).size === rule.all.length,
        `A rule requires at least two distinct groups: ${profile.modId}/${rule.id}`);
      const required = rule.all.map(id => groups.get(id));
      invariant(required.every(group => group && group.kind !== "context"), `Context/unknown group cannot qualify a candidate: ${profile.modId}/${rule.id}`);
      invariant(new Set(required.map(group => group.kind)).size >= 2, `A rule requires distinct signal kinds: ${profile.modId}/${rule.id}`);
    }
  }
  return document;
}

export function validateCorpus(document) {
  invariant(document?.schemaVersion === 1 && nonempty(document.corpusId) && Array.isArray(document.works), "Invalid corpus envelope");
  const works = new Map();
  document.works.forEach((work, workIndex) => {
    const identity = canonicalWorkIdentity(work);
    invariant(nonempty(work.title) && Array.isArray(work.observations), `Missing title/observations: ${identity.workId}`);
    let merged = works.get(identity.workId);
    if (!merged) {
      merged = { ...identity, title: work.title, titles: [], observations: [], seenObservationIds: new Map() };
      works.set(identity.workId, merged);
    }
    if (work.title.localeCompare(merged.title, "en") < 0) merged.title = work.title;
    merged.titles.push({ value: work.title, corpusJsonPointer: `/works/${workIndex}/title` });
    work.observations.forEach((observation, observationIndex) => {
      invariant(nonempty(observation.id) && SOURCE_ROLES.has(observation.role), `Invalid observation identity/role: ${identity.workId}`);
      invariant(validRelativeFile(observation.sourceFile), `Observation sourceFile must be repository-relative: ${observation.id}`);
      invariant(typeof observation.jsonPointer === "string" && (!observation.jsonPointer || observation.jsonPointer.startsWith("/")),
        `Invalid source JSON pointer: ${observation.id}`);
      invariant(typeof observation.title === "string" && typeof observation.text === "string", `Invalid observation text: ${observation.id}`);
      invariant(nonempty(observation.href) && /^(?:\/[^/]|#\/)/.test(observation.href), `Invalid site-relative href: ${observation.id}`);
      const fingerprint = stableJson(observation);
      const previous = merged.seenObservationIds.get(observation.id);
      invariant(!previous || previous === fingerprint, `Conflicting observation ID: ${observation.id}`);
      if (!previous) {
        merged.seenObservationIds.set(observation.id, fingerprint);
        merged.observations.push({ ...observation, corpusJsonPointer: `/works/${workIndex}/observations/${observationIndex}` });
      }
    });
  });
  return [...works.values()].sort((a, b) => a.workId.localeCompare(b.workId, "en"));
}

function field(value, locator) {
  return { ...locator, ...searchText(value) };
}
function fieldsFor(work) {
  const titles = work.titles.map(title => field(title.value, {
    field: "work.title", observationId: null, role: null, sourceFile: null, jsonPointer: null,
    corpusFile: "works.json", corpusJsonPointer: title.corpusJsonPointer, href: work.url,
  }));
  const observations = work.observations.map(observation => ({
    observationId: observation.id,
    fields: ["title", "text"].map(key => field(observation[key], {
      field: `observation.${key}`, observationId: observation.id, role: observation.role,
      sourceFile: observation.sourceFile, jsonPointer: observation.jsonPointer,
      corpusFile: "works.json", corpusJsonPointer: `${observation.corpusJsonPointer}/${key}`, href: observation.href,
      ...(observation.mainWorkId ? { mainWorkId: observation.mainWorkId } : {}),
      ...(observation.referenceKind ? { referenceKind: observation.referenceKind } : {}),
    })),
  }));
  return { titles, observations };
}
function findMatches(group, fields) {
  const matches = [];
  for (const { term, needle } of group.compiledTerms) {
    for (const source of fields) {
      let from = 0;
      while (from <= source.text.length - needle.length) {
        const start = source.text.indexOf(needle, from);
        if (start < 0) break;
        const end = start + needle.length;
        from = start + 1;
        if ((latinOrNumber.test(needle[0]) && start > 0 && latinOrNumber.test(source.text[start - 1]))
          || (latinOrNumber.test(needle.at(-1)) && end < source.text.length && latinOrNumber.test(source.text[end]))) continue;
        const rawStart = source.starts[start], rawEnd = source.ends[end - 1];
        const { text, starts, ends, source: rawText, ...locator } = source;
        matches.push({ ...locator, term, normalizedTerm: needle, matchedText: rawText.slice(rawStart, rawEnd),
          span: { start: rawStart, end: rawEnd, unit: "UTF-16" },
          excerpt: rawText.slice(Math.max(0, rawStart - 80), Math.min(rawText.length, rawEnd + 120)) });
      }
    }
  }
  return matches;
}
function independent(a, b) {
  // Repeating an alias/object phrase, or matching a subphrase of it, is one signal.
  if (a.normalizedTerm.includes(b.normalizedTerm) || b.normalizedTerm.includes(a.normalizedTerm)) return false;
  if (a.corpusJsonPointer !== b.corpusJsonPointer) return true;
  return a.span.end <= b.span.start || b.span.end <= a.span.start;
}
function selectIndependent(rule, matches, requireObservation) {
  function visit(index, selected) {
    if (index === rule.all.length) {
      return !requireObservation || selected.some(match => match.observationId) ? selected : null;
    }
    for (const match of matches.get(rule.all[index]) || []) {
      if (selected.every(previous => independent(previous, match))) {
        const result = visit(index + 1, [...selected, match]);
        if (result) return result;
      }
    }
    return null;
  }
  return visit(0, []);
}
function matchScope(profile, fields, observationId) {
  const matches = new Map(profile.groups.map(group => [group.id, findMatches(group, fields)]));
  for (const rule of profile.rules) {
    const selected = selectIndependent(rule, matches, observationId !== null);
    if (!selected) continue;
    const groups = rule.all.map((id, index) => {
      const group = profile.groups.find(group => group.id === id);
      return { ruleId: rule.id, scopeObservationId: observationId, groupId: id, kind: group.kind,
        label: group.label, auxiliary: false, matches: [selected[index]] };
    });
    for (const group of profile.groups.filter(group => group.kind === "context")) {
      const contextual = matches.get(group.id).find(match => observationId === null || match.observationId === observationId);
      if (contextual) groups.push({ ruleId: rule.id, scopeObservationId: observationId, groupId: group.id,
        kind: group.kind, label: group.label, auxiliary: true, matches: [contextual] });
    }
    return groups;
  }
  return [];
}

/** Pure, offline initial screening. No relation judgments, PR fetching, or publication. */
export function screenModPrs({ corpus, profiles }) {
  validateProfiles(profiles);
  const works = validateCorpus(corpus).map(work => ({ ...work, fields: fieldsFor(work) }));
  const candidates = [], coverage = [];
  const compiledProfiles = profiles.profiles.map(profile => ({ ...profile, groups: profile.groups.map(group => {
    const unique = new Map();
    for (const term of group.terms) {
      const needle = normalizeText(term);
      if (!unique.has(needle)) unique.set(needle, { term, needle });
    }
    return { ...group, compiledTerms: [...unique.values()] };
  }) }));
  for (const profile of compiledProfiles) {
    const found = [];
    for (const work of works) {
      const titleGroups = matchScope(profile, work.fields.titles, null);
      const matchedGroups = [...titleGroups];
      for (const observation of work.fields.observations) {
        // Signals may combine with the PR's title, but never with another observation's text.
        matchedGroups.push(...matchScope(profile, [...work.fields.titles, ...observation.fields], observation.observationId));
      }
      if (!matchedGroups.length) continue;
      const observationIds = [...new Set(matchedGroups.flatMap(group => group.matches.map(match => match.observationId)).filter(Boolean))].sort();
      found.push({
        id: `candidate:${sha(`${profile.modId}\n${work.workId}`)}`,
        modId: profile.modId, workId: work.workId, title: work.title, url: work.url,
        observationIds, matchedGroups, status: "needs_review", screeningOnly: true,
        evidenceScope: observationIds.length ? "local_corpus_fields" : "local_corpus_title_only",
        pendingChecks: ["核对 PR 原文和必要代码", "核对 MOD 与 PR 的处理对象、机制及适用条件", "自动命中不证明方法关系、性能收益或创新性"],
      });
    }
    candidates.push(...found);
    coverage.push({ modId: profile.modId, componentId: profile.componentId, screeningStatus: "screened",
      candidateCount: found.length, reviewedCount: 0, pendingCount: found.length,
      note: `已对本轮 ${works.length} 个独立 PR 的站内字段完成规则初筛；${found.length} 条线索待原文及代码核查。${works.length === 0 ? "本轮 corpus 为空。" : ""}未命中不表示社区无人研究；初筛不计原文核查完成。`,
    });
  }
  const profileHash = hashProfiles(profiles);
  return {
    candidates: { schemaVersion: 1, corpusId: corpus.corpusId, profileHash, rulesVersion: RULES_VERSION, candidates },
    coverage: { schemaVersion: 1, corpusId: corpus.corpusId, profileHash, rulesVersion: RULES_VERSION,
      corpusWorkCount: works.length, mods: coverage },
  };
}

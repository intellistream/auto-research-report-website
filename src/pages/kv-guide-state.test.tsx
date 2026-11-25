import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { KvGuideLink } from "./KvGuideLink";
import KvBasics from "./KvBasics";
import { initialKvGuideState, kvGuideSearch, parseKvGuideState, shouldResetKvPosition, withKvGuideState } from "./kv-guide-state";

const current = { modelId: "qwen3-14b", tokens: 16384, sequences: 8, position: 6 };
const queryFor = (state = current) => withKvGuideState(new URLSearchParams("view=guide&part=kv-basics-process"), state);

function renderedLink(targetState?: Parameters<typeof KvGuideLink>[0]["targetState"]) {
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/topics/kv-cache?${queryFor()}`]}>
    <KvGuideLink part="kv-basics-linear-attention" targetState={targetState}>目标</KvGuideLink>
  </MemoryRouter>);
  const href = html.match(/href="([^"]+)"/)![1].replaceAll("&amp;", "&");
  return new URL(href, "https://example.test");
}

describe("KV configuration addresses", () => {
  it("opens legacy chapter addresses at deterministic defaults without a warning", () => {
    for (const search of ["", "view=guide", "view=guide&part=kv-basics-linear-attention&future=1"]) {
      expect(parseKvGuideState(new URLSearchParams(search))).toEqual({ state: initialKvGuideState, invalid: [] });
    }
  });

  it("preserves each valid field while rejecting unknown models, nonintegers and range/step violations", () => {
    const parsed = parseKvGuideState(new URLSearchParams("kv-model=unknown&kv-tokens=16384&kv-requests=6&kv-position=8"));
    expect(parsed.state).toEqual({ ...initialKvGuideState, tokens: 16384, sequences: 6, position: 8 });
    expect(parsed.invalid).toEqual(["modelId"]);
    for (const invalid of ["", "0", "1023", "1536", "33792", "1e4", "8192.0", "-8192", " 8192", "Infinity", "9007199254740992"]) {
      const result = parseKvGuideState(new URLSearchParams(`kv-tokens=${encodeURIComponent(invalid)}&kv-requests=6&kv-position=5`));
      expect(result.state).toEqual({ ...initialKvGuideState, sequences: 6, position: 5 });
      expect(result.invalid).toEqual(["tokens"]);
    }
    for (const [field, bad] of [["kv-requests", "17"], ["kv-requests", "1.5"], ["kv-position", "0"], ["kv-position", "9"]]) {
      expect(parseKvGuideState(new URLSearchParams(`${field}=${bad}`)).invalid).toHaveLength(1);
    }
  });

  it("accepts both endpoints and rejects ambiguous duplicate parameters independently", () => {
    for (const [tokens, sequences, position] of [[1024, 1, 1], [32768, 16, 8]]) {
      const state = { modelId: "qwen3.5-35b-a3b", tokens, sequences, position };
      expect(parseKvGuideState(queryFor(state))).toEqual({ state, invalid: [] });
    }
    const parsed = parseKvGuideState(new URLSearchParams("kv-model=qwen3.5-35b-a3b&kv-tokens=32768&kv-requests=4&kv-requests=6&kv-position=5"));
    expect(parsed.state).toEqual({ modelId: "qwen3.5-35b-a3b", tokens: 32768, sequences: 4, position: 5 });
    expect(parsed.invalid).toEqual(["sequences"]);
  });

  it("normalizes only KV fields once and retains unrelated extensions", () => {
    const query = new URLSearchParams("view=guide&part=kv-basics-memory&future=value&kv-model=bad&kv-requests=6");
    const normalized = withKvGuideState(query, parseKvGuideState(query).state);
    expect(normalized.get("future")).toBe("value");
    expect(normalized.get("part")).toBe("kv-basics-memory");
    expect(normalized.get("kv-requests")).toBe("6");
    expect(parseKvGuideState(normalized).invalid).toEqual([]);
    expect(withKvGuideState(normalized, parseKvGuideState(normalized).state).toString()).toBe(normalized.toString());
    expect(query.get("kv-model")).toBe("bad");
  });

  it("encodes the whole promised target in the native href for copied/new-tab addresses", () => {
    const target = { modelId: "qwen3.5-35b-a3b", position: 5 };
    const href = renderedLink(target);
    expect(href.pathname).toBe("/topics/kv-cache");
    expect(href.searchParams.get("part")).toBe("kv-basics-linear-attention");
    expect(parseKvGuideState(href.searchParams).state).toEqual({ ...current, ...target });
    expect(parseKvGuideState(renderedLink().searchParams).state).toEqual(current);
    // Resolving an explicit position does not change a separately selected capacity load.
    const search = kvGuideSearch(queryFor(), "kv-basics-linear-attention", { position: 4 });
    expect(parseKvGuideState(new URLSearchParams(search)).state).toEqual({ ...current, position: 4 });
  });

  it("resets only explicit position navigation and POP, retaining phase for chapter/exploration changes", () => {
    expect(shouldResetKvPosition("PUSH", { kvGuideNavigation: "position" })).toBe(true);
    for (const kind of ["chapter", "explore", "normalize"]) {
      expect(shouldResetKvPosition("REPLACE", { kvGuideNavigation: kind })).toBe(false);
      expect(shouldResetKvPosition("PUSH", { kvGuideNavigation: kind })).toBe(false);
      expect(shouldResetKvPosition("POP", { kvGuideNavigation: kind })).toBe(true);
    }
    expect(shouldResetKvPosition("POP", null)).toBe(true);
  });

  it("hydrates an external target from the same configuration carried by its href", () => {
    const state = { modelId: "qwen3.5-35b-a3b", tokens: 8192, sequences: 4, position: 5 };
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/topics/kv-cache?${queryFor(state)}`]}><KvBasics /></MemoryRouter>);
    expect(html).toContain('value="qwen3.5-35b-a3b" selected=""');
    expect(html).toContain('0.625 <small>GiB</small>');
    expect(html).toContain('位置 5 /');
    expect(html).toContain('写入前');
  });
  it("groups the prefix example and research exits under the three-chapter reading path", () => {
    const html = renderToStaticMarkup(<MemoryRouter><KvBasics /></MemoryRouter>);
    const lifecycle = html.indexOf('id="kv-basics-lifecycle"');
    const optional = html.indexOf('<details class="kv-guide-extension"');
    const research = html.indexOf('id="kv-basics-questions"');
    expect(lifecycle).toBeGreaterThan(html.indexOf('id="kv-basics-memory"'));
    expect(optional).toBeGreaterThan(lifecycle);
    expect(research).toBeGreaterThan(optional);
    expect(html.slice(lifecycle, optional)).toContain('<h4 id="kv-example-title" tabindex="-1">');
    expect(html.match(/<h3[ >]/g)).toHaveLength(5);
    expect(html).toContain('<h4>接下来读论文</h4>');
    expect(html).toContain('<h4>接下来跟踪实现</h4>');
  });

  it("keeps the optional linear cursor mounted behind a native closed disclosure", () => {
    const html = renderToStaticMarkup(<MemoryRouter><KvBasics /></MemoryRouter>);
    expect(html).toContain('<details class="kv-guide-extension"><summary>');
    const linear = html.indexOf('id="kv-basics-linear-attention"');
    expect(linear).toBeGreaterThan(html.indexOf('<details class="kv-guide-extension"'));
    expect(html.slice(linear)).toContain('data-position="4" data-phase="ready"');
    expect(html).toContain('aria-current="location"');
  });

});

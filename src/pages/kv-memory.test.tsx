import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import KvMemory from "./KvMemory";
import { initialMemoryLoad, type MemoryComparison, type MemoryLoad } from "./kv-basics";

function render(load: MemoryLoad, comparison: MemoryComparison | null = null) {
  return renderToStaticMarkup(<MemoryRouter><KvMemory load={load} comparison={comparison} onChange={() => {}} /></MemoryRouter>);
}

describe("capacity result scope and comparison", () => {
  it("keeps a small hybrid value and its extra states beside both result and figure", () => {
    const html = render({ ...initialMemoryLoad, modelId: "qwen3.5-35b-a3b" });
    expect(html.match(/class="kv-hbm-cell"/g)).toHaveLength(64);
    expect(html).toContain('style="width:62.5%"');
    expect(html).toContain("0.625 <small>GiB</small>");
    const result = html.split('aria-label="当前容量结果"')[1].split('<span class="kv-memory-announcement"')[0];
    for (const term of ["Qwen3.5-35B-A3B", "BF16", "10", "8,192", "4", "30", "递推状态"]) expect(result).toContain(term);
  });
  it("keeps the complete smallest allowed value without enlarging its cell", () => {
    const html = render({ modelId: "qwen3.5-35b-a3b", tokens: 1024, sequences: 1 });
    expect(html).toContain("0.01953125 <small>GiB</small>");
    expect(html).toContain('style="width:1.953125%"');
  });
  it("shows full overflow and disables unavailable exact doublings", () => {
    const html = render({ ...initialMemoryLoad, tokens: 32768, sequences: 16 });
    expect(html).toContain("80 <small>GiB</small>");
    expect(html).toContain("125.00%");
    expect(html).toContain("超出参照 16 GiB");
    expect(html.match(/class="kv-hbm-cell"/g)).toHaveLength(64);
    expect(html.match(/class="kv-hbm-cell is-overflow"/g)).toHaveLength(16);
    expect(html.match(/style="width:100%"/g)).toHaveLength(80);
    expect(html).toContain("绿色表示参照内 64 GiB，橙色表示超出 16 GiB");
    expect(html).not.toContain("图中最多填满 64 格");
    expect(html).toContain('disabled="">已缓存长度翻倍');
    expect(html).toContain('disabled="">请求数翻倍');
  });
  it("preserves one GiB per cell across the reference boundary and fractional overflow", () => {
    const below = render({ ...initialMemoryLoad, tokens: 25600, sequences: 16 });
    expect(below).toContain("62.5 <small>GiB</small>");
    expect(below).not.toContain('class="kv-hbm-overflow"');
    expect(below).toContain("参照图未填部分");
    const fractional = render({ ...initialMemoryLoad, tokens: 27648, sequences: 16 });
    expect(fractional).toContain("67.5 <small>GiB</small>");
    const fills = [...fractional.matchAll(/class="kv-hbm-cell is-overflow"><span style="width:([\d.]+)%"/g)]
      .map(match => Number(match[1]) / 100);
    expect(fills).toEqual([1, 1, 1, 0.5]);
    expect(64 + fills.reduce((sum, fill) => sum + fill, 0)).toBe(67.5);
    expect(fractional).toContain("橙色表示超出 3.5 GiB；每格仍为 1 GiB");
  });
  it("shows a comparison only after an explicit action while preserving the current result", () => {
    const after = { ...initialMemoryLoad, tokens: 16384 };
    const free = render(after);
    expect(free).not.toContain('class="kv-memory-change"');
    expect(free).toContain("10 <small>GiB</small>");
    expect(free).not.toContain("之前：");
    const doubled = render(after, { before: initialMemoryLoad, after, action: "double-tokens" });
    expect(doubled).toContain("本次操作：已缓存长度翻倍");
    expect(doubled).toContain("5 GiB");
    expect(doubled).toContain("10 GiB");
    expect(doubled).toContain("恢复 Qwen3-14B · 8,192 token × 4 请求");
  });
});

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import KvGeneration from "./KvGeneration";
import KvLinearAttention from "./KvLinearAttention";

function renderLinear(position: number) {
  return renderToStaticMarkup(<MemoryRouter><KvLinearAttention initialStep={position} resetToken={1} onPositionChange={() => {}} onSelectHybrid={() => {}} /></MemoryRouter>);
}

describe("generation and attention presentation contracts", () => {
  it("starts with an empty KV cache while keeping future sequence placeholders", () => {
    const html = renderToStaticMarkup(<MemoryRouter><KvGeneration onCompare={() => {}} /></MemoryRouter>);
    expect(html).not.toContain('class="kv-generation-slots"');
    expect(html).toContain('class="kv-generation-empty"');
    expect(html).toContain("未来占位");
    expect(html.match(/aria-live=/g)).toHaveLength(1);
    expect(html).toContain('aria-controls="kv-generation-scene"');
    expect(html).toContain('<details class="kv-basics-formula kv-generation-self-check">');
  });

  it("renders the selected prefix without future KV or results before reading", () => {
    for (const position of [1, 4, 5, 6, 8]) {
      const html = renderLinear(position);
      expect(html.match(/class="kv-linear-kv is-written/g) ?? []).toHaveLength(position - 1);
      expect(html).toContain('class="kv-linear-output-pair"');
      expect(html.match(/<strong>等待读取<\/strong>/g)?.length).toBeGreaterThanOrEqual(2);
      expect(html).not.toMatch(/<strong>≈ /);
      expect(html).toContain(`重播第 ${position} 位置`);
      expect(html.match(/aria-live=/g)).toHaveLength(1);
      expect(html).not.toContain("background-color:");
    }
  });

  it("uses native optional disclosures and names the matrix row and column axes", () => {
    const html = renderLinear(4);
    expect(html).toContain('<details class="kv-linear-depth">');
    expect(html).toContain('<details class="kv-linear-self-check">');
    expect(html).toContain('<caption>S3 · 写入前 · 行：K 特征；列：V 分量</caption>');
    expect(html).toContain('<th scope="col">V 分量 1</th>');
    expect(html).toContain('<th scope="row">K 特征 1</th>');
    expect(html).toContain('tabindex="0" role="region" aria-label="历史 KV 数值表，可横向滚动"');
    expect(html).not.toMatch(/<td[^>]*tabindex=/);
  });

  it("puts the hybrid model selection in the actual address", () => {
    const html = renderLinear(4);
    const href = html.match(/class="kv-linear-memory-link" href="([^"]+)"/)?.[1];
    expect(href).toContain("kv-model=qwen3.5-35b-a3b");
    expect(href).toContain("part=kv-basics-memory");
  });
});

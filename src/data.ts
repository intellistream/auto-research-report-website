import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../schemas/DailyReport.schema.json";
import {
  chapterKeys,
  entriesOf,
  type Report,
  type Catalog,
  type CatalogItem,
  type Asset,
  type RunData,
} from "./types";
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validReport = ajv.compile(schema);
export function safeSource(value: string): string | null {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
const base = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : import.meta.env.BASE_URL + "/";
/** Prefix a root-absolute site path with the configured Vite base (project pages). */
export function siteUrl(value: string): string {
  return base + value.replace(/^\/+/, "");
}
export function assetPath(value: string): string {
  if (
    !/^\/data\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(value) ||
    value.includes("..")
  )
    throw new Error("产物路径不在允许范围内");
  return value;
}
export function parseReport(raw: unknown, item: CatalogItem): Report {
  if (!validReport(raw)) throw new Error("报告格式或版本不受支持");
  const r = raw as Report;
  if (r.day !== item.day || r.synthetic !== item.synthetic)
    throw new Error("报告日期或来源与索引不一致");
  if (r.synthetic && !r.coverage_notice)
    throw new Error("合成报告缺少范围说明");
  if (
    r.chapters.length !== 9 ||
    r.chapters.some((c, i) => c.key !== chapterKeys[i])
  )
    throw new Error("章节顺序与当前十一章契约不符");
  const entries = entriesOf(r),
    ids = new Set<string>(),
    cards = new Set<string>(),
    numbers = new Set<string>();
  for (const chapter of r.chapters)
    for (const group of chapter.groups)
      for (const entry of group.entries) {
        const { card, number } = entry,
          c = card.content;
        if (
          ids.has(card.work_id) ||
          cards.has(card.card_id) ||
          numbers.has(number)
        )
          throw new Error("条目身份或编号重复");
        ids.add(card.work_id);
        cards.add(card.card_id);
        numbers.add(number);
        if (c.chapter !== chapter.key || r.numbers[card.card_id] !== number)
          throw new Error("条目章节或编号不一致");
        if (!c.original_title || !c.title_status)
          throw new Error("报告缺少交付标题状态");
        if (!c.body && (!c.problem || !c.optimization || !c.effects_and_limits))
          throw new Error("报告缺少完整正文");
        if (c.source_links.some((s) => !safeSource(s.url)))
          throw new Error("来源地址不安全");
        if (
          c.location_basis &&
          c.location_basis !== "delivered_chapter" &&
          !card.needs_review
        )
          throw new Error("已核查条目不能使用临时位置");
        if ((card.source_type === "paper") !== (c.chapter === "papers"))
          throw new Error("论文身份与章节不一致");
        const expected = card.source_type === "paper" ? [] : [c.chapter];
        if (JSON.stringify(c.diagram_nodes) !== JSON.stringify(expected))
          throw new Error("条目图位置与章节不一致");
        const actual = Object.entries(r.diagram_numbers).flatMap(([key, ns]) =>
          ns.filter((n) => n === number).map(() => key),
        );
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          throw new Error("图编号覆盖不一致");
      }
  if (
    entries.length !== item.entries ||
    entries.filter((e) => e.card.needs_review).length !== item.pending
  )
    throw new Error("条目计数与索引不一致");
  if (
    Object.keys(r.numbers).length !== entries.length ||
    Object.values(r.diagram_numbers)
      .flat()
      .some((n) => !numbers.has(n))
  )
    throw new Error("图或编号包含未知条目");
  return r;
}
export async function checkedBytes(
  asset: Asset,
): Promise<Uint8Array<ArrayBuffer>> {
  assetPath(asset.path);
  const response = await fetch(siteUrl(asset.path));
  if (!response.ok) throw new Error("产物加载失败（" + response.status + "）");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== asset.sha256) throw new Error("产物校验失败，请勿使用该版本");
  return bytes;
}
export async function loadCatalog(): Promise<Catalog> {
  const response = await fetch(siteUrl("/data/catalog.json"));
  if (!response.ok) throw new Error("日报索引加载失败");
  const r = await response.json();
  if (r.schema_version !== "site-index/0.1" || !Array.isArray(r.items))
    throw new Error("日报索引版本不受支持");
  const ids = new Set();
  for (const i of r.items) {
    if (
      typeof i.id !== "string" ||
      ids.has(i.id) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(i.day) ||
      typeof i.synthetic !== "boolean" ||
      !["available", "zero_candidates", "not_generated", "failed"].includes(
        i.status,
      )
    )
      throw new Error("索引身份或状态无效");
    if (
      i.status === "available" &&
      (!i.report ||
        !i.runData ||
        !Number.isInteger(i.entries) ||
        !Number.isInteger(i.pending))
    )
      throw new Error("报告索引缺少交付数据");
    ids.add(i.id);
    if (i.report) assetPath(i.report.path);
    if (i.runData) assetPath(i.runData.path);
    if (!i.assets || typeof i.assets !== "object")
      throw new Error("索引缺少产物清单");
    Object.values(i.assets).forEach((a) => assetPath((a as Asset).path));
  }
  return r;
}
export async function loadReport(item: CatalogItem): Promise<Report> {
  if (!item.report) throw new Error("该日期没有可阅读的报告");
  return parseReport(
    JSON.parse(new TextDecoder().decode(await checkedBytes(item.report))),
    item,
  );
}
export async function loadRun(item: CatalogItem): Promise<RunData> {
  if (!item.runData) throw new Error("运行信息尚未交付");
  const r = JSON.parse(
    new TextDecoder().decode(await checkedBytes(item.runData)),
  ) as RunData;
  if (
    r.id !== item.run ||
    r.report_id !== item.id ||
    r.synthetic !== item.synthetic
  )
    throw new Error("运行与报告身份不一致");
  return r;
}

import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

const root = "http://127.0.0.1:5173/";
const records = [];
const directory = "/tmp/specdec-browser";
mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox"] });

async function inspect(label, hash, width, height, verify) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => { if (msg.type() === "error") errors.push("console: " + msg.text()); });
  const url = root + "#" + hash;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".acl-topic", { timeout: 15000 });
  const probe = await page.evaluate(() => {
    const container = document.querySelector(".acl-topic");
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return {
      title: document.title,
      h1: document.querySelector(".acl-topic h1")?.textContent,
      tab: document.querySelector(".acl-topic-nav [aria-current='page']")?.textContent,
      chapters: document.querySelectorAll("details.survey-body-section").length,
      openedChapters: document.querySelectorAll("details.survey-body-section[open]").length,
      analyticSections: document.querySelectorAll(".survey-analytical-subsection").length,
      gaps: document.querySelectorAll("#survey-gaps .survey-gap").length,
      evidenceCards: document.querySelectorAll(".survey-evidence-detail").length,
      manuscriptChapters: document.querySelectorAll(".specdec-manuscript > section[id^='specdec-survey-']").length,
      hasHistory: !!document.getElementById("specdec-history-heading"),
      hasCrossLayer: !!document.getElementById("specdec-cross-layer-heading"),
      hasQuote: document.body.innerText.includes("工程证据支持的条件性判断"),
      width: document.documentElement.clientWidth,
      overflow,
      contentWidth: container?.getBoundingClientRect().width,
      snapshot: location.hash,
    };
  });
  assert.equal(errors.length, 0, label + ": browser console/page exceptions " + errors.join("; "));
  assert.ok(probe.overflow <= 8, label + ": horizontal document overflow " + probe.overflow);
  assert.ok(probe.contentWidth <= width + 3, label + ": topic container wider than viewport");
  await verify(page, probe);
  await page.screenshot({ path: `${directory}/${label}.png`, animations: "disabled" });
  records.push({ label, url, ...probe });
  console.log("BROWSER CHECK", JSON.stringify(records.at(-1)));
  await context.close();
}

try {
  await inspect("spec-guide-desktop", "/topics/speculative-decoding", 1440, 900, async (_page, p) => {
    assert.equal(p.h1, "Speculative Decoding");
    assert.equal(p.tab, "导引");
    assert.equal(p.chapters, 0);
  });
  await inspect("spec-paper-desktop", "/topics/speculative-decoding?view=paper", 1440, 900, async (page, p) => {
    assert.equal(p.tab, "综述");
    assert.ok(p.hasHistory);
    assert.ok(p.hasCrossLayer);
    assert.ok(p.manuscriptChapters >= 8);
    const first = page.locator(".specdec-map-list button").first();
    await first.click();
    assert.equal(await first.getAttribute("aria-pressed"), "true");
    assert.ok((await page.locator("#specdec-map-panel").innerText()).includes("工程证据支持的条件性判断"));
  });
  await inspect("spec-report-desktop", "/topics/speculative-decoding?view=report", 1440, 900, async (_page, p) => {
    assert.equal(p.tab, "动态报告");
    assert.equal(p.chapters, 8);
    assert.equal(p.openedChapters, 8);
    assert.ok(p.analyticSections >= 20);
    assert.equal(p.gaps, 5);
    assert.equal(p.evidenceCards, 10);
  });
  await inspect("spec-report-brief", "/topics/speculative-decoding?view=report&read=brief", 1440, 900, async (_page, p) => {
    assert.equal(p.chapters, 8);
    assert.equal(p.openedChapters, 0);
  });
  await inspect("spec-paper-mobile", "/topics/speculative-decoding?view=paper", 390, 844, async (_page, p) => {
    assert.equal(p.tab, "综述");
    assert.ok(p.hasHistory && p.hasCrossLayer);
  });
  await inspect("spec-report-mobile", "/topics/speculative-decoding?view=report", 390, 844, async (_page, p) => {
    assert.equal(p.chapters, 8);
    assert.equal(p.openedChapters, 8);
  });
  await inspect("acl-paper-regression", "/topics/aclgraph?view=paper", 1440, 900, async (_page, p) => {
    assert.ok(p.h1?.includes("ACL"));
    assert.equal(p.tab, "综述");
  });
  await inspect("acl-report-regression", "/topics/aclgraph?view=report", 1440, 900, async (_page, p) => {
    assert.equal(p.tab, "动态报告");
  });
} finally {
  writeFileSync(`${directory}/diagnostics.json`, JSON.stringify(records, null, 2) + "\n");
  await browser.close();
}

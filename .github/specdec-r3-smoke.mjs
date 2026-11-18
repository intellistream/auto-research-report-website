import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("/tmp/specdec-r3", { recursive: true });
const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox"]});
const checks=[];
async function visit(name,hash,viewport,fn) {
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("response",response=>{
    if(response.status()>=400 && !response.url().endsWith("/favicon.ico"))
      errors.push(response.status()+" "+response.url());
  });
  await page.goto("http://127.0.0.1:5173/#"+hash,{waitUntil:"networkidle",timeout:30000});
  await page.locator(".acl-topic").waitFor();
  await fn(page);
  const result=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,hash:location.hash}));
  assert.ok(result.scroll<=result.width+8,name+" overflow "+JSON.stringify(result));
  assert.deepEqual(errors,[],name+" browser errors");
  await page.screenshot({path:"/tmp/specdec-r3/"+name+".png",animations:"disabled"});
  checks.push({name,...result});
  console.log("BROWSER PASS",name,JSON.stringify(result));
  await context.close();
}
try {
  await visit("spec-report-brief","/topics/speculative-decoding?view=report",{width:1440,height:900},async page=>{
    const toc=await page.locator(".survey-toc a").allTextContents();
    const first=toc.slice(0,4).map(x=>x.replace(/\\s+/g," ").trim());
    assert.deepEqual(first,[
      "01 摘要与研究问题","02 范围与研究方法",
      "03 技术路线与权衡","04 局部工程证据对照",
    ]);
    assert.equal(await page.locator("#survey-analysis").getAttribute("open"),null);
    assert.equal(await page.locator("#survey-evidence").count(),1);
    await page.locator("#survey-analysis > summary").click();
    assert.equal(await page.locator("#survey-analysis").getAttribute("open"),"");
    const headings=await page.locator(".survey-body-section > summary h2").allTextContents();
    assert.equal(headings.length,8);
    assert.equal(headings[0],"推测执行的正确性：目标分布与合法前缀");
    assert.equal(headings[7],"未解问题：研究假设、验证路径与局限");
    await page.locator("#survey-evidence > summary").click();
    assert.equal(await page.locator(".survey-evidence-detail").count(),10);
    assert.equal(await page.locator(".specdec-evidence-group").count(),3);
    assert.equal(await page.locator("#survey-methods").getAttribute("open"),null);
    await page.locator("#survey-methods > summary").click();
    assert.equal(await page.locator("#survey-methods").getAttribute("open"),"");
  });
  await visit("spec-report-full","/topics/speculative-decoding?view=report&read=full",{width:1440,height:900},async page=>{
    assert.equal(await page.locator("#survey-analysis").getAttribute("open"),"");
    assert.equal(await page.locator(".survey-body-section[open]").count(),8);
    assert.equal(await page.locator(".survey-evidence-detail").count(),10);
    const hasCandidate=await page.getByText("新入候选：20 条 PR",{exact:false}).count();
    assert.ok(hasCandidate>0);
  });
  await visit("spec-report-mobile","/topics/speculative-decoding?view=report&read=full",{width:390,height:844},async page=>{
    assert.equal(await page.locator(".survey-body-section").count(),8);
  });
  await visit("spec-paper","/topics/speculative-decoding?view=paper",{width:1440,height:900},async page=>{
    const texts=await page.locator(".specdec-manuscript > section > h2").allTextContents();
    assert.equal(texts.length>=9,true);
    assert.ok(texts.some(x=>x.startsWith("4 目标验证")));
  });
  await visit("acl-report-regression","/topics/aclgraph?view=report",{width:1440,height:900},async page=>{
    assert.equal(await page.locator("#survey-analysis").getAttribute("open"),null);
    assert.equal(await page.locator(".survey-body-section").count(),8);
  });
}finally{
  writeFileSync("/tmp/specdec-r3/results.json",JSON.stringify(checks,null,2));
  await browser.close();
}

import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser=await chromium.launch({channel:"chrome",headless:true,args:["--no-sandbox"]});
try {
  for (const [label,url,width,need] of [
    ["SpecDec report", "#/topics/speculative-decoding?view=report",1440,true],
    ["SpecDec full mobile", "#/topics/speculative-decoding?view=report&read=full",390,true],
    ["SpecDec survey", "#/topics/speculative-decoding?view=paper",1440,false],
    ["ACL report", "#/topics/aclgraph?view=report",1440,false],
  ]) {
    const context=await browser.newContext({viewport:{width,height:844}});
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/"+url,{waitUntil:"networkidle",timeout:30000});
    await page.locator(".acl-topic").waitFor();
    assert.deepEqual(errors,[],label+" console/page errors");
    assert.equal(await page.locator(".specdec-research-assets").count(),0,label+" leaked internal research banner");
    const w=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    assert.ok(w<=8,label+" horizontal overflow "+w);
    if(need){
      const links=await page.locator(".survey-toc a").allTextContents();
      assert.deepEqual(links.slice(0,4).map(x=>x.slice(2).trim()),[
        "摘要与研究问题","范围与研究方法","技术路线与权衡","局部工程证据对照"
      ]);
      assert.equal(await page.locator(".survey-evidence-detail").count(),10);
      assert.equal(await page.locator(".survey-body-section").count(),8);
      assert.ok(await page.getByText("新入候选：20 条 PR",{exact:false}).count()>0);
    }
    console.log("BROWSER PR GATE PASS",label,width);
    await context.close();
  }
} finally {await browser.close();}

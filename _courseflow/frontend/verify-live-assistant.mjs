// Manual production smoke test. Makes public read-only course requests;
// watch changes exist only inside a fresh disposable browser context.
import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';

const baseURL=process.env.COURSEFLOW_TEST_URL||'https://wangcb424.github.io/portfolio/courseflow/';
const proxy=process.env.HTTPS_PROXY||process.env.https_proxy;
const browser=await chromium.launch({headless:true,...(proxy?{proxy:{server:proxy}}:{})});
const report={url:baseURL,checkedAt:new Date().toISOString(),apiResponses:[],pageErrors:[]};
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:Boolean(proxy)});
  report.initialCookies=(await context.cookies()).length;
  assert.equal(report.initialCookies,0);
  const page=await context.newPage();
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('response',response=>{if(response.url().includes('/api/catalog/'))report.apiResponses.push({url:response.url(),status:response.status()});});
  await page.goto(baseURL,{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('button',{name:'AI assistant',exact:true}).click();
  await page.getByLabel('Ask in English or 中文').fill('CS3100 seats');
  await page.getByRole('button',{name:'Send',exact:false}).click();
  await page.locator('.assistant-reply .seat-card').first().waitFor({timeout:90000});
  report.courseCodes=await page.locator('.assistant-reply .course-code').allTextContents();
  assert(report.courseCodes.length>0&&report.courseCodes.every(code=>code==='CS3100'));
  report.available=await page.locator('.assistant-reply .seat-count strong').allTextContents();
  assert(report.available.every(value=>/^\d+$/.test(value)));
  await page.locator('.assistant-reply .seat-card').first().getByRole('button',{name:'Track this section',exact:false}).click();
  await page.getByRole('button',{name:'My watchlist',exact:false}).click();
  await page.getByRole('heading',{name:'1 tracked sections'}).waitFor();
  report.trackedByExplicitButton=true;
  await context.close();

  const mobile=await browser.newContext({...devices['iPhone 13'],ignoreHTTPSErrors:Boolean(proxy)});
  const phone=await mobile.newPage();
  phone.on('pageerror',error=>report.pageErrors.push(error.message));
  await phone.goto(baseURL,{waitUntil:'domcontentloaded',timeout:60000});
  await phone.getByRole('button',{name:'My watchlist',exact:false}).click();
  await phone.getByRole('heading',{name:'Your next semester starts here'}).waitFor();
  report.isolatedVisitor=true;
  await phone.getByRole('button',{name:'AI assistant',exact:true}).click();
  await phone.getByLabel('Ask in English or 中文').fill('Spring 2099 的 CS3100 有空位吗？');
  await phone.getByRole('button',{name:'Send',exact:false}).click();
  await phone.locator('.assistant-reply').first().waitFor({timeout:60000});
  report.unpublishedTermReply=await phone.locator('.assistant-reply .assistant-message-text').first().textContent();
  assert.match(report.unpublishedTermReply,/未|没有|not|unavailable/i);
  assert.equal(await phone.locator('.assistant-reply .seat-card').count(),0);
  report.mobileOverflow=await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(report.mobileOverflow,false);
  assert.deepEqual(report.pageErrors,[]);
  report.result='passed';
  report.tlsNote=proxy?'Browser trusts the execution proxy only for this test; application TLS handling is unchanged.':'Default browser TLS verification.';
  console.log(JSON.stringify(report,null,2));
  await mobile.close();
}finally{await browser.close();}

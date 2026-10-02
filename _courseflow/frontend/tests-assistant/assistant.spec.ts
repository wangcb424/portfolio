import {test,expect,type Page} from '@playwright/test';
import type {Seat} from '../src/api';

const home='/portfolio/courseflow/';
async function fixture(page:Page){
  const state={searches:[] as {term:string;course:string}[],failCourse:'',emptyCourse:'',delayCourse:'',delayMs:200};
  await page.route('https://api.courseflow.test/api/**',async route=>{
    expect(route.request().method()).toBe('GET');
    expect(route.request().headers()['cookie']).toBeUndefined();
    const url=new URL(route.request().url());
    if(url.pathname==='/api/status')return route.fulfill({json:{demo:false,source:'banner',pollSeconds:300,staleSeconds:900,lastPoll:null,officialUrl:'https://nubanner.neu.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search',version:'0.2.0'}});
    if(url.pathname==='/api/catalog/terms')return route.fulfill({json:[{code:'202710',description:'Fall 2026'}]});
    expect(url.pathname).toBe('/api/catalog/sections');
    const term=url.searchParams.get('term')!,course=url.searchParams.get('q')!;
    state.searches.push({term,course});
    if(state.delayCourse===course)await new Promise(resolve=>setTimeout(resolve,state.delayMs));
    if(state.failCourse===course)return route.fulfill({status:503,json:{message:'Course source is temporarily unavailable.'}});
    const now=new Date().toISOString(),base=course==='CS3520'?17250:17206;
    const sections:Seat[]=state.emptyCourse===course?[]:[0,1].map(index=>({id:`banner:${term}:${base+index}`,source:'banner',term,crn:String(base+index),code:course,title:course==='CS3520'?'Programming in C++':'Program Design and Implementation',sectionNumber:`0${index+1}`,instructor:'Fixture instructor',meetingSummary:'Mon · Wed 14:50–16:30',capacity:100,available:course==='CS3520'?0:2+index,checkedAt:now,lastAttemptAt:now,errorMessage:null}));
    return route.fulfill({json:{sections,truncated:false,fetchedAt:now}});
  });
  return state;
}
async function openAssistant(page:Page){
  await page.goto(home);await expect(page.locator('.seat-card')).toHaveCount(2);
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/AI assistant/}).click();
  await expect(page.getByRole('heading',{name:'AI assistant.'})).toBeVisible();
}
async function ask(page:Page,text:string){
  const before=await page.locator('.assistant-reply').count();
  await page.getByLabel('Ask in English or 中文').fill(text);
  await page.getByRole('button',{name:'Send ↗',exact:true}).click();
  await expect(page.locator('.assistant-thinking')).toHaveCount(0);
  if(before<10)await expect(page.locator('.assistant-reply')).toHaveCount(before+1);
  return page.locator('.assistant-reply').last();
}

test('bilingual questions use observed seats and explicit Track saves a watch; navigating preserves chat',async({page},info)=>{
  const state=await fixture(page);await openAssistant(page);
  await expect(page.getByText('Local intent recognition · 本地意图识别 · 非通用大模型')).toBeVisible();
  let reply=await ask(page,'Does CS3100 have available seats?');
  await expect(reply.locator('.seat-card')).toHaveCount(2);
  await expect(reply.locator('.seat-card').filter({hasText:'CRN 17206'}).locator('.seat-count strong')).toHaveText('2');
  await expect(reply.locator('.seat-card').filter({hasText:'CRN 17207'}).locator('.seat-count strong')).toHaveText('3');
  await expect(reply.locator('.checked').first()).toContainText('Checked');
  await expect(reply.locator('.assistant-sources a')).toHaveAttribute('href',/^https:\/\/nubanner\.neu\.edu\//);
  await expect(reply.locator('.assistant-sources')).toContainText('Queried');
  reply=await ask(page,'比较 CS3100 和 CS3520');
  await expect(reply.locator('.seat-card')).toHaveCount(4);
  expect((await reply.locator('.course-code').allTextContents()).sort()).toEqual(['CS3100','CS3100','CS3520','CS3520']);
  expect(state.searches.some(query=>query.course==='CS3520'&&query.term==='202710')).toBeTruthy();
  await page.getByRole('button',{name:'My watchlist'}).click();
  await expect(page.getByRole('heading',{name:'Your next semester starts here'})).toBeVisible();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/AI assistant/}).click();
  await expect(page.locator('.assistant-reply')).toHaveCount(2);
  await page.locator('.assistant-reply').last().getByRole('button',{name:'Track this section'}).first().click();
  await expect(page.locator('.assistant-reply').last().getByRole('button',{name:'In your watchlist'})).toHaveCount(1);
  await page.getByRole('button',{name:'My watchlist'}).click();await expect(page.locator('.seat-card:visible')).toHaveCount(1);
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/AI assistant/}).click();
  reply=await ask(page,'我的关注');await expect(reply.locator('.seat-card')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:`test-results/assistant-${info.project.name}.png`,fullPage:true});
});

test('unpublished Spring 2027 never silently searches Fall; failed and empty lookups do not invent zero seats',async({page})=>{
  const state=await fixture(page);await openAssistant(page);const before=state.searches.length;
  let reply=await ask(page,'Does CS3100 have seats in Spring 2027?');
  await expect(reply).toContainText(/Spring 2027/);
  await expect(reply.locator('.seat-card')).toHaveCount(0);
  expect(state.searches).toHaveLength(before);
  await page.getByRole('button',{name:'Clear chat',exact:true}).click();
  state.failCourse='CS3520';reply=await ask(page,'CS3520 有空位吗？');
  await expect(reply.locator('.seat-card')).toHaveCount(0);
  await expect(reply).toContainText(/失败|无法|暂时|不可用/);
  await expect(reply).not.toContainText(/0 available|0 个空位|0个空位/);
  state.failCourse='';state.emptyCourse='CS3520';reply=await ask(page,'Show CS3520 sections');
  await expect(reply.locator('.seat-card')).toHaveCount(0);
  await expect(reply).toContainText(/no sections|not find|not found|0 sections/i);
});

test('chat is bounded and refresh clears it; question text is rendered literally',async({page})=>{
  await fixture(page);await openAssistant(page);
  await ask(page,'<img src=x onerror="window.badChat=true"> How do notifications work?');
  await expect(page.locator('.assistant-question .assistant-message-text')).toContainText('<img src=x');
  expect(await page.evaluate(()=>('badChat' in window))).toBeFalsy();
  await expect(page.locator('.assistant-question img')).toHaveCount(0);
  for(let index=0;index<10;index++)await ask(page,'How do notifications work?');
  await expect(page.locator('.assistant-message')).toHaveCount(20);
  await expect(page.getByText('Only the most recent 20 messages are kept in this chat.')).toBeVisible();
  await page.reload();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/AI assistant/}).click();
  await expect(page.locator('.assistant-message')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Which course is on your mind?'})).toBeVisible();
});

test('clearing a pending lookup keeps the conversation empty when its response arrives',async({page})=>{
  const state=await fixture(page);await openAssistant(page);state.delayCourse='CS3520';state.delayMs=800;
  await page.getByLabel('Ask in English or 中文').fill('Does CS3520 have seats?');
  const response=page.waitForResponse(url=>url.url().includes('/api/catalog/sections')&&url.url().includes('CS3520'));
  await page.getByRole('button',{name:'Send ↗',exact:true}).click();
  await expect(page.locator('.assistant-thinking')).toBeVisible();
  await page.getByRole('button',{name:'Clear chat',exact:true}).click();
  await (await response).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.locator('.assistant-message')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Which course is on your mind?'})).toBeVisible();
});

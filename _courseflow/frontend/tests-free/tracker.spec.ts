import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import type {Seat} from '../src/api';

const home='/portfolio/courseflow/';
async function fixture(page:Page){
  const state={count:0,failing:false,calls:0,delay:false};
  await page.route('https://api.courseflow.test/api/**',async route=>{
    expect(route.request().headers()['cookie']).toBeUndefined();
    const url=new URL(route.request().url());
    if(url.pathname==='/api/status')return route.fulfill({json:{demo:false,source:'banner',pollSeconds:300,staleSeconds:900,lastPoll:null,officialUrl:'https://nubanner.neu.edu',version:'0.2.0'}});
    if(url.pathname==='/api/catalog/terms')return route.fulfill({json:[{code:'202710',description:'Fall 2026'}]});
    expect(url.pathname).toBe('/api/catalog/sections');state.calls++;
    if(state.delay)await new Promise(resolve=>setTimeout(resolve,250));
    if(state.failing)return route.fulfill({status:503,json:{message:'Course source is temporarily unavailable.'}});
    const now=new Date().toISOString();
    const sections:Seat[]=[17206,17207,17208].map((crn,index)=>({id:`banner:202710:${crn}`,source:'banner',term:'202710',crn:String(crn),code:'CS3100',title:'Program Design and Implementation',sectionNumber:`0${index+1}`,instructor:'Instructor',meetingSummary:'Mon · Wed 14:50–16:30',capacity:100,available:state.count,checkedAt:now,lastAttemptAt:now,errorMessage:null}));
    return route.fulfill({json:{sections,truncated:false,fetchedAt:now}});
  });
  return state;
}
async function watchFirst(page:Page){await page.goto(home);await expect(page.locator('.seat-card')).toHaveCount(3);await page.getByRole('button',{name:'Track this section'}).first().click();await expect(page.getByRole('button',{name:'In your watchlist'})).toHaveCount(1);await page.getByRole('button',{name:'My watchlist'}).click();}

test('anonymous tracking persists, deduplicates course polling, and alerts only on fresh threshold transitions',async({page},info)=>{
  const state=await fixture(page);await page.goto(home);
  await expect(page.locator('.seat-card')).toHaveCount(3);
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toHaveCount(0);
  await expect(page.getByText('Free · No account needed')).toBeVisible();
  await page.getByRole('button',{name:'Track this section'}).first().click();
  await expect(page.getByRole('button',{name:'In your watchlist'})).toHaveCount(1);
  await page.getByRole('button',{name:'Track this section'}).first().click();
  await expect(page.getByRole('button',{name:'In your watchlist'})).toHaveCount(2);
  await page.getByRole('button',{name:'My watchlist'}).click();
  const previous=state.calls;state.count=2;
  await page.getByRole('button',{name:'Check seats now'}).click();
  await expect(page.locator('.seat-count strong')).toHaveText(['2','2']);
  expect(state.calls-previous).toBe(1);
  await page.getByRole('button',{name:'Check seats now'}).click();
  await expect(page.getByRole('button',{name:'Check seats now'})).toBeEnabled();
  await page.getByRole('button',{name:/Alerts/}).click();await expect(page.locator('.notice')).toHaveCount(2);
  await expect(page.getByText('In-app + optional device notifications')).toBeVisible();
  await page.getByRole('button',{name:'My watchlist'}).click();state.failing=true;
  await page.getByRole('button',{name:'Check seats now'}).click();
  await expect(page.locator('.seat-count strong')).toHaveText(['—','—']);
  await expect(page.locator('.stale-note').first()).toContainText('Last known: 2 seats.');
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/Explore courses/}).click();
  await expect(page.locator('.seat-count strong').first()).toHaveText('—');
  await expect(page.locator('.stale-note').first()).toContainText('Last known: 2 seats.');
  await page.getByRole('button',{name:'My watchlist'}).click();
  state.failing=false;await page.getByRole('button',{name:'Check seats now'}).click();
  await expect(page.locator('.seat-count strong')).toHaveText(['2','2']);
  await page.getByRole('button',{name:/Alerts/}).click();await expect(page.locator('.notice')).toHaveCount(2);
  await page.getByRole('button',{name:'Mark all as read'}).click();await expect(page.getByRole('heading',{name:'0 unread'})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'My watchlist'}).click();await expect(page.locator('.seat-card')).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:`test-results/free-${info.project.name}.png`,fullPage:true});
});

test('fresh anonymous visitors are isolated and JSON import rechecks the source instead of trusting counts',async({page,browser})=>{
  await fixture(page);await watchFirst(page);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export watchlist'}).click();
  const download=await downloadPromise;const text=await readFile((await download.path())!,'utf8');
  const backup=JSON.parse(text);expect(backup.watches).toEqual([{term:'202710',code:'CS3100',crn:'17206',threshold:1,enabled:true}]);
  backup.watches[0].available=999;backup.watches[0].section={available:999};
  const other=await browser.newContext(),otherPage=await other.newPage();const state=await fixture(otherPage);state.count=0;
  await otherPage.goto(`http://127.0.0.1:4190${home}`);await otherPage.getByRole('button',{name:'My watchlist'}).click();
  await expect(otherPage.getByRole('heading',{name:'Your next semester starts here'})).toBeVisible();
  expect(await other.cookies()).toEqual([]);
  await otherPage.getByLabel('Import watchlist file').setInputFiles({name:'watchlist.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(otherPage.locator('.seat-card')).toHaveCount(1);await expect(otherPage.locator('.seat-count strong')).toHaveText('0');
  await otherPage.getByRole('button',{name:/Alerts/}).click();await expect(otherPage.locator('.notice')).toHaveCount(0);
  await other.close();
});

test('invalid backups are rejected, blocked storage is explicit, and the in-memory watchlist still works',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(Storage.prototype,'getItem',{value(){throw new DOMException('Blocked','SecurityError');}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw new DOMException('Blocked','SecurityError');}});});
  await fixture(page);await watchFirst(page);
  await expect(page.locator('.seat-card')).toHaveCount(1);await expect(page.locator('.storage-warning')).toContainText('saved only in memory');
  await page.getByLabel('Import watchlist file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"format":"courseflow-watchlist","version":1,"watches":[{"term":"202710","code":"CS3100","crn":"17206","threshold":0,"enabled":true}]}')});
  await expect(page.getByRole('alert')).toContainText('not a valid CourseFlow watchlist');await expect(page.locator('.seat-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Pause',exact:true}).click();await expect(page.getByText('Paused',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Remove',exact:true}).click();await expect(page.getByRole('heading',{name:'Your next semester starts here'})).toBeVisible();
});

test('five-minute checks pause while hidden and resume on returning to the page',async({page})=>{
  await page.clock.install();
  const state=await fixture(page);await watchFirst(page);const calls=state.calls;
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.runFor(300001);
  expect(state.calls).toBe(calls);
  state.count=3;
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('.seat-count strong')).toHaveText('3');
  expect(state.calls).toBe(calls+1);
});

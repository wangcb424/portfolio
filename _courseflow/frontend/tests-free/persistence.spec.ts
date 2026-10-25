import {test,expect,type Page,type BrowserContext} from '@playwright/test';

const home='/portfolio/courseflow/';
async function fixture(context:BrowserContext){
  const state={seats:2,calls:[] as string[],terms:[{code:'202710',description:'Fall 2026'},{code:'202730',description:'Spring 2027'}],fail:false};
  await context.route('https://api.courseflow.test/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/status')return route.fulfill({json:{demo:false,source:'banner',pollSeconds:300,staleSeconds:900,lastPoll:null,officialUrl:'https://nubanner.neu.edu',version:'test'}});
    if(url.pathname==='/api/catalog/terms')return route.fulfill({json:state.terms});
    const term=url.searchParams.get('term'),code=url.searchParams.get('q');state.calls.push(`${term}:${code}`);
    if(state.fail)return route.fulfill({status:503,json:{message:'Source unavailable'}});
    const now=new Date().toISOString();
    return route.fulfill({json:{sections:[{id:`banner:${term}:17206`,source:'banner',term,crn:'17206',code,title:'Course',sectionNumber:'01',instructor:'Instructor',meetingSummary:'Mon 10:00',capacity:30,available:state.seats,checkedAt:now,lastAttemptAt:now,errorMessage:null}],truncated:false,fetchedAt:now}});
  });
  return state;
}
async function search(page:Page,code:string,term='202710'){
  await page.getByRole('combobox',{name:/^Term/}).selectOption(term);
  await page.getByRole('textbox',{name:'Course code'}).fill(code);
  await page.getByRole('button',{name:'Find sections'}).click();
  await expect(page.getByRole('button',{name:'Find sections'})).toBeEnabled();
}
test('closing and reopening restores the last search and watchlist, with fresh seat checks',async({page,context},testInfo)=>{
  const state=await fixture(context);await page.goto(home);
  await expect(page.locator('.seat-card:visible')).toHaveCount(1);
  await page.getByRole('button',{name:'Track this section'}).click();
  await search(page,'cs 3520','202730');
  await page.close();state.seats=7;
  const reopened=await context.newPage();await reopened.goto(home);
  await expect(reopened.getByRole('textbox',{name:'Course code'})).toHaveValue('CS3520');
  await expect(reopened.getByRole('combobox',{name:/^Term/})).toHaveValue('202730');
  await expect(reopened.locator('.seat-count strong:visible')).toHaveText('7');
  expect(await reopened.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await reopened.screenshot({path:testInfo.outputPath('returning-search.png'),fullPage:true});
  await reopened.getByRole('button',{name:'Open saved watchlist'}).click();
  await expect(reopened.locator('.seat-count strong:visible')).toHaveText('7');
  await reopened.getByRole('button',{name:'Pause',exact:true}).click();
  await reopened.close();state.seats=9;
  const again=await context.newPage();await again.goto(home);
  await expect(again.getByRole('heading',{name:'My watchlist.'})).toBeVisible();
  await expect(again.getByText('Paused',{exact:true})).toBeVisible();
  await expect(again.locator('.seat-count strong:visible')).toHaveText('7');
  expect(await again.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('history deduplicates per term, retries fresh, clears persistently, and leaves watches intact',async({page,context})=>{
  const state=await fixture(context);await page.goto(home);await page.getByRole('button',{name:'Track this section'}).click();
  await search(page,'CS3100');await search(page,'cs 3100');
  await expect(page.locator('.recent-search-list li')).toHaveCount(1);
  await search(page,'CS3100','202730');await expect(page.locator('.recent-search-list li')).toHaveCount(2);
  state.seats=6;await page.getByRole('button',{name:'Search again: CS3100, Fall 2026'}).click();
  await expect(page.locator('.seat-count strong:visible')).toHaveText('6');
  await page.getByRole('button',{name:'Remove search CS3100 202730'}).click();
  await expect(page.locator('.recent-search-list li')).toHaveCount(1);
  await page.getByRole('button',{name:'Clear search history'}).click();await page.reload();
  await expect(page.locator('.recent-search-list li')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Open saved watchlist (1)'})).toBeVisible();
  state.fail=true;await search(page,'CS3520');await expect(page.getByRole('alert')).toContainText('Source unavailable');
  await expect(page.locator('.recent-search-list li')).toHaveCount(1);
});
test('a saved unpublished term is never replaced by the newest term',async({page,context})=>{
  const state=await fixture(context);await page.goto(home);await search(page,'CS3520','202730');
  state.terms=state.terms.slice(0,1);const count=state.calls.length;
  await page.reload();await expect(page.getByRole('alert')).toContainText('no other term was searched');
  await expect(page.getByRole('combobox',{name:/^Term/})).toHaveValue('202730');
  await expect(page.getByRole('button',{name:'Find sections'})).toBeDisabled();
  await page.getByRole('button',{name:'Search again: CS3520, Spring 2027'}).click();
  expect(state.calls.length).toBe(count);
});
test('v1 watch storage migrates without loss and history is bounded to 20 entries',async({page,context})=>{
  await fixture(context);await page.goto(home);await page.getByRole('button',{name:'Track this section'}).click();
  await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('courseflow.free.v1')!);delete state.searches;delete state.lastPage;localStorage.setItem('courseflow.free.v1',JSON.stringify(state));});
  await page.reload();await expect(page.getByRole('button',{name:'Open saved watchlist (1)'})).toBeVisible();
  for(let i=1000;i<1022;i++)await search(page,`CS${i}`);
  await expect(page.locator('.recent-search-list li')).toHaveCount(20);
  await expect(page.locator('.recent-search-list li').first()).toContainText('CS1021');
  await expect(page.getByRole('button',{name:'Search again: CS1000, Fall 2026'})).toHaveCount(0);
});
test('backups include searches and import restores them without trusting old seat data',async({page,context,browser})=>{
  await fixture(context);await page.goto(home);await search(page,'CS3520','202730');
  await page.getByRole('button',{name:'Track this section'}).click();
  const backup=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('courseflow.free.v1')!);return {format:'courseflow-watchlist',version:2,watches:s.watches.map((w:any)=>({term:w.section.term,code:w.section.code,crn:w.section.crn,threshold:w.threshold,enabled:w.enabled,available:999})),searches:s.searches};});
  const other=await browser.newContext({baseURL:'http://127.0.0.1:4190'});const state=await fixture(other);state.seats=4;
  const fresh=await other.newPage();await fresh.goto(home);await fresh.getByRole('button',{name:'My watchlist'}).click();
  await fresh.getByLabel('Import watchlist file').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(fresh.locator('.seat-count strong:visible')).toHaveText('4');
  await fresh.getByRole('navigation').getByRole('button',{name:'Explore courses'}).click();
  await expect(fresh.getByRole('button',{name:'Search again: CS3520, Spring 2027'})).toBeVisible();
  await other.close();
});

import {test,expect} from '@playwright/test';

test('optional AWS backup is explicit, uses a private key, and restores fresh counts',async({page})=>{
  let backup:any=null,version=0,cloudCalls=0,key='';
  await page.route('**/backup',async route=>{
    cloudCalls++;const request=route.request();
    expect(request.headers()['cookie']).toBeUndefined();
    expect(request.headers()['authorization']).toMatch(/^Bearer [0-9a-f]{64}$/);
    if(!key)key=request.headers()['authorization'];else expect(request.headers()['authorization']).toBe(key);
    if(request.method()==='PUT'){
      expect(request.headers()['if-match']).toBe(String(version));backup=request.postDataJSON();version++;
      expect(backup.watches[0].available).toBeUndefined();
      expect(JSON.stringify(backup)).not.toContain(key);
      return route.fulfill({json:{version}});
    }
    if(request.method()==='DELETE'){backup=null;version=0;return route.fulfill({json:{deleted:true}});}
    return route.fulfill({json:{version,backup}});
  });
  await page.route('https://api.courseflow.test/api/**',async route=>{
    const url=new URL(route.request().url());
    expect(route.request().headers()['authorization']).toBeUndefined();
    if(url.pathname==='/api/status')return route.fulfill({json:{demo:false,source:'banner',pollSeconds:300,staleSeconds:900,lastPoll:null,officialUrl:'https://nubanner.neu.edu',version:'test'}});
    if(url.pathname==='/api/catalog/terms')return route.fulfill({json:[{code:'202710',description:'Fall 2026'}]});
    const now=new Date().toISOString();return route.fulfill({json:{sections:[{id:'banner:202710:17206',source:'banner',term:'202710',crn:'17206',code:'CS3100',title:'Course',sectionNumber:'01',instructor:'Instructor',meetingSummary:'Mon',capacity:30,available:5,checkedAt:now,lastAttemptAt:now,errorMessage:null}],truncated:false,fetchedAt:now}});
  });
  await page.goto('/portfolio/courseflow/');await page.getByRole('button',{name:'Find sections'}).click();
  await page.getByRole('button',{name:'Track this section'}).click();
  await page.getByRole('button',{name:'My watchlist'}).click();
  expect(cloudCalls).toBe(0);
  await page.getByRole('button',{name:'Save cloud backup'}).click();
  await expect(page.getByText('Saved to AWS. Local data is also retained.')).toBeVisible();
  expect(backup.searches[0].code).toBe('CS3100');
  await page.getByRole('button',{name:'Remove',exact:true}).click();
  await page.getByRole('button',{name:'Restore cloud backup'}).click();
  await expect(page.locator('.seat-count strong:visible')).toHaveText('5');
  await page.getByRole('button',{name:'Delete cloud backup'}).click();
  await expect(page.getByText('Cloud backup deleted. Local watches and searches were kept.')).toBeVisible();
  await expect(page.locator('.seat-count strong:visible')).toHaveText('5');
  expect(backup).toBeNull();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

import {test,expect} from '@playwright/test';

const home='/portfolio/courseflow/';

test.beforeEach(async({page,request})=>{
  await request.post('/__test__/network?offline=false');
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/auth/me')return route.fulfill({json:{signedIn:false}});
    if(path==='/api/status')return route.fulfill({json:{demo:true,source:'demo',pollSeconds:300,staleSeconds:900,lastPoll:null,officialUrl:'https://nubanner.neu.edu',version:'0.2.0'}});
    if(path==='/api/catalog/terms')return route.fulfill({json:[{code:'202710',description:'Fall 2026'}]});
    if(path==='/api/catalog/sections')return route.fulfill({json:{sections:[],truncated:false,fetchedAt:new Date().toISOString()}});
    return route.fulfill({status:404,json:{message:'No static-hosting test fixture for this endpoint.'}});
  });
});

test('assets, brand navigation, and install manifest stay under the Pages project path',async({page,request})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(home);
  await expect(page.getByRole('link',{name:'CourseFlow home'})).toHaveAttribute('href',home);
  await expect(page.getByRole('button',{name:'Find sections'})).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href',`${home}manifest.webmanifest`);
  const manifestUrl=new URL(`${home}manifest.webmanifest`,page.url());
  const manifest=await(await request.get(manifestUrl.href)).json();
  expect(new URL(manifest.start_url,manifestUrl).pathname).toBe(home);
  expect(new URL(manifest.scope,manifestUrl).pathname).toBe(home);
  for(const icon of manifest.icons){
    const url=new URL(icon.src,manifestUrl);
    expect(url.pathname.startsWith(home)).toBeTruthy();
    expect((await request.get(url.href)).ok()).toBeTruthy();
  }
  await page.getByRole('link',{name:'CourseFlow home'}).click();
  await expect(page).toHaveURL(new RegExp(`${home}$`));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

test.afterEach(async({request})=>{await request.post('/__test__/network?offline=false');});

test('scoped PWA offline fallback preserves styling, retry URL, and unrelated portfolio caches',async({page,context,request})=>{
  await page.goto(home);
  await page.evaluate(()=>caches.open('portfolio-unrelated-test').then(cache=>cache.put('/portfolio/example',new Response('keep'))));
  const scope=await page.evaluate(()=>navigator.serviceWorker.ready.then(registration=>registration.scope));
  expect(new URL(scope).pathname).toBe(home);
  await page.reload();
  await expect(page.getByRole('button',{name:'Find sections'})).toBeVisible();
  expect(await page.evaluate(()=>caches.has('portfolio-unrelated-test'))).toBeTruthy();
  await request.post('/__test__/network?offline=true');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading',{name:'You’re offline.'})).toBeVisible();
  expect(await page.getByRole('link',{name:'Try again →'}).evaluate(link=>(link as HTMLAnchorElement).pathname)).toBe(home);
  expect(await page.locator('img').evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBe(192);
  expect(await page.evaluate(()=>Array.from(document.styleSheets).some(sheet=>sheet.href?.endsWith('/portfolio/courseflow/offline.css')))).toBeTruthy();
  await context.setOffline(false);
  await request.post('/__test__/network?offline=false');
  await page.getByRole('link',{name:'Try again →'}).click();
  await expect(page.getByRole('button',{name:'Find sections'})).toBeVisible();
});

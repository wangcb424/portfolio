import {test,expect,type Page,type BrowserContext} from '@playwright/test';

async function uiLogin(page:Page,email:string){
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button',{name:'Send sign-in code'}).click();
  await expect(page.locator('.demo-code strong')).toBeVisible();
  const code=await page.locator('.demo-code strong').innerText();
  await page.getByLabel('Sign-in code',{exact:true}).fill(code);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.locator('.email-label')).toHaveText(email);
}
async function apiLogin(context:BrowserContext,email:string){
  const base='http://127.0.0.1:4187/api/auth';
  const token=await (await context.request.get(base+'/csrf')).json();
  const headers={[token.headerName]:token.token};
  const code=await (await context.request.post(base+'/request-code',{headers,data:{email}})).json();
  expect((await context.request.post(base+'/verify',{headers,data:{email,code:code.demoCode}})).ok()).toBeTruthy();
}

test('search, sign in, watch, change seats, read alert, and check history',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('.seat-card')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:`../docs/preview-${info.project.name}.png`,fullPage:true});
  await uiLogin(page,`ui-${info.project.name}-${Date.now()}@example.test`);
  if(info.project.name==='mobile'){
    await page.getByLabel('Course code',{exact:true}).fill('CS3000');
    await page.getByRole('button',{name:'Find sections'}).click();
    await expect(page.locator('.course-code').first()).toHaveText('CS3000');
  }
  await page.getByRole('button',{name:'Track this section'}).first().click();
  await expect(page.getByRole('button',{name:'In your watchlist'})).toBeVisible();
  await page.getByRole('button',{name:'My watchlist'}).click();
  await expect(page.locator('.seat-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Open 2 seats'}).click();
  await expect(page.locator('.seat-count strong')).toHaveText('2');
  await page.getByRole('button',{name:'History',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Seat history'})).toBeVisible();
  await expect(page.locator('.history-panel tbody tr')).toHaveCount(2);
  await page.getByRole('button',{name:'Close history'}).click();
  await page.getByRole('button',{name:/Alerts/}).click();
  await expect(page.locator('.notice')).toHaveCount(1);
  await expect(page.locator('.notice small')).toContainText('simulated');
  await page.getByRole('button',{name:'Mark all as read'}).click();
  await expect(page.getByRole('heading',{name:'0 unread'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('the same email sees its watchlist on a second device',async({browser,page},info)=>{
  const email=`sync-${info.project.name}-${Date.now()}@example.test`;
  await page.goto('/');await uiLogin(page,email);
  await page.getByRole('button',{name:'Track this section'}).first().click();
  await expect(page.getByRole('button',{name:'In your watchlist'})).toBeVisible();
  const other=await browser.newContext();
  await apiLogin(other,email);const otherPage=await other.newPage();await otherPage.goto('http://127.0.0.1:4187');
  await expect(otherPage.locator('.email-label')).toHaveText(email);
  await otherPage.getByRole('button',{name:'My watchlist'}).click();
  await expect(otherPage.locator('.seat-card')).toHaveCount(1);await other.close();
});

test('PWA installs a service worker and shows an honest offline fallback',async({page,context})=>{
  await page.goto('/');await expect(page.locator('.seat-card')).toHaveCount(3);
  await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
  await page.reload();await expect(page.locator('.seat-card')).toHaveCount(3);
  await context.setOffline(true);await page.reload();
  await expect(page.getByRole('heading',{name:'You’re offline.'})).toBeVisible();
  await context.setOffline(false);
});

import {test,expect,type Page} from '@playwright/test';
import type {Seat,Watch,Notice} from '../src/api';

// Explicitly simulated HTTP responses for frontend interaction checks only.
async function fixture(page:Page,stale=false){
  const stamp=new Date(stale?Date.now()-3600000:Date.now()).toISOString();
  const seats:Seat[]=[0,6,0].map((available,i)=>({id:`demo:202710:DEMO-3100${i+1}`,source:'demo',term:'202710',crn:`DEMO-3100${i+1}`,code:'CS3100',title:'Program Design and Implementation',sectionNumber:`0${i+1}`,instructor:'Demo instructor',meetingSummary:'Mon · Wed 14:50–16:30',capacity:100,available,checkedAt:stamp,lastAttemptAt:stamp,errorMessage:null}));
  let signedIn=false;let email='';let watches:Watch[]=[];let notices:Notice[]=[];
  const rows=[{available:0,capacity:100,checkedAt:stamp}];
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(4),method=req.method();
    const data=req.postDataJSON()||{};let body:unknown;
    if(path==='/status')body={demo:true,source:'demo',pollSeconds:300,staleSeconds:900,lastPoll:stamp,officialUrl:'https://nubanner.neu.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search',version:'0.2.0'};
    else if(path==='/auth/me')body={signedIn,email};
    else if(path==='/auth/csrf')body={headerName:'X-CSRF-TOKEN',token:'fixture-only'};
    else if(path==='/auth/request-code'){email=data.email;body={message:'Demo code created.',demoCode:'123456'};}
    else if(path==='/auth/verify'){signedIn=true;body={signedIn,email};}
    else if(path==='/auth/logout'){signedIn=false;body={};}
    else if(path==='/catalog/terms')body=[{code:'202710',description:'Fall 2026'}];
    else if(path==='/catalog/sections')body={sections:seats,truncated:false,fetchedAt:stamp};
    else if(path==='/watchlist'&&method==='GET')body=watches;
    else if(path==='/watchlist'&&method==='POST'){
      const seat=seats.find(s=>s.id===data.sectionId)!;
      watches=[{id:'watch-1',sectionId:seat.id,threshold:1,enabled:true,matched:false,section:{...seat}}];body=watches[0];
    }else if(path==='/watchlist/watch-1'&&method==='PATCH'){
      Object.assign(watches[0],data);body={};
    }else if(path==='/watchlist/watch-1'&&method==='DELETE'){watches=[];body={};}
    else if(path==='/notifications')body=notices;
    else if(path==='/notifications/read'){notices.forEach(n=>n.readAt=new Date().toISOString());body={};}
    else if(path.startsWith('/history/'))body=rows;
    else if(path==='/demo/seats'){
      const now=new Date().toISOString();Object.assign(watches[0].section,{available:data.available,checkedAt:now});
      rows.push({available:data.available,capacity:100,checkedAt:now});
      notices=[{id:'notice-1',sectionId:watches[0].sectionId,body:'CS3100 · CRN DEMO-31001 has 2 available seat(s).',createdAt:now,readAt:null,delivery:'SIMULATED',attempts:0}];body={};
    }else if(path==='/push/config')body={enabled:false,publicKey:''};
    else {await route.fulfill({status:404,json:{message:`Missing UI fixture: ${method} ${path}`}});return;}
    await route.fulfill({status:200,json:body});
  });
}

test('desktop/mobile: sign in, track, inspect history and alerts, pause and remove',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await fixture(page);await page.goto('/');
  await expect(page.locator('.seat-card')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:`../docs/preview-${info.project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByLabel('Email address').fill('demo@example.test');
  await page.getByRole('button',{name:'Send sign-in code'}).click();
  await page.getByLabel('Sign-in code',{exact:true}).fill('123456');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.locator('.email-label')).toHaveText('demo@example.test');
  await page.getByRole('button',{name:'Track this section'}).first().click();
  await expect(page.getByRole('button',{name:'In your watchlist'})).toBeVisible();
  await page.getByRole('button',{name:'My watchlist'}).click();
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
  await page.getByRole('button',{name:'My watchlist'}).click();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await expect(page.getByText('Paused',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Remove',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your next semester starts here'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('old observations are shown as unknown, with the last known value labeled',async({page})=>{
  await fixture(page,true);await page.goto('/');
  await expect(page.locator('.seat-card')).toHaveCount(3);
  await expect(page.locator('.seat-count strong').first()).toHaveText('—');
  await expect(page.getByText('Needs update',{exact:true})).toHaveCount(3);
  await expect(page.locator('.stale-note').nth(1)).toContainText('Last known: 6 seats.');
});

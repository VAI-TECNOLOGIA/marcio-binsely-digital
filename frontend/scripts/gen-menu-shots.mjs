import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const BASE='https://app.marciobinsely.site';
const EMAIL='revisor.google@marciobinsely.site', PASSWORD='RevG00gle!MBD2026#rs';
const TW=1290,TH=2796,LW=430,LH=932;
const RAW='ios-assets/screenshots/raw',FIN='ios-assets/screenshots/final';
async function shot(p,name){const raw=`${RAW}/${name}.png`;await p.screenshot({path:raw,fullPage:false});execSync(`sips -s format png -z ${TH} ${TW} "${raw}" --out "${FIN}/${name}.png"`,{stdio:'ignore'});console.log('OK '+name);}
(async()=>{
 mkdirSync(RAW,{recursive:true});mkdirSync(FIN,{recursive:true});
 const b=await chromium.launch();
 const c=await b.newContext({viewport:{width:LW,height:LH},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
 const p=await c.newPage();
 // public midia-kit (no login)
 try{await p.goto(`${BASE}/midia-kit`,{waitUntil:'networkidle',timeout:30000});await p.waitForTimeout(2500);await shot(p,'13-midiakit');}catch(e){console.log('ERR midiakit '+e.message);}
 // login then open menu and click Mapa
 await p.goto(`${BASE}/login`,{waitUntil:'networkidle'});
 await p.locator('input[type=email]').first().fill(EMAIL);
 await p.locator('input[type=password]').first().fill(PASSWORD);
 await p.locator('button[type=submit]').first().click();
 await p.waitForTimeout(3500);
 // open hamburger
 try{
   const burger=p.locator('button').filter({hasText:''}).first();
   // click menu button (top-left hamburger) - try aria/first button in header
   const btns=p.locator('header button, .topbar button, button');
   await btns.first().click({timeout:5000}).catch(()=>{});
   await p.waitForTimeout(800);
   const mapa=p.getByRole('link',{name:/mapa/i}).first();
   if(await mapa.count()){await mapa.click();await p.waitForTimeout(3000);await shot(p,'14-mapa-menu');}
   else console.log('no mapa link in menu');
 }catch(e){console.log('ERR mapa-menu '+e.message);}
 await b.close();
})();

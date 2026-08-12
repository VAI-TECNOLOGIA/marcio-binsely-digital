import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const BASE='https://app.marciobinsely.site';
const EMAIL='revisor.google@marciobinsely.site', PASSWORD='RevG00gle!MBD2026#rs';
const TW=1290,TH=2796,LW=430,LH=932;
const SCREENS=[
 {route:'/relatorios',name:'07-relatorios'},
 {route:'/conversas',name:'08-conversas'},
 {route:'/tarefas',name:'09-tarefas'},
 {route:'/demandas',name:'10-demandas'},
 {route:'/voluntarios',name:'11-voluntarios'},
 {route:'/acoes',name:'12-acoes'},
];
const RAW='ios-assets/screenshots/raw',FIN='ios-assets/screenshots/final';
(async()=>{
 mkdirSync(RAW,{recursive:true});mkdirSync(FIN,{recursive:true});
 const b=await chromium.launch();
 const c=await b.newContext({viewport:{width:LW,height:LH},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
 const p=await c.newPage();
 await p.goto(`${BASE}/login`,{waitUntil:'networkidle'});
 await p.locator('input[type=email]').first().fill(EMAIL);
 await p.locator('input[type=password]').first().fill(PASSWORD);
 await p.locator('button[type=submit]').first().click();
 await p.waitForTimeout(3500);
 for(const {route,name} of SCREENS){
  try{
   await p.goto(`${BASE}${route}`,{waitUntil:'networkidle',timeout:30000});
   await p.waitForTimeout(1800);
   if(/\/login/.test(p.url())){console.log(`SKIP ${name}`);continue;}
   const raw=`${RAW}/${name}.png`;
   await p.screenshot({path:raw,fullPage:false});
   execSync(`sips -s format png -z ${TH} ${TW} "${raw}" --out "${FIN}/${name}.png"`,{stdio:'ignore'});
   console.log(`OK ${name}`);
  }catch(e){console.log(`ERR ${name}: ${e.message}`);}
 }
 await b.close();
})();

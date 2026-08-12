// Gera screenshots iOS 6.7" (1290x2796) capturando o app de produção em
// modo servidor (https://app.marciobinsely.site), logando com a conta de teste.
// Usa o Playwright já instalado no projeto.
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const BASE = 'https://app.marciobinsely.site';
const EMAIL = 'revisor.google@marciobinsely.site';
const PASSWORD = 'RevG00gle!MBD2026#rs';

const TARGET_W = 1290;
const TARGET_H = 2796;
const LOGICAL_W = 430;
const LOGICAL_H = 932;

// Rotas candidatas (nome do arquivo -> rota). Capturamos o que renderizar bem.
const SCREENS = [
  { route: '/',          name: '01-home' },
  { route: '/mapa',      name: '02-mapa' },
  { route: '/agenda',    name: '03-agenda' },
  { route: '/apoiadores',name: '04-apoiadores' },
  { route: '/mural',     name: '05-mural' },
  { route: '/materiais', name: '06-materiais' },
];

const OUT_RAW = 'ios-assets/screenshots/raw';
const OUT_FINAL = 'ios-assets/screenshots/final';

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  const email = page.locator('input[type=email]');
  if (await email.count()) {
    await email.first().fill(EMAIL);
    await page.locator('input[type=password]').first().fill(PASSWORD);
    await page.locator('button[type=submit]').first().click();
    await page.waitForTimeout(3500);
  }
}

(async () => {
  mkdirSync(OUT_RAW, { recursive: true });
  mkdirSync(OUT_FINAL, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: LOGICAL_W, height: LOGICAL_H },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();

  await login(page);

  const captured = [];
  for (const { route, name } of SCREENS) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1800);
      const finalUrl = page.url();
      // pula se foi redirecionado pro login (rota exigiu auth e sessão caiu)
      if (/\/login/.test(finalUrl) && route !== '/login') {
        console.log(`SKIP ${name} (redirect -> ${finalUrl})`);
        continue;
      }
      const raw = `${OUT_RAW}/${name}.png`;
      await page.screenshot({ path: raw, fullPage: false });
      const final = `${OUT_FINAL}/${name}.png`;
      execSync(`sips -s format png -z ${TARGET_H} ${TARGET_W} "${raw}" --out "${final}"`, { stdio: 'ignore' });
      captured.push(name);
      console.log(`OK ${name} <- ${route}`);
    } catch (e) {
      console.log(`ERR ${name}: ${e.message}`);
    }
  }

  await browser.close();
  console.log(`\nCaptured ${captured.length}: ${captured.join(', ')}`);
})();

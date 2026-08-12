/**
 * Captura os prints reais do sistema para o Manual.
 * Login genuíno pelo formulário (conta de prints dedicada) — nada de injeção de token.
 * Uso: node capture.cjs [apenas-um-arquivo-opcional]
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'https://app.marciobinsely.site';
const EMAIL = 'manual.prints@marciobinsely.site';
const PASS = 'ManualPrints2026!';
const OUT = path.join(__dirname, 'prints');

// wait = espera extra pós-networkidle (ms). click = abre modal/painel antes do print.
const PLANO = [
  // ---- Públicas (sem login) ----
  { path: '/login', file: '01-login', public: true },
  { path: '/esqueci-senha', file: '02-esqueci-senha', public: true },
  { path: '/redefinir-senha?token=exemplo', file: '03-redefinir-senha', public: true },
  { path: '/lp', file: '04-landing', public: true, wait: 3000 },
  { path: '/cadastro', file: '05-cadastro-publico', public: true, fullPage: true, wait: 1500 },
  // ---- Sistema (login) ----
  { path: '/', file: '10-dashboard', wait: 3000 },
  { path: '/mapa', file: '11-mapa', wait: 4500 },
  { path: '/relatorios', file: '12-relatorios', wait: 3000 },
  { path: '/apoiadores', file: '13-apoiadores', wait: 2500 },
  { path: '/apoiadores', file: '13b-apoiadores-novo', wait: 2000, click: 'text=Novo cadastro', after: 1000 },
  // rola o modal até o checklist "Tipo de apoio" (recurso novo — precisa aparecer)
  { path: '/apoiadores', file: '13c-apoiadores-tipo-apoio', wait: 2000, click: 'text=Novo cadastro', after: 800, scroll: [1000, 600, 800] },
  { path: '/voluntarios', file: '14-voluntarios', wait: 2500 },
  { path: '/suspeitos', file: '15-suspeitos', wait: 1500 },
  { path: '/blacklist', file: '16-blacklist', wait: 1500 },
  { path: '/mural', file: '17-mural', wait: 1500 },
  { path: '/midia-kit', file: '18-midia-kit', wait: 2000 },
  { path: '/tarefas', file: '19-engajamento', wait: 1500 },
  { path: '/acoes', file: '20-acoes-rua', wait: 1500 },
  { path: '/agenda', file: '21-agenda', wait: 1500 },
  { path: '/materiais', file: '22-materiais', wait: 1500 },
  { path: '/faixas', file: '23-faixas', wait: 1500 },
  { path: '/conversas', file: '24-conversas', wait: 2500, click: '.convo-item', after: 1200, clickOptional: true },
  { path: '/demandas', file: '25-demandas', wait: 2000 },
  { path: '/demandas', file: '25b-demanda-editar', wait: 2000, click: 'button[title="Editar demanda"]', after: 1000, clickOptional: true },
  { path: '/disparos', file: '26-disparos', wait: 2000 },
  { path: '/disparos', file: '26b-disparos-nova', wait: 2000, click: 'text=Nova campanha', after: 1500 },
  { path: '/automacoes', file: '27-automacoes', wait: 1500 },
  { path: '/usuarios', file: '28-usuarios', wait: 1500 },
  { path: '/usuarios', file: '28b-usuarios-acesso', wait: 1500, click: 'button[title="Copiar acesso para enviar"]', after: 1000 },
  { path: '/configuracoes', file: '29-configuracoes', wait: 1500 },
  { path: '/painel-tv', file: '30-painel-tv', wait: 4000 },
];

(async () => {
  const only = process.argv[2] || null;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  let logged = false;
  const falhas = [];

  for (const item of PLANO) {
    if (only && item.file !== only) continue;
    try {
      if (!item.public && !logged) {
        await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
        await page.fill('input[type="email"]', EMAIL);
        await page.fill('input[type="password"]', PASS);
        await page.click('button:has-text("Entrar")');
        await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
        await page.waitForTimeout(1500);
        logged = true;
        console.log('[ok] login');
      }
      await page.goto(`${BASE}${item.path}`, { waitUntil: 'networkidle', timeout: 45000 });
      if (item.wait) await page.waitForTimeout(item.wait);
      if (item.click) {
        try {
          await page.locator(item.click).first().click({ timeout: 6000 });
          if (item.after) await page.waitForTimeout(item.after);
        } catch (e) {
          if (!item.clickOptional) throw e;
          console.log(`[aviso] click opcional falhou em ${item.file}: ${item.click}`);
        }
      }
      if (item.scroll) {
        await page.mouse.move(item.scroll[0], item.scroll[1]);
        await page.mouse.wheel(0, item.scroll[2]);
        await page.waitForTimeout(600);
      }
      await page.screenshot({ path: path.join(OUT, `${item.file}.png`), fullPage: !!item.fullPage });
      console.log(`[ok] ${item.file}`);
      // fecha modal aberto para não vazar pro próximo print
      if (item.click) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    } catch (e) {
      falhas.push(item.file);
      console.log(`[FALHA] ${item.file}: ${e.message.split('\n')[0]}`);
    }
  }

  await browser.close();
  console.log(falhas.length ? `\nFALHAS: ${falhas.join(', ')}` : '\nTODAS AS CAPTURAS OK');
  process.exit(falhas.length ? 1 : 0);
})();

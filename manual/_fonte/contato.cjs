const { chromium } = require('playwright');
const fs = require('fs');
const files = fs.readdirSync('pv').filter(f => f.endsWith('.png')).sort();
const html = `<!DOCTYPE html><html><head><style>
body{margin:0;background:#666;font-family:sans-serif}
.g{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:6px}
.c{position:relative}
.c img{width:100%;display:block;outline:1px solid #333}
.c span{position:absolute;top:2px;left:2px;background:#000;color:#ff0;font-size:11px;padding:1px 4px}
</style></head><body><div class="g">${files.map((f,i)=>`<div class="c"><img src="pv/${f}"><span>${i+1}</span></div>`).join('')}</div></body></html>`;
fs.writeFileSync('contato.html', html);
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1800, height: 400 } });
  await pg.goto('file://' + __dirname + '/contato.html');
  await pg.waitForTimeout(600);
  await pg.screenshot({ path: 'contato.png', fullPage: true });
  await b.close();
  console.log('contato.png ok');
})();

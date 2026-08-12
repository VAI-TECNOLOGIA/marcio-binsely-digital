import env from './src/config/env.js';
const WABA = env.whatsapp.wabaId, TOKEN = env.whatsapp.token;
const names = ['cadastro_aprovado', 'recuperar_senha'];
try {
  const r = await fetch(`https://graph.facebook.com/v20.0/${WABA}/message_templates?fields=name,status&limit=80`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const d = await r.json();
  const byName = Object.fromEntries((d.data || []).filter((t) => names.includes(t.name)).map((t) => [t.name, t.status]));
  const statuses = names.map((n) => `${n}=${byName[n] || '?'}`).join(' ');
  if (names.some((n) => byName[n] === 'REJECTED')) console.log('REJECTED ' + statuses);
  else if (names.every((n) => byName[n] === 'APPROVED')) console.log('APPROVED ' + statuses);
  else console.log('PENDING ' + statuses);
} catch (e) {
  console.log('ERR ' + (e.message || 'fetch'));
}
process.exit(0);

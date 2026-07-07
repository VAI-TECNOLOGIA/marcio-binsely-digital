// Seed prod-safe (idempotente, SEM dados fake de apoiador/voluntário).
// Cria referência (perfis, regiões POA, cidades RS, tarefas, materiais),
// settings da campanha e o usuário admin. Roda LOCAL contra o banco de prod:
//   APP_DATABASE_URL=... APP_DIRECT_URL=... node prisma/seed-prod.mjs
import { PrismaClient } from '../src/generated/prisma/index.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const prisma = new PrismaClient();
const ADMIN_EMAIL = 'admin@marciobinsely.com';

async function main() {
  const out = { roles: 0, regions: 0, cities: 0, tasks: 0, materials: 0, settings: 0, admin: null };

  // 1) Perfis
  const roleData = [
    { key: 'LIDER', name: 'Líder de Campanha', description: 'Acesso total à plataforma.', permissions: ['*'] },
    { key: 'MEMBRO', name: 'Membro da Equipe', description: 'Equipe interna.', permissions: ['supporters', 'volunteers', 'notices', 'actions', 'events', 'media-kit', 'conversations', 'demands', 'materials'] },
    { key: 'PARCEIRO', name: 'Parceiro', description: 'Apoiador externo.', permissions: ['media-kit:read', 'tasks:self', 'materials:request', 'agenda:read'] },
  ];
  for (const r of roleData) { await prisma.role.upsert({ where: { key: r.key }, update: { name: r.name, description: r.description, permissions: r.permissions }, create: r }); out.roles++; }

  // 2) Regiões de Porto Alegre
  const regionsSpec = [
    { name: 'Centro', color: '#003E9D' },
    { name: 'Zona Norte', color: '#2BB153' },
    { name: 'Zona Sul', color: '#FEC330' },
    { name: 'Zona Leste', color: '#F3083E' },
    { name: 'Extremo Sul', color: '#0A326B' },
    { name: 'Região Metropolitana', color: '#6D28D9' },
  ];
  const regions = {};
  for (const r of regionsSpec) { regions[r.name] = await prisma.region.upsert({ where: { name: r.name }, update: { color: r.color, uf: 'RS' }, create: { ...r, uf: 'RS' } }); out.regions++; }

  // 3) Cidades RS
  const citySpec = [
    ['Porto Alegre', 'Centro'], ['Canoas', 'Região Metropolitana'], ['Gravataí', 'Região Metropolitana'],
    ['Viamão', 'Região Metropolitana'], ['Alvorada', 'Região Metropolitana'], ['Cachoeirinha', 'Região Metropolitana'],
    ['São Leopoldo', 'Região Metropolitana'], ['Novo Hamburgo', 'Região Metropolitana'], ['Esteio', 'Região Metropolitana'],
    ['Sapucaia do Sul', 'Região Metropolitana'], ['Guaíba', 'Região Metropolitana'], ['Eldorado do Sul', 'Região Metropolitana'],
  ];
  for (const [name, regionName] of citySpec) {
    const exists = await prisma.city.findFirst({ where: { name, uf: 'RS' } });
    if (!exists) { await prisma.city.create({ data: { name, uf: 'RS', regionId: regions[regionName].id } }); out.cities++; }
  }

  // 4) Tarefas de engajamento
  const taskSpec = [
    { type: 'POST_INSTAGRAM', title: 'Publiquei no Instagram', points: 15 },
    { type: 'POST_FACEBOOK', title: 'Publiquei no Facebook', points: 15 },
    { type: 'SHARE_WHATSAPP', title: 'Compartilhei no WhatsApp', points: 10 },
    { type: 'CAMINHADA', title: 'Participei da caminhada', points: 30 },
    { type: 'FAIXA', title: 'Coloquei faixa', points: 25 },
    { type: 'ADESIVOS', title: 'Entreguei adesivos', points: 20 },
    { type: 'CONVIDAR', title: 'Convidei pessoas', points: 10 },
    { type: 'EVENTO', title: 'Compareci ao evento', points: 25 },
  ];
  for (const t of taskSpec) { const e = await prisma.task.findFirst({ where: { title: t.title, volunteerId: null } }); if (!e) { await prisma.task.create({ data: t }); out.tasks++; } }

  // 5) Materiais (estoque 0 — cliente preenche)
  const materialSpec = [
    { name: 'Faixa 3x1m', category: 'Faixa', unit: 'un', stock: 0 },
    { name: 'Bandeira', category: 'Bandeira', unit: 'un', stock: 0 },
    { name: 'Adesivo de Carro', category: 'Adesivo', unit: 'un', stock: 0 },
    { name: 'Santinho', category: 'Santinho', unit: 'pacote', stock: 0 },
    { name: 'Camiseta', category: 'Camiseta', unit: 'un', stock: 0 },
    { name: 'Boné', category: 'Boné', unit: 'un', stock: 0 },
  ];
  for (const m of materialSpec) { const e = await prisma.material.findFirst({ where: { name: m.name } }); if (!e) { await prisma.material.create({ data: m }); out.materials++; } }

  // 6) Settings — número da urna VAZIO (ainda não definido)
  const settings = [
    { key: 'campaign', value: { name: 'Márcio Binsely Digital', candidate: 'Márcio Bins Ely', office: 'Vereador de Porto Alegre', party: 'PDT', number: '', city: 'Porto Alegre', uf: 'RS', slogan: 'Juntos por Porto Alegre' } },
    { key: 'theme', value: { brand: '#003E9D', accent: '#FEC330', green: '#2BB153', red: '#F3083E' } },
    { key: 'goals', value: { volunteers: 500, supporters: 5000, banners: 300, actions: 100 } },
  ];
  for (const s of settings) { await prisma.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: s }); out.settings++; }

  // 7) Admin
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!existing) {
    const pass = 'MB' + crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12) + '!';
    const u = await prisma.user.create({ data: { name: 'Administrador', email: ADMIN_EMAIL, password: bcrypt.hashSync(pass, 10), role: 'LIDER', phone: '5551999999999', active: true } });
    out.admin = { email: u.email, password: pass };
  } else {
    out.admin = { email: existing.email, password: '(já existia — inalterada)' };
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error('SEED ERRO:', e.message); process.exit(1); }).finally(() => prisma.$disconnect());

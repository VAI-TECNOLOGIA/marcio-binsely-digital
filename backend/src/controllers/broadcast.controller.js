import { z } from 'zod';
import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { sendWhatsApp, getTemplate } from '../services/whatsapp.service.js';
import { CHANNELS } from '../utils/enums.js';
import {
  DECL_TEXTO,
  DECL_VERSION,
  fonesBloqueados,
  hashConteudo,
  hashLista,
  montarComponentesTemplate,
  montarPublico,
  nucleoFone,
  pacoteCreditos,
  processarLote,
} from '../services/broadcast.service.js';

// ============================================================
//  Módulo de Campanhas — disparo pela API Oficial.
//  Fluxo: criar -> montar público (segmentos da base + números
//  colados) -> escolher template/mensagem -> aceitar a
//  declaração de conformidade -> enviar agora ou agendar.
// ============================================================

const declSelect = {
  declAcceptedAt: true, declUserName: true, declVersion: true, declListCount: true,
};

export const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  const busca = (req.query.search || '').trim();
  if (busca) {
    where.OR = [
      { name: { contains: busca, mode: 'insensitive' } },
      { message: { contains: busca, mode: 'insensitive' } },
      { templateName: { contains: busca, mode: 'insensitive' } },
    ];
  }
  const data = await prisma.broadcastCampaign.findMany({
    where,
    include: { owner: { select: { id: true, name: true } }, _count: { select: { contacts: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data });
});

export const get = asyncHandler(async (req, res) => {
  const c = await prisma.broadcastCampaign.findUnique({
    where: { id: req.params.id },
    include: { contacts: { take: 200, orderBy: { createdAt: 'asc' } }, owner: { select: { id: true, name: true } } },
  });
  if (!c) throw new AppError('Campanha não encontrada', 404);
  res.json(c);
});

const schema = z.object({
  name: z.string().min(2),
  message: z.string().optional().default(''),
  channel: z.enum(CHANNELS).optional(),
  scheduledAt: z.string().nullable().optional(),
  templateName: z.string().nullable().optional(),
  templateLang: z.string().nullable().optional(),
  headerImageUrl: z.string().nullable().optional(),
  varsJson: z.array(z.object({ source: z.string(), value: z.string().optional() })).nullable().optional(),
});

export const create = asyncHandler(async (req, res) => {
  const data = schema.parse(req.body);
  if (!data.templateName && (!data.message || data.message.trim().length < 2)) {
    throw new AppError('Escolha um template aprovado ou escreva a mensagem.', 400);
  }
  const c = await prisma.broadcastCampaign.create({
    data: {
      name: data.name,
      message: data.message || '',
      channel: data.channel || 'WHATSAPP',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      status: data.scheduledAt ? 'AGENDADA' : 'RASCUNHO',
      templateName: data.templateName || null,
      templateLang: data.templateLang || 'pt_BR',
      headerImageUrl: data.headerImageUrl || null,
      varsJson: data.varsJson ?? undefined,
      ownerId: req.user?.id,
    },
  });
  await audit({ userId: req.user?.id, action: 'CREATE', entity: 'BroadcastCampaign', entityId: c.id, ip: req.ip });
  res.status(201).json(c);
});

/** Edita a campanha (rascunho/agendada). Mudou conteúdo => exige nova declaração. */
export const update = asyncHandler(async (req, res) => {
  const atual = await prisma.broadcastCampaign.findUnique({ where: { id: req.params.id } });
  if (!atual) throw new AppError('Campanha não encontrada', 404);
  if (['ENVIANDO', 'CONCLUIDA', 'CANCELADA'].includes(atual.status)) {
    throw new AppError('Campanha em envio ou encerrada não pode ser editada.', 409);
  }
  const data = schema.partial().parse(req.body);
  const c = await prisma.broadcastCampaign.update({
    where: { id: atual.id },
    data: {
      ...(data.name != null ? { name: data.name } : {}),
      ...(data.message != null ? { message: data.message } : {}),
      ...(data.templateName !== undefined ? { templateName: data.templateName || null } : {}),
      ...(data.templateLang !== undefined ? { templateLang: data.templateLang || 'pt_BR' } : {}),
      ...(data.headerImageUrl !== undefined ? { headerImageUrl: data.headerImageUrl || null } : {}),
      ...(data.varsJson !== undefined ? { varsJson: data.varsJson } : {}),
      ...(data.scheduledAt !== undefined
        ? { scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null, status: data.scheduledAt ? 'AGENDADA' : 'RASCUNHO' }
        : {}),
      // Qualquer edição invalida o aceite anterior (conteúdo/condições mudaram).
      declAcceptedAt: null, declUserId: null, declUserName: null, declIp: null,
      declVersion: null, declListCount: null, declListHash: null, declContentHash: null,
    },
  });
  res.json(c);
});

/** Opções para montar o público: cidades, bairros e status com contagens. */
export const audienciaOpcoes = asyncHandler(async (_req, res) => {
  const comFone = { OR: [{ whatsapp: { not: null } }, { phone: { not: null } }] };
  const [cidades, bairros, statuses, voluntarios] = await Promise.all([
    prisma.supporter.groupBy({ by: ['cityName'], where: { ...comFone, cityName: { not: null } }, _count: { _all: true }, orderBy: { _count: { cityName: 'desc' } }, take: 80 }),
    prisma.supporter.groupBy({ by: ['neighborhood'], where: { ...comFone, neighborhood: { not: null } }, _count: { _all: true }, orderBy: { _count: { neighborhood: 'desc' } }, take: 80 }),
    prisma.supporter.groupBy({ by: ['status'], where: comFone, _count: { _all: true } }),
    prisma.volunteer.count({ where: { active: true } }),
  ]);
  res.json({
    cidades: cidades.map((c) => ({ value: c.cityName, count: c._count._all })),
    bairros: bairros.map((b) => ({ value: b.neighborhood, count: b._count._all })),
    statuses: statuses.map((s) => ({ value: s.status, count: s._count._all })),
    voluntariosAtivos: voluntarios,
  });
});

const audienciaSchema = z.object({
  filtros: z.object({
    usarBase: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    cities: z.array(z.string()).optional(),
    neighborhoods: z.array(z.string()).optional(),
    statuses: z.array(z.string()).optional(),
    apenasVoluntarios: z.boolean().optional(),
  }).optional().default({}),
  colados: z.string().optional().default(''),
  replace: z.boolean().optional().default(false),
});

/** Prévia do público (contagens) sem gravar nada. */
export const audienciaPreview = asyncHandler(async (req, res) => {
  const { filtros, colados } = audienciaSchema.parse(req.body);
  const campaignId = req.params.id || null;
  const { stats } = await montarPublico({ campaignId, filtros, colados });
  res.json(stats);
});

/** Aplica o público na campanha (grava contatos). Lista nova => nova declaração. */
export const aplicarAudiencia = asyncHandler(async (req, res) => {
  const { filtros, colados, replace } = audienciaSchema.parse(req.body);
  const campaignId = req.params.id;
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError('Campanha não encontrada', 404);
  if (['ENVIANDO', 'CONCLUIDA', 'CANCELADA'].includes(campaign.status)) {
    throw new AppError('Campanha em envio ou encerrada não aceita mudança de público.', 409);
  }

  if (replace) {
    if (campaign.sentCount > 0) throw new AppError('Campanha já teve envios — não é possível substituir o público. Duplique a campanha.', 409);
    await prisma.broadcastContact.deleteMany({ where: { campaignId } });
  }

  const { finais, stats } = await montarPublico({ campaignId, filtros, colados });
  if (finais.length) {
    await prisma.broadcastContact.createMany({ data: finais.map((f) => ({ campaignId, ...f })) });
  }

  const total = await prisma.broadcastContact.count({ where: { campaignId } });
  const pendentes = await prisma.broadcastContact.count({ where: { campaignId, status: 'PENDENTE' } });
  await prisma.broadcastCampaign.update({
    where: { id: campaignId },
    data: {
      totalContacts: total,
      pendingCount: pendentes,
      audienceJson: { filtros, coladosQtd: stats.colados },
      declAcceptedAt: null, declUserId: null, declUserName: null, declIp: null,
      declVersion: null, declListCount: null, declListHash: null, declContentHash: null,
    },
  });
  await audit({ userId: req.user?.id, action: 'AUDIENCIA', entity: 'BroadcastCampaign', entityId: campaignId, ip: req.ip, changes: { ...stats, replace } });
  res.status(201).json({ ...stats, totalCampanha: total });
});

/** Import legado por CSV (nome,telefone,cidade,bairro). Também invalida o aceite. */
export const importContacts = asyncHandler(async (req, res) => {
  const { contacts, csv } = req.body;
  let rows = [];
  if (Array.isArray(contacts)) rows = contacts;
  else if (typeof csv === 'string') rows = parseCsv(csv);
  else throw new AppError('Envie "contacts" (array) ou "csv" (string).', 400);

  const campaignId = req.params.id;
  const comFone = rows.filter((r) => r.telefone || r.phone);
  const bloqueados = await fonesBloqueados();
  const valid = comFone.filter((r) => !bloqueados.has(nucleoFone(r.telefone || r.phone)));
  const skippedBlacklist = comFone.length - valid.length;
  await prisma.broadcastContact.createMany({
    data: valid.map((r) => ({
      campaignId,
      name: r.nome || r.name || '',
      phone: String(r.telefone || r.phone),
      cityName: r.cidade || r.cityName || null,
      neighborhood: r.bairro || r.neighborhood || null,
      responsible: r.responsavel || r.responsible || null,
      source: 'CSV',
    })),
  });

  const total = await prisma.broadcastContact.count({ where: { campaignId } });
  await prisma.broadcastCampaign.update({
    where: { id: campaignId },
    data: {
      totalContacts: total, pendingCount: total,
      declAcceptedAt: null, declUserId: null, declUserName: null, declIp: null,
      declVersion: null, declListCount: null, declListHash: null, declContentHash: null,
    },
  });
  res.status(201).json({ imported: valid.length, skippedBlacklist, total });
});

/** Texto vigente da declaração (o front exibe exatamente este texto). */
export const declaracaoTexto = asyncHandler(async (_req, res) => {
  res.json({ version: DECL_VERSION, texto: DECL_TEXTO });
});

/**
 * Aceite da declaração de conformidade — SEMPRE por ação ativa do usuário
 * (checkbox não pré-marcado no front). Registra usuário, data/hora, IP,
 * versão, contagem e hashes de lista e conteúdo; tudo vai para a auditoria.
 */
export const aceitarDeclaracao = asyncHandler(async (req, res) => {
  const { aceito } = z.object({ aceito: z.literal(true) }).parse(req.body);
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) throw new AppError('Campanha não encontrada', 404);
  if (!campaign.templateName && !(campaign.message || '').trim()) throw new AppError('Defina o template ou a mensagem antes da declaração.', 400);

  const contatos = await prisma.broadcastContact.findMany({ where: { campaignId: campaign.id }, select: { phone: true } });
  if (!contatos.length) throw new AppError('Monte o público antes de aceitar a declaração.', 400);

  const listHash = hashLista(contatos.map((c) => nucleoFone(c.phone)));
  const contentHash = hashConteudo(campaign);
  const c = await prisma.broadcastCampaign.update({
    where: { id: campaign.id },
    data: {
      declAcceptedAt: new Date(),
      declUserId: req.user?.id || null,
      declUserName: req.user?.name || null,
      declIp: req.ip || null,
      declVersion: DECL_VERSION,
      declListCount: contatos.length,
      declListHash: listHash,
      declContentHash: contentHash,
    },
    select: { id: true, ...declSelect },
  });
  await audit({
    userId: req.user?.id, action: 'DECLARACAO_CAMPANHA', entity: 'BroadcastCampaign', entityId: campaign.id, ip: req.ip,
    changes: { aceito, version: DECL_VERSION, texto: DECL_TEXTO, listCount: contatos.length, listHash, contentHash, template: campaign.templateName, scheduledAt: campaign.scheduledAt },
  });
  res.json(c);
});

/** Situação do pacote de créditos (saldo, validade, consumo). */
export const creditosStatus = asyncHandler(async (_req, res) => {
  const { pkg, ativo, expirado, saldo, diasRestantes } = await pacoteCreditos();
  res.json({
    ativo, expirado, saldo, diasRestantes,
    total: pkg?.total || 0, usado: pkg?.used || 0,
    label: pkg?.label || null, activatedAt: pkg?.activatedAt || null, expiresAt: pkg?.expiresAt || null,
  });
});

/** Ativa o pacote contratado (80.000 créditos · 120 dias). Só LIDER; um por vez. */
export const creditosAtivar = asyncHandler(async (req, res) => {
  const { total, label } = z.object({ total: z.number().int().positive().default(80000), label: z.string().optional() }).parse(req.body || {});
  const { pkg, expirado, saldo } = await pacoteCreditos();
  if (pkg && !expirado && saldo > 0) throw new AppError('Já existe um pacote ativo com saldo. Consuma ou aguarde expirar.', 409);
  const expiresAt = new Date(Date.now() + 120 * 86400000);
  const novo = await prisma.creditPackage.create({
    data: { label: label || `Pacote ${total.toLocaleString('pt-BR')} mensagens`, total, expiresAt, createdById: req.user?.id || null },
  });
  await audit({ userId: req.user?.id, action: 'CREDITOS_ATIVADOS', entity: 'CreditPackage', entityId: novo.id, ip: req.ip, changes: { total, expiresAt } });
  res.status(201).json(novo);
});

/** Envio em lotes (o front repete até done). Todas as travas ficam no service. */
export const send = asyncHandler(async (req, res) => {
  const r = await processarLote(req.params.id, { batch: 25 });
  if (r.blocked) throw new AppError(r.motivo, 409);
  res.status(202).json(r);
});

/** Teste real para um número (consome 1 crédito). Não mexe nos contatos. */
export const teste = asyncHandler(async (req, res) => {
  const { phone } = z.object({ phone: z.string().min(8) }).parse(req.body);
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) throw new AppError('Campanha não encontrada', 404);

  const { pkg, expirado, saldo } = await pacoteCreditos();
  if (!pkg || expirado || saldo <= 0) throw new AppError('Sem créditos disponíveis para o teste.', 409);

  const exemplo = (await prisma.broadcastContact.findFirst({ where: { campaignId: campaign.id } })) ||
    { name: 'Teste', cityName: 'Porto Alegre', neighborhood: 'Centro', responsible: null };

  let result;
  if (campaign.templateName) {
    const tpl = await getTemplate(campaign.templateName);
    if (!tpl) throw new AppError(`Template "${campaign.templateName}" não encontrado/aprovado.`, 400);
    result = await sendWhatsApp({
      to: phone,
      template: { name: tpl.name, language: { code: campaign.templateLang || tpl.language || 'pt_BR' }, components: montarComponentesTemplate(tpl, campaign, exemplo) },
    });
  } else {
    result = await sendWhatsApp({ to: phone, body: campaign.message });
  }
  if (result?.success === false) throw new AppError(`A Meta recusou o teste: ${result.error}`, 400);
  await prisma.creditPackage.update({ where: { id: pkg.id }, data: { used: { increment: 1 } } });
  await audit({ userId: req.user?.id, action: 'TESTE_CAMPANHA', entity: 'BroadcastCampaign', entityId: campaign.id, ip: req.ip, changes: { phone: nucleoFone(phone) } });
  res.json({ ok: true, id: result.id });
});

/** Pausa o envio. */
export const pause = asyncHandler(async (req, res) => {
  const c = await prisma.broadcastCampaign.update({ where: { id: req.params.id }, data: { status: 'PAUSADA' } });
  res.json({ ok: true, status: c.status });
});

/** Retoma campanha pausada (volta a ENVIANDO — o cron/loop continua). */
export const resume = asyncHandler(async (req, res) => {
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) throw new AppError('Campanha não encontrada', 404);
  if (!campaign.declAcceptedAt) throw new AppError('Aceite a declaração de conformidade antes de retomar.', 409);
  const pendentes = await prisma.broadcastContact.count({ where: { campaignId: campaign.id, status: 'PENDENTE' } });
  const c = await prisma.broadcastCampaign.update({
    where: { id: campaign.id },
    data: { status: pendentes > 0 ? 'ENVIANDO' : 'CONCLUIDA', pendingCount: pendentes },
  });
  res.json({ ok: true, status: c.status, pendentes });
});

/** Duplica campanha (conteúdo + público; zera envio e declaração). */
export const duplicate = asyncHandler(async (req, res) => {
  const orig = await prisma.broadcastCampaign.findUnique({ where: { id: req.params.id }, include: { contacts: true } });
  if (!orig) throw new AppError('Campanha não encontrada', 404);
  const bloqueados = await fonesBloqueados();
  const contatos = orig.contacts.filter((c) => !bloqueados.has(nucleoFone(c.phone)));
  const nova = await prisma.broadcastCampaign.create({
    data: {
      name: `${orig.name} (cópia)`,
      message: orig.message,
      channel: orig.channel,
      templateName: orig.templateName,
      templateLang: orig.templateLang,
      headerImageUrl: orig.headerImageUrl,
      varsJson: orig.varsJson ?? undefined,
      audienceJson: orig.audienceJson ?? undefined,
      status: 'RASCUNHO',
      totalContacts: contatos.length,
      pendingCount: contatos.length,
      ownerId: req.user?.id,
    },
  });
  if (contatos.length) {
    await prisma.broadcastContact.createMany({
      data: contatos.map((c) => ({
        campaignId: nova.id, name: c.name, phone: c.phone, cityName: c.cityName,
        neighborhood: c.neighborhood, responsible: c.responsible, supporterId: c.supporterId, source: c.source,
      })),
    });
  }
  res.status(201).json(nova);
});

/** Contatos da campanha com paginação/filtro; format=csv exporta tudo. */
export const contacts = asyncHandler(async (req, res) => {
  const campaignId = req.params.id;
  const where = { campaignId };
  if (req.query.status) where.status = req.query.status;

  if (req.query.format === 'csv') {
    const rows = await prisma.broadcastContact.findMany({ where, orderBy: { createdAt: 'asc' } });
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['nome,telefone,cidade,bairro,origem,status,erro,enviado_em,entregue_em,lido_em']
      .concat(rows.map((c) => [c.name, c.phone, c.cityName, c.neighborhood, c.source, c.status, c.error, c.sentAt?.toISOString(), c.deliveredAt?.toISOString(), c.readAt?.toISOString()].map(esc).join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="campanha-${campaignId}.csv"`);
    return res.send('\uFEFF' + csv);
  }

  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const take = Math.min(100, Math.max(10, parseInt(req.query.take || '50', 10)));
  const [total, data] = await Promise.all([
    prisma.broadcastContact.count({ where }),
    prisma.broadcastContact.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (page - 1) * take, take }),
  ]);
  res.json({ total, page, take, data });
});

export const remove = asyncHandler(async (req, res) => {
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) throw new AppError('Campanha não encontrada', 404);
  if (campaign.status === 'ENVIANDO') throw new AppError('Pause a campanha antes de excluir.', 409);
  await prisma.broadcastCampaign.delete({ where: { id: campaign.id } });
  await audit({ userId: req.user?.id, action: 'DELETE', entity: 'BroadcastCampaign', entityId: campaign.id, ip: req.ip });
  res.status(204).send();
});

function parseCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines.shift().split(',').map((h) => h.trim().toLowerCase());
  return lines.map((line) => {
    const cells = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cells[i] || '').trim();
    });
    return obj;
  });
}

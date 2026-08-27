import { z } from 'zod';
import prisma from '../config/prisma.js';
import { Prisma as PrismaNS } from '../generated/prisma/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { sendWhatsApp, getTemplate } from '../services/whatsapp.service.js';
import { CHANNELS } from '../utils/enums.js';
import {
  DECL_TEXTO,
  DECL_VERSION,
  diaHojeBR,
  fonesBloqueados,
  hashConteudo,
  hashLista,
  montarComponentesTemplate,
  montarPublico,
  nucleoFone,
  pacoteCreditos,
  poolNumeros,
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
  // API Oficial: campanha SEMPRE usa modelo aprovado — mensagem livre só entrega
  // na janela de 24h e não serve para disparo em massa.
  if (!data.templateName) {
    throw new AppError('Campanha usa somente modelo aprovado pela Meta. Escolha um template.', 400);
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
      autorizada: false, autorizacaoSolicitada: false, autorizadaPorId: null, autorizadaEm: null,
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
      autorizada: false, autorizacaoSolicitada: false, autorizadaPorId: null, autorizadaEm: null,
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
      autorizada: false, autorizacaoSolicitada: false, autorizadaPorId: null, autorizadaEm: null,
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
  if (!campaign.templateName) throw new AppError('Escolha o modelo aprovado antes da declaração.', 400);

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

/**
 * Solicita autorização para enviar/agendar. Se quem solicita PODE autorizar
 * (dono/VAI), a campanha já sai liberada; senão fica aguardando a liberação.
 * Exige declaração aceita antes (a trava de conformidade continua valendo).
 */
export const solicitarAutorizacao = asyncHandler(async (req, res) => {
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) throw new AppError('Campanha não encontrada', 404);
  if (!campaign.declAcceptedAt) throw new AppError('Aceite a declaração de conformidade antes de solicitar o envio.', 409);
  if (campaign.autorizada) return res.json({ autorizada: true, aguardando: false });

  const podeAutorizar = req.user?.podeAutorizar === true;
  const dados = {
    autorizacaoSolicitada: true,
    solicitadaPorId: req.user?.id || null,
    solicitadaEm: new Date(),
  };
  if (podeAutorizar) {
    // Quem pode autorizar libera na hora (não pede pra si mesmo).
    dados.autorizada = true;
    dados.autorizadaPorId = req.user?.id || null;
    dados.autorizadaEm = new Date();
    // "Enviar agora" (sem agendamento) entra em ENVIANDO — o cron dispara.
    if (!campaign.scheduledAt && campaign.status !== 'ENVIANDO') dados.status = 'ENVIANDO';
  }
  const c = await prisma.broadcastCampaign.update({ where: { id: campaign.id }, data: dados });
  await audit({ userId: req.user?.id, action: podeAutorizar ? 'CAMPANHA_AUTORIZADA' : 'CAMPANHA_SOLICITADA', entity: 'BroadcastCampaign', entityId: campaign.id, ip: req.ip });
  res.json({ autorizada: c.autorizada, aguardando: c.autorizacaoSolicitada && !c.autorizada, autoLiberada: podeAutorizar });
});

/** Libera a campanha para envio. Só quem tem podeAutorizar (o dono/VAI). */
export const autorizar = asyncHandler(async (req, res) => {
  if (req.user?.podeAutorizar !== true) throw new AppError('Você não tem permissão para autorizar campanhas.', 403);
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) throw new AppError('Campanha não encontrada', 404);
  if (!campaign.declAcceptedAt) throw new AppError('A campanha ainda não tem a declaração aceita.', 409);
  const c = await prisma.broadcastCampaign.update({
    where: { id: campaign.id },
    data: {
      autorizada: true,
      autorizacaoSolicitada: true,
      autorizadaPorId: req.user?.id || null,
      autorizadaEm: new Date(),
      autorizacaoNota: null,
      // Sem agendamento, libera direto para envio (o cron dispara em ~1 min).
      ...(!campaign.scheduledAt && !['CONCLUIDA', 'CANCELADA'].includes(campaign.status) ? { status: 'ENVIANDO' } : {}),
    },
  });
  await audit({ userId: req.user?.id, action: 'CAMPANHA_AUTORIZADA', entity: 'BroadcastCampaign', entityId: campaign.id, ip: req.ip });
  res.json({ ok: true, autorizada: true, status: c.status });
});

/** Recusa a autorização (volta a rascunho). Só quem tem podeAutorizar. */
export const recusarAutorizacao = asyncHandler(async (req, res) => {
  if (req.user?.podeAutorizar !== true) throw new AppError('Você não tem permissão para autorizar campanhas.', 403);
  const { nota } = z.object({ nota: z.string().max(300).optional().default('') }).parse(req.body || {});
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) throw new AppError('Campanha não encontrada', 404);
  const c = await prisma.broadcastCampaign.update({
    where: { id: campaign.id },
    data: { autorizada: false, autorizacaoSolicitada: false, autorizacaoNota: nota || null, status: 'RASCUNHO' },
  });
  await audit({ userId: req.user?.id, action: 'CAMPANHA_RECUSADA', entity: 'BroadcastCampaign', entityId: campaign.id, ip: req.ip, changes: { nota } });
  res.json({ ok: true, status: c.status });
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

/**
 * Extrato de envios — monitoramento linha a linha cruzando as campanhas.
 * Cada linha: quando saiu, por qual número, e o recebimento (entregue/lida)
 * confirmado pelo webhook da Meta. Filtros: campanha, status, número, busca
 * e período. format=csv exporta o extrato filtrado completo.
 */
export const extrato = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.kind) where.kind = String(req.query.kind);
  if (req.query.campaignId) where.refId = String(req.query.campaignId);
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.sender) where.senderPhoneId = String(req.query.sender);
  const busca = String(req.query.search || '').trim();
  if (busca) {
    const digitos = busca.replace(/\D/g, '');
    where.OR = [
      { toName: { contains: busca, mode: 'insensitive' } },
      ...(digitos ? [{ to: { contains: digitos } }] : []),
    ];
  }
  if (req.query.de || req.query.ate) {
    where.sentAt = {};
    if (req.query.de) where.sentAt.gte = new Date(`${req.query.de}T00:00:00-03:00`);
    if (req.query.ate) where.sentAt.lte = new Date(`${req.query.ate}T23:59:59-03:00`);
  }

  // Totais em destaque (mesmos filtros da listagem).
  const porStatus = await prisma.messageLog.groupBy({ by: ['status'], where, _count: { _all: true } });
  const resumo = Object.fromEntries(porStatus.map((x) => [x.status, x._count._all]));
  const total = porStatus.reduce((acc, x) => acc + x._count._all, 0);

  // Envios e recebimentos POR DIA (fuso de Brasília) — alimenta a visão diária.
  const conds = [PrismaNS.sql`1=1`];
  if (req.query.kind) conds.push(PrismaNS.sql`"kind" = ${String(req.query.kind)}`);
  if (req.query.campaignId) conds.push(PrismaNS.sql`"refId" = ${String(req.query.campaignId)}`);
  if (req.query.sender) conds.push(PrismaNS.sql`"senderPhoneId" = ${String(req.query.sender)}`);
  if (req.query.de) conds.push(PrismaNS.sql`"sentAt" >= ${new Date(`${req.query.de}T00:00:00-03:00`)}`);
  if (req.query.ate) conds.push(PrismaNS.sql`"sentAt" <= ${new Date(`${req.query.ate}T23:59:59-03:00`)}`);
  const porDia = await prisma.$queryRaw`
    SELECT to_char("sentAt" AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia,
      COUNT(*) FILTER (WHERE status IN ('ENVIADO','ENTREGUE','LIDA'))::int AS enviadas,
      COUNT(*) FILTER (WHERE status IN ('ENTREGUE','LIDA'))::int AS entregues,
      COUNT(*) FILTER (WHERE status = 'LIDA')::int AS lidas,
      COUNT(*) FILTER (WHERE status = 'FALHA')::int AS falhas
    FROM "MessageLog"
    WHERE ${PrismaNS.join(conds, ' AND ')}
    GROUP BY 1 ORDER BY 1 DESC LIMIT 31`;

  if (req.query.format === 'csv') {
    const rows = await prisma.messageLog.findMany({ where, orderBy: { sentAt: 'desc' } });
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['enviado_em,origem,template_ou_texto,nome,telefone,numero_remetente,status,entregue_em,lido_em,erro']
      .concat(rows.map((c) => [c.sentAt?.toISOString(), c.kind, c.refType, c.toName, c.to, c.senderPhoneId, c.status, c.deliveredAt?.toISOString(), c.readAt?.toISOString(), c.error].map(esc).join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="extrato-envios.csv"');
    return res.send('\uFEFF' + csv);
  }

  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const take = Math.min(100, Math.max(10, parseInt(req.query.take || '50', 10)));
  const data = await prisma.messageLog.findMany({ where, orderBy: { sentAt: 'desc' }, skip: (page - 1) * take, take });
  res.json({ total, page, take, resumo, porDia, data });
});

/** Pool de números do rodízio: envios de hoje, limite e situação de cada um. */
export const poolStatus = asyncHandler(async (_req, res) => {
  const numeros = await poolNumeros();
  res.json({
    dia: diaHojeBR(),
    numeros: numeros.map((n) => ({
      id: n.id, phoneNumberId: n.phoneNumberId, display: n.display, active: n.active,
      dailyCap: n.dailyCap, sentToday: n.sentToday, failToday: n.failToday, sentTotal: n.sentTotal,
      lastUsedAt: n.lastUsedAt,
    })),
  });
});

/** Ajusta um número do pool (ligar/desligar do rodízio, limite diário). */
export const poolUpdate = asyncHandler(async (req, res) => {
  const data = z.object({ active: z.boolean().optional(), dailyCap: z.number().int().min(1).max(100000).optional() }).parse(req.body);
  const n = await prisma.whatsappNumber.update({ where: { id: req.params.numeroId }, data });
  await audit({ userId: req.user?.id, action: 'POOL_NUMERO', entity: 'WhatsappNumber', entityId: n.id, ip: req.ip, changes: data });
  res.json(n);
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
      origem: { tipo: 'TESTE', refId: campaign.id, nome: 'Teste da campanha' },
    });
  } else {
    throw new AppError('Campanha sem modelo aprovado — escolha o template antes do teste.', 400);
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

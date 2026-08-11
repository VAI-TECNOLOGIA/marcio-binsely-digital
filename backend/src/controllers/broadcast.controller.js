import { z } from 'zod';
import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { sendViaChannel, renderTemplate } from '../services/messaging.service.js';
import { sendWhatsApp, getTemplate } from '../services/whatsapp.service.js';
import { CHANNELS } from '../utils/enums.js';

export const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  const busca = (req.query.search || '').trim();
  if (busca) {
    where.OR = [
      { name: { contains: busca, mode: 'insensitive' } },
      { message: { contains: busca, mode: 'insensitive' } },
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
    include: { contacts: { take: 500, orderBy: { createdAt: 'asc' } }, owner: { select: { id: true, name: true } } },
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
});

export const create = asyncHandler(async (req, res) => {
  const data = schema.parse(req.body);
  // Precisa de template OU mensagem livre.
  if (!data.templateName && (!data.message || data.message.trim().length < 2)) {
    throw new AppError('Escolha um template aprovado ou escreva a mensagem.', 400);
  }
  const c = await prisma.broadcastCampaign.create({
    data: {
      name: data.name,
      message: data.message || '',
      channel: data.channel || 'WHATSAPP',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      templateName: data.templateName || null,
      templateLang: data.templateLang || 'pt_BR',
      headerImageUrl: data.headerImageUrl || null,
      ownerId: req.user?.id,
    },
  });
  res.status(201).json(c);
});

export const importContacts = asyncHandler(async (req, res) => {
  const { contacts, csv } = req.body;
  let rows = [];
  if (Array.isArray(contacts)) rows = contacts;
  else if (typeof csv === 'string') rows = parseCsv(csv);
  else throw new AppError('Envie "contacts" (array) ou "csv" (string).', 400);

  const campaignId = req.params.id;
  const valid = rows.filter((r) => r.telefone || r.phone);
  await prisma.broadcastContact.createMany({
    data: valid.map((r) => ({
      campaignId,
      name: r.nome || r.name || '',
      phone: String(r.telefone || r.phone),
      cityName: r.cidade || r.cityName || null,
      neighborhood: r.bairro || r.neighborhood || null,
      responsible: r.responsavel || r.responsible || null,
    })),
  });

  const total = await prisma.broadcastContact.count({ where: { campaignId } });
  await prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { totalContacts: total, pendingCount: total } });
  res.status(201).json({ imported: valid.length, total });
});

// Bug 2: envio em LOTES. Cada chamada processa até BATCH pendentes e responde
// rapidamente (nada de request pendente por minutos). O cliente repete até "done".
const BATCH = 25;

export const send = asyncHandler(async (req, res) => {
  const campaignId = req.params.id;
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new AppError('Campanha não encontrada', 404);

  const batch = await prisma.broadcastContact.findMany({
    where: { campaignId, status: 'PENDENTE' },
    take: BATCH,
    orderBy: { createdAt: 'asc' },
  });

  if (batch.length && campaign.status !== 'ENVIANDO') {
    await prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { status: 'ENVIANDO' } });
  }

  // Campanha por template aprovado: busca a estrutura uma vez (header/variáveis).
  const tpl = campaign.templateName ? await getTemplate(campaign.templateName) : null;
  if (campaign.templateName && !tpl) {
    await prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { status: 'PAUSADA' } });
    throw new AppError(`Template "${campaign.templateName}" não encontrado ou não aprovado na conta.`, 400);
  }

  let sent = 0;
  let failed = 0;
  for (const c of batch) {
    try {
      let result;
      if (tpl) {
        result = await sendWhatsApp({
          to: c.phone,
          template: {
            name: tpl.name,
            language: { code: campaign.templateLang || tpl.language || 'pt_BR' },
            components: montarComponentesTemplate(tpl, campaign, c),
          },
        });
      } else {
        const body = renderTemplate(campaign.message, { nome: c.name, cidade: c.cityName, bairro: c.neighborhood, responsavel: c.responsible });
        result = await sendViaChannel(campaign.channel, { to: c.phone, body });
      }
      if (result && result.success === false) {
        await prisma.broadcastContact.update({ where: { id: c.id }, data: { status: 'FALHA', error: (result.error || 'Falha no envio').slice(0, 300) } });
        failed++;
      } else {
        await prisma.broadcastContact.update({ where: { id: c.id }, data: { status: 'ENVIADO', sentAt: new Date() } });
        sent++;
      }
    } catch (e) {
      await prisma.broadcastContact.update({ where: { id: c.id }, data: { status: 'FALHA', error: (e.message || 'erro').slice(0, 300) } });
      failed++;
    }
  }

  const remaining = await prisma.broadcastContact.count({ where: { campaignId, status: 'PENDENTE' } });
  const updated = await prisma.broadcastCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount: { increment: sent },
      failedCount: { increment: failed },
      pendingCount: remaining,
      status: remaining === 0 ? 'CONCLUIDA' : 'ENVIANDO',
    },
  });

  res.status(202).json({
    sent,
    failed,
    remaining,
    done: remaining === 0,
    sentCount: updated.sentCount,
    failedCount: updated.failedCount,
    totalContacts: updated.totalContacts,
  });
});

/** Pausa o envio (status PAUSADA) — usado pelo botão Cancelar. */
export const pause = asyncHandler(async (req, res) => {
  const c = await prisma.broadcastCampaign.update({ where: { id: req.params.id }, data: { status: 'PAUSADA' } });
  res.json({ ok: true, status: c.status });
});

export const remove = asyncHandler(async (req, res) => {
  await prisma.broadcastCampaign.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

/**
 * Componentes do template para um contato: imagem do header (quando o template
 * tem header de imagem) e as variáveis do corpo mapeadas dos dados do contato
 * ({{1}}=nome, {{2}}=cidade, {{3}}=bairro, {{4}}=responsável).
 */
function montarComponentesTemplate(tpl, campaign, contact) {
  const components = [];
  if (tpl.headerFormat === 'IMAGE' && campaign.headerImageUrl) {
    components.push({ type: 'header', parameters: [{ type: 'image', image: { link: campaign.headerImageUrl } }] });
  }
  if (tpl.bodyVarCount > 0) {
    const fontes = [contact.name, contact.cityName, contact.neighborhood, contact.responsible];
    const parameters = [];
    for (let i = 0; i < tpl.bodyVarCount; i++) {
      parameters.push({ type: 'text', text: String(fontes[i] ?? contact.name ?? '—') });
    }
    components.push({ type: 'body', parameters });
  }
  return components;
}

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

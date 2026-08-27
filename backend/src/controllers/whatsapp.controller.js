import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import env from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { sendWhatsApp, getTemplates, uploadHeaderHandle, criarTemplateMeta } from '../services/whatsapp.service.js';
import { onlyDigits } from '../utils/helpers.js';

/** Verificação do webhook (handshake exigido pela Meta Cloud API). */
export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

/** Recebe eventos do WhatsApp (estrutura compatível com a Meta Cloud API). */
export const receiveWebhook = asyncHandler(async (req, res) => {
  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    console.log('[wa:webhook]', JSON.stringify(value || req.body || {}).slice(0, 700));
    const message = value?.messages?.[0];
    if (message) {
      await handleInbound({
        phone: onlyDigits(message.from),
        name: value?.contacts?.[0]?.profile?.name,
        body: message.text?.body || message.button?.text || '',
        // Número do pool que RECEBEU — as respostas precisam sair por ele
        // (a janela de 24h vale por par contato+número).
        phoneNumberId: value?.metadata?.phone_number_id || null,
      });
    }
    // Confirmações de entrega/leitura/falha das campanhas (rastreio por wamid).
    for (const st of value?.statuses || []) {
      await handleStatus(st);
    }
  } catch (e) {
    console.warn('[whatsapp:webhook] erro ao processar:', e.message);
  }
  res.sendStatus(200);
});

/**
 * Atualiza o contato da campanha conforme o status da Meta. Transições só
 * "para cima" (ENVIADO -> ENTREGUE -> LIDA); failed vira FALHA com o motivo.
 * Contadores da campanha acompanham a primeira transição de cada estágio.
 */
async function handleStatus(st) {
  const wamid = st?.id;
  const status = st?.status; // sent | delivered | read | failed
  if (!wamid || !status) return;

  // Registro central de envios: o recebimento atualiza a MESMA linha do envio,
  // seja campanha, jornada, teste ou conversa.
  try {
    const log = await prisma.messageLog.findFirst({ where: { wamid } });
    if (log) {
      if (status === 'delivered' && log.status === 'ENVIADO') {
        await prisma.messageLog.update({ where: { id: log.id }, data: { status: 'ENTREGUE', deliveredAt: new Date() } });
      } else if (status === 'read' && ['ENVIADO', 'ENTREGUE'].includes(log.status)) {
        await prisma.messageLog.update({
          where: { id: log.id },
          data: { status: 'LIDA', readAt: new Date(), deliveredAt: log.deliveredAt || new Date() },
        });
      } else if (status === 'failed' && ['ENVIADO', 'ENTREGUE'].includes(log.status)) {
        const motivo = st?.errors?.[0]?.title || st?.errors?.[0]?.message || 'Falha reportada pela Meta';
        await prisma.messageLog.update({ where: { id: log.id }, data: { status: 'FALHA', error: String(motivo).slice(0, 300) } });
      }
    }
  } catch (e) {
    console.warn('[registro-envios] status não aplicado:', e.message);
  }

  const contato = await prisma.broadcastContact.findFirst({ where: { wamid } });
  if (!contato) return;

  if (status === 'delivered' && contato.status === 'ENVIADO') {
    await prisma.broadcastContact.update({ where: { id: contato.id }, data: { status: 'ENTREGUE', deliveredAt: new Date() } });
    await prisma.broadcastCampaign.update({ where: { id: contato.campaignId }, data: { deliveredCount: { increment: 1 } } });
  } else if (status === 'read' && ['ENVIADO', 'ENTREGUE'].includes(contato.status)) {
    const pulouEntrega = contato.status === 'ENVIADO';
    await prisma.broadcastContact.update({
      where: { id: contato.id },
      data: { status: 'LIDA', readAt: new Date(), deliveredAt: contato.deliveredAt || new Date() },
    });
    await prisma.broadcastCampaign.update({
      where: { id: contato.campaignId },
      data: { readCount: { increment: 1 }, ...(pulouEntrega ? { deliveredCount: { increment: 1 } } : {}) },
    });
  } else if (status === 'failed' && ['ENVIADO', 'ENTREGUE'].includes(contato.status)) {
    const motivo = st?.errors?.[0]?.title || st?.errors?.[0]?.message || 'Falha reportada pela Meta';
    await prisma.broadcastContact.update({ where: { id: contato.id }, data: { status: 'FALHA', error: String(motivo).slice(0, 300) } });
    await prisma.broadcastCampaign.update({
      where: { id: contato.campaignId },
      data: { failedCount: { increment: 1 }, sentCount: { decrement: 1 } },
    });
  }
}

/** Simula uma mensagem recebida — permite testar o fluxo sem a API real. */
export const simulateInbound = asyncHandler(async (req, res) => {
  const { phone, name, body } = req.body;
  const result = await handleInbound({ phone: onlyDigits(phone), name, body });
  res.json(result);
});

/** Templates aprovados da conta — alimenta o seletor de disparo por template. */
export const listTemplates = asyncHandler(async (_req, res) => {
  const data = await getTemplates();
  // Anexa a URL pública da imagem do topo dos modelos criados pelo sistema
  // (o envio precisa dela; o exemplo enviado à Meta é só para a análise).
  const settings = await prisma.setting.findMany({ where: { key: { startsWith: 'tpl_header_' } } });
  const mapa = Object.fromEntries(settings.map((s) => [s.key.replace('tpl_header_', ''), s.value]));
  res.json({ data: data.map((t) => ({ ...t, headerUrl: mapa[t.name] || null })) });
});

const EMOJI_RE = /\p{Extended_Pictographic}/u;

const criarTemplateSchema = z.object({
  titulo: z.string().min(3, 'Dê um nome ao modelo').max(60),
  corpo: z.string().min(20, 'Escreva a mensagem (mínimo 20 caracteres)').max(1024),
  rodape: z.string().max(60, 'O rodapé aceita até 60 caracteres').optional().default(''),
  tipoBotoes: z.enum(['nenhum', 'respostas', 'link']).default('nenhum'),
  botoes: z.array(z.string().min(1).max(25, 'Botão aceita até 25 caracteres')).max(3).optional().default([]),
  urlBotao: z.string().optional().default(''),
  textoBotaoUrl: z.string().max(25).optional().default(''),
  imagemFilename: z.string().optional().default(''),
});

/**
 * Criador de modelos — monta e envia um template para análise da Meta.
 * Regras que a Meta rejeita já validadas aqui: corpo não pode começar nem
 * terminar com variável; botão não aceita emoji nem link de WhatsApp;
 * respostas rápidas não misturam com botão de link.
 */
export const createTemplate = asyncHandler(async (req, res) => {
  const d = criarTemplateSchema.parse(req.body);

  const corpo = d.corpo.trim();
  if (/^\{\{\s*\d+\s*\}\}/.test(corpo) || /\{\{\s*\d+\s*\}\}$/.test(corpo)) {
    throw new AppError('A mensagem não pode começar nem terminar com o nome da pessoa — abra com "Olá {{1}}," por exemplo.', 400);
  }
  const varsNoCorpo = [...new Set((corpo.match(/\{\{\s*(\d+)\s*\}\}/g) || []).map((v) => v.replace(/\D/g, '')))];
  if (varsNoCorpo.some((v) => v !== '1')) {
    throw new AppError('Use apenas {{1}} (nome da pessoa) no texto. Outros dados entram na hora da campanha.', 400);
  }

  // Nome interno: slug do título (regra da Meta: minúsculas e underline).
  const name = d.titulo
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  if (!name) throw new AppError('Nome do modelo inválido.', 400);

  const components = [];

  // Imagem do topo (opcional): arquivo já enviado ao /uploads do sistema.
  let headerUrl = null;
  if (d.imagemFilename) {
    const filename = path.basename(d.imagemFilename); // sem traversal
    const filePath = path.resolve('uploads', filename);
    if (!fs.existsSync(filePath)) throw new AppError('Imagem não encontrada — envie novamente.', 400);
    const handle = await uploadHeaderHandle(filePath);
    components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [handle] } });
    headerUrl = `${env.publicUrl || 'https://app.marciobinsely.site'}/uploads/${filename}`;
  }

  components.push({
    type: 'BODY',
    text: corpo,
    ...(varsNoCorpo.length ? { example: { body_text: [['Maria']] } } : {}),
  });

  if (d.rodape.trim()) components.push({ type: 'FOOTER', text: d.rodape.trim() });

  if (d.tipoBotoes === 'respostas') {
    const textos = d.botoes.map((b) => b.trim()).filter(Boolean);
    if (!textos.length) throw new AppError('Adicione ao menos um botão de resposta.', 400);
    for (const t of textos) {
      if (EMOJI_RE.test(t)) throw new AppError(`O botão "${t}" não pode ter emoji (regra da Meta).`, 400);
    }
    components.push({ type: 'BUTTONS', buttons: textos.map((t) => ({ type: 'QUICK_REPLY', text: t })) });
  } else if (d.tipoBotoes === 'link') {
    const texto = (d.textoBotaoUrl || 'Saiba mais').trim();
    const url = d.urlBotao.trim();
    if (!/^https?:\/\//i.test(url)) throw new AppError('Informe o endereço completo do link (https://...).', 400);
    if (/wa\.me|whatsapp\.com/i.test(url)) throw new AppError('A Meta não aceita link de WhatsApp em botão — use um endereço do site.', 400);
    if (EMOJI_RE.test(texto)) throw new AppError('O texto do botão não pode ter emoji (regra da Meta).', 400);
    components.push({ type: 'BUTTONS', buttons: [{ type: 'URL', text: texto, url }] });
  }

  const criado = await criarTemplateMeta({ name, components });

  if (headerUrl) {
    await prisma.setting.upsert({
      where: { key: `tpl_header_${name}` },
      update: { value: headerUrl },
      create: { key: `tpl_header_${name}`, value: headerUrl },
    });
  }
  await audit({ userId: req.user?.id, action: 'TEMPLATE_CRIADO', entity: 'WhatsappTemplate', entityId: criado.id, ip: req.ip, changes: { name, status: criado.status } });
  res.status(201).json({ name, status: criado.status });
});

/** Núcleo do telefone (sem DDI 55) — mesmo critério da blacklist/campanhas. */
function nucleoFone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d;
}

async function handleInbound({ phone, name, body, phoneNumberId }) {
  if (!phone) return { ignored: true };

  // ---- Descadastramento (opt-out): "SAIR" ou equivalentes ----
  // Entra imediatamente na lista de supressão (Blacklist) e recebe a
  // confirmação. Vale para todos os envios futuros de qualquer campanha.
  const pedido = String(body || '').trim().toLowerCase();
  if (/^(sair|parar|cancelar|remover|stop|descadastrar)$/.test(pedido)) {
    const nucleo = nucleoFone(phone);
    const jaBloqueado = await prisma.blacklist.findFirst({ where: { phone: { in: [nucleo, '55' + nucleo, phone] } } });
    if (!jaBloqueado) {
      await prisma.blacklist.create({
        data: { phone: nucleo, name: name || null, reason: 'Descadastramento solicitado pelo destinatário (SAIR via WhatsApp).' },
      });
    }
    const confirmacao = 'Pronto. Seu número foi removido da lista de comunicações e você não receberá novas mensagens. Se mudar de ideia, é só escrever VOLTAR.';
    await sendWhatsApp({ to: phone, body: confirmacao, phoneNumberId, origem: { tipo: 'CONVERSA', nome: name || null } });
    return { optOut: true };
  }
  // Reversão do opt-out a pedido do próprio titular.
  if (/^voltar$/.test(pedido)) {
    const nucleo = nucleoFone(phone);
    const removidos = await prisma.blacklist.deleteMany({ where: { phone: { in: [nucleo, '55' + nucleo, phone] } } });
    if (removidos.count > 0) {
      await sendWhatsApp({ to: phone, body: 'Seu número voltou a receber as comunicações da campanha. Para sair novamente, escreva SAIR.', phoneNumberId, origem: { tipo: 'CONVERSA', nome: name || null } });
      return { optIn: true };
    }
  }

  // Casa o contato com e sem DDI 55, no telefone e no WhatsApp cadastrados.
  const nucleo = nucleoFone(phone);
  const variantes = [phone, nucleo, '55' + nucleo];
  const supporter = await prisma.supporter.findFirst({
    where: { OR: [{ phone: { in: variantes } }, { whatsapp: { in: variantes } }] },
  });
  let convo = await prisma.conversation.findFirst({
    where: { contactPhone: phone, status: { not: 'FECHADA' } },
    orderBy: { createdAt: 'desc' },
  });
  if (!convo) {
    convo = await prisma.conversation.create({
      data: {
        channel: 'WHATSAPP',
        status: 'ABERTA',
        contactName: name || supporter?.name || null,
        contactPhone: phone,
        phoneNumberId: phoneNumberId || null,
        supporterId: supporter?.id || null,
        lastMessageAt: new Date(),
      },
    });
  }

  await prisma.message.create({
    data: { conversationId: convo.id, direction: 'INBOUND', body: body || '', channel: 'WHATSAPP' },
  });
  // A conversa acompanha o número em que a pessoa escreveu por último.
  await prisma.conversation.update({
    where: { id: convo.id },
    data: { lastMessageAt: new Date(), ...(phoneNumberId ? { phoneNumberId } : {}) },
  });

  // ---- Kit de campanha (botões do template marcio_kit_campanha) ----
  // "Quero receber o kit" abre o Pedido de Material automaticamente (sem
  // duplicar pedido aberto) e confirma pelo MESMO número. Quem não está na
  // base entra como apoiador (origem marcada) para o pedido sair com nome.
  const resposta = String(body || '').trim().toLowerCase();
  if (resposta === 'quero receber o kit') {
    let quem = supporter;
    if (!quem) {
      quem = await prisma.supporter.create({
        data: {
          name: name || `Contato ${nucleo.slice(-4)}`,
          phone,
          whatsapp: phone,
          status: 'NOVO',
          tags: ['KIT VIA WHATSAPP'],
        },
      });
    }
    const aberto = await prisma.materialRequest.findFirst({
      where: { supporterId: quem.id, materialName: 'Kit de campanha', status: { in: ['SOLICITADO', 'EM_ANALISE', 'APROVADO', 'SEPARADO'] } },
    });
    let texto;
    if (aberto) {
      texto = 'Seu kit já está registrado com a equipe e segue em preparação. Assim que houver novidade, avisamos por aqui.';
    } else {
      await prisma.materialRequest.create({
        data: {
          materialName: 'Kit de campanha',
          materials: ['Kit de campanha'],
          quantity: 1,
          justification: 'Solicitado pelo apoiador via WhatsApp (resposta ao convite do kit).',
          cityName: quem.cityName || null,
          neighborhood: quem.neighborhood || null,
          supporterId: quem.id,
        },
      });
      const primeiro = (quem.name || '').split(' ')[0];
      texto = supporter
        ? `Anotado, ${primeiro}! Seu kit de campanha foi registrado e a equipe vai organizar a entrega. Obrigado por caminhar junto!`
        : 'Anotado! Seu kit de campanha foi registrado. Para agilizar a entrega, responda com seu nome completo, bairro e cidade.';
    }
    const quemNome = quem?.name || name || null;
    const r = await sendWhatsApp({ to: phone, body: texto, phoneNumberId, origem: { tipo: 'CONVERSA', refId: convo.id, nome: quemNome } });
    await prisma.message.create({
      data: { conversationId: convo.id, direction: 'OUTBOUND', body: texto, channel: 'WHATSAPP', externalId: r.id },
    });
    return { conversationId: convo.id, supporterId: quem.id, kit: true };
  }
  if (resposta === 'agora não' || resposta === 'agora nao') {
    const texto = 'Tudo bem, obrigado por responder! Se mudar de ideia, é só escrever por aqui.';
    const r = await sendWhatsApp({ to: phone, body: texto, phoneNumberId, origem: { tipo: 'CONVERSA', refId: convo.id, nome: name || null } });
    await prisma.message.create({
      data: { conversationId: convo.id, direction: 'OUTBOUND', body: texto, channel: 'WHATSAPP', externalId: r.id },
    });
    return { conversationId: convo.id, kitRecusado: true };
  }

  if (supporter && /^\s*sim\b/i.test(body || '')) {
    const v = await prisma.volunteer.findUnique({ where: { supporterId: supporter.id } });
    if (v && !v.confirmed) {
      await prisma.volunteer.update({
        where: { id: v.id },
        data: { confirmed: true, confirmedAt: new Date(), confirmationChannel: 'WHATSAPP', active: true },
      });
      await prisma.supporter.update({ where: { id: supporter.id }, data: { status: 'CONFIRMADO' } });
      const ask =
        'Que ótimo! Como você prefere ajudar? Responda: (1) Caminhadas (2) Faixa em casa (3) Material digital (4) Eventos';
      const r = await sendWhatsApp({ to: phone, body: ask, phoneNumberId, origem: { tipo: 'CONVERSA', refId: convo.id, nome: supporter?.name || null } });
      await prisma.message.create({
        data: { conversationId: convo.id, direction: 'OUTBOUND', body: ask, channel: 'WHATSAPP', externalId: r.id },
      });
    }
  }

  return { conversationId: convo.id, supporterId: supporter?.id || null };
}

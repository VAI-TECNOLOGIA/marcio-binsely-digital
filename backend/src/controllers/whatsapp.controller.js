import prisma from '../config/prisma.js';
import env from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendWhatsApp, getTemplates } from '../services/whatsapp.service.js';
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
  res.json({ data });
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

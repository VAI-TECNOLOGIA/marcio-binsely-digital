import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { sendViaChannel, renderTemplate } from './messaging.service.js';
import { sendWhatsApp, getTemplate } from './whatsapp.service.js';

// ============================================================
//  Núcleo do módulo de Campanhas (disparo oficial).
//  Compartilhado pelo controller (envio manual em lotes) e pelo
//  cron do VPS (agendadas + continuação automática).
// ============================================================

/** Versão vigente do texto da declaração de conformidade (Contrato CC-MBD-2026-0826). */
export const DECL_VERSION = 'v1-2026-08-26';
export const DECL_TEXTO =
  'Declaro, sob responsabilidade da campanha, que os destinatários selecionados autorizaram o recebimento desta comunicação, ' +
  'que a campanha possui as respectivas evidências, que a finalidade é compatível com o consentimento obtido e que nenhum ' +
  'destinatário selecionado solicitou descadastramento.';

/** Núcleo do telefone (dígitos, sem DDI 55) para comparação/dedupe. */
export function nucleoFone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  return d;
}

/** Telefone BR plausível (DDD + 8/9 dígitos), já em forma de núcleo. */
export function foneValido(nucleo) {
  return /^\d{10,11}$/.test(nucleo);
}

/** Conjunto de núcleos bloqueados (Blacklist + lista de supressão SAIR). */
export async function fonesBloqueados() {
  const rows = await prisma.blacklist.findMany({ where: { phone: { not: null } }, select: { phone: true } });
  return new Set(rows.map((r) => nucleoFone(r.phone)).filter(Boolean));
}

/** Hash SHA-256 da lista (núcleos ordenados) — congela o público no aceite. */
export function hashLista(nucleos) {
  return crypto.createHash('sha256').update([...nucleos].sort().join(',')).digest('hex');
}

/** Hash SHA-256 do conteúdo (template/idioma/mensagem/header/vars). */
export function hashConteudo(c) {
  const base = [c.templateName || '', c.templateLang || '', c.message || '', c.headerImageUrl || '', JSON.stringify(c.varsJson || null)].join('|');
  return crypto.createHash('sha256').update(base).digest('hex');
}

/** Pacote de créditos vigente + situação (ativo, expirado, saldo). */
export async function pacoteCreditos() {
  const pkg = await prisma.creditPackage.findFirst({ orderBy: { activatedAt: 'desc' } });
  if (!pkg) return { pkg: null, ativo: false, expirado: false, saldo: 0, diasRestantes: 0 };
  const agora = new Date();
  const expirado = agora > pkg.expiresAt;
  const saldo = Math.max(0, pkg.total - pkg.used);
  const diasRestantes = Math.max(0, Math.ceil((pkg.expiresAt - agora) / 86400000));
  return { pkg, ativo: !expirado && saldo > 0, expirado, saldo, diasRestantes };
}

/**
 * Monta o público a partir dos filtros + números colados. Usado no preview
 * (contagens) e na aplicação (grava BroadcastContact). Sempre: dedupe por
 * núcleo, pula blacklist/supressão e quem já está na campanha.
 */
export async function montarPublico({ campaignId, filtros = {}, colados = '' }) {
  const where = { AND: [{ OR: [{ whatsapp: { not: null } }, { phone: { not: null } }] }] };
  if (filtros.tags?.length) where.AND.push({ tags: { hasSome: filtros.tags } });
  if (filtros.cities?.length) where.AND.push({ cityName: { in: filtros.cities } });
  if (filtros.neighborhoods?.length) where.AND.push({ neighborhood: { in: filtros.neighborhoods } });
  if (filtros.statuses?.length) where.AND.push({ status: { in: filtros.statuses } });
  if (filtros.apenasVoluntarios) where.AND.push({ volunteer: { is: { active: true } } });

  const usarBase = filtros.usarBase !== false;
  const daBase = usarBase
    ? await prisma.supporter.findMany({
        where,
        select: { id: true, name: true, phone: true, whatsapp: true, cityName: true, neighborhood: true },
      })
    : [];

  // Números colados: um por linha (aceita vírgula/;). Nome opcional após o número.
  const linhas = String(colados || '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const coladosParsed = linhas.map((linha) => {
    const m = linha.match(/^([\d\s()+.-]{8,20})\s*(.*)$/);
    const bruto = m ? m[1] : linha;
    const nome = (m && m[2] ? m[2] : '').trim();
    return { nucleo: nucleoFone(bruto), nome };
  });

  const bloqueados = await fonesBloqueados();
  const jaNaCampanha = new Set();
  if (campaignId) {
    const atuais = await prisma.broadcastContact.findMany({ where: { campaignId }, select: { phone: true } });
    for (const c of atuais) jaNaCampanha.add(nucleoFone(c.phone));
  }

  const vistos = new Set();
  const finais = [];
  const stats = { daBase: daBase.length, colados: coladosParsed.length, coladosInvalidos: 0, semTelefone: 0, duplicados: 0, blacklist: 0, jaNaCampanha: 0 };

  for (const s of daBase) {
    const nucleo = nucleoFone(s.whatsapp || s.phone);
    if (!foneValido(nucleo)) { stats.semTelefone++; continue; }
    if (vistos.has(nucleo)) { stats.duplicados++; continue; }
    if (bloqueados.has(nucleo)) { stats.blacklist++; continue; }
    if (jaNaCampanha.has(nucleo)) { stats.jaNaCampanha++; continue; }
    vistos.add(nucleo);
    finais.push({ name: s.name || '', phone: '55' + nucleo, cityName: s.cityName || null, neighborhood: s.neighborhood || null, supporterId: s.id, source: 'BASE' });
  }
  for (const c of coladosParsed) {
    if (!foneValido(c.nucleo)) { stats.coladosInvalidos++; continue; }
    if (vistos.has(c.nucleo)) { stats.duplicados++; continue; }
    if (bloqueados.has(c.nucleo)) { stats.blacklist++; continue; }
    if (jaNaCampanha.has(c.nucleo)) { stats.jaNaCampanha++; continue; }
    vistos.add(c.nucleo);
    finais.push({ name: c.nome || '', phone: '55' + c.nucleo, cityName: null, neighborhood: null, supporterId: null, source: 'COLADO' });
  }

  return { finais, stats: { ...stats, total: finais.length } };
}

/**
 * Componentes do template para um contato. Com varsJson usa o mapeamento
 * escolhido na campanha ({{n}} => nome/cidade/bairro/responsável/texto fixo);
 * sem varsJson mantém a ordem legada nome/cidade/bairro/responsável.
 */
export function montarComponentesTemplate(tpl, campaign, contact) {
  const components = [];
  if (tpl.headerFormat === 'IMAGE' && campaign.headerImageUrl) {
    components.push({ type: 'header', parameters: [{ type: 'image', image: { link: campaign.headerImageUrl } }] });
  }
  if (tpl.bodyVarCount > 0) {
    const porFonte = (src, valorFixo) => {
      if (src === 'cidade') return contact.cityName;
      if (src === 'bairro') return contact.neighborhood;
      if (src === 'responsavel') return contact.responsible;
      if (src === 'fixo') return valorFixo;
      return contact.name; // 'nome' (padrão)
    };
    const vars = Array.isArray(campaign.varsJson) ? campaign.varsJson : null;
    const legado = [contact.name, contact.cityName, contact.neighborhood, contact.responsible];
    const parameters = [];
    for (let i = 0; i < tpl.bodyVarCount; i++) {
      const v = vars ? porFonte(vars[i]?.source, vars[i]?.value) : legado[i];
      parameters.push({ type: 'text', text: String(v || contact.name || '—').slice(0, 500) });
    }
    components.push({ type: 'body', parameters });
  }
  return components;
}

/**
 * Processa UM lote de pendentes da campanha. Regras:
 *  - exige declaração aceita e lista inalterada desde o aceite;
 *  - exige pacote de créditos ativo (não expirado, com saldo);
 *  - pula blacklist mesmo para contatos importados antes do bloqueio;
 *  - consome 1 crédito por envio ACEITO pela API (guarda o wamid).
 * Devolve { sent, failed, remaining, done, blocked?, motivo? }.
 */
export async function processarLote(campaignId, { batch = 25 } = {}) {
  const campaign = await prisma.broadcastCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { blocked: true, motivo: 'Campanha não encontrada.' };
  if (['CANCELADA', 'CONCLUIDA'].includes(campaign.status)) return { blocked: true, motivo: `Campanha ${campaign.status.toLowerCase()}.` };

  // ---- Trava 1: declaração de conformidade (aceite ativo) ----
  if (!campaign.declAcceptedAt) return { blocked: true, motivo: 'Envio bloqueado: a declaração de conformidade ainda não foi aceita.' };
  const alterados = await prisma.broadcastContact.count({ where: { campaignId, createdAt: { gt: campaign.declAcceptedAt } } });
  const totalAtual = await prisma.broadcastContact.count({ where: { campaignId } });
  if (alterados > 0 || (campaign.declListCount != null && totalAtual !== campaign.declListCount)) {
    return { blocked: true, motivo: 'A lista foi alterada depois do aceite. Revise o público e aceite a declaração novamente.' };
  }

  // ---- Trava 2: pacote de créditos ----
  const { pkg, expirado, saldo } = await pacoteCreditos();
  if (!pkg) return { blocked: true, motivo: 'Nenhum pacote de créditos ativado.' };
  if (expirado) return { blocked: true, motivo: 'O pacote de créditos expirou (validade de 120 dias encerrada).' };
  if (saldo <= 0) return { blocked: true, motivo: 'Saldo de créditos esgotado.' };

  const take = Math.min(batch, saldo);
  const lote = await prisma.broadcastContact.findMany({ where: { campaignId, status: 'PENDENTE' }, take, orderBy: { createdAt: 'asc' } });

  if (lote.length && campaign.status !== 'ENVIANDO') {
    await prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { status: 'ENVIANDO' } });
  }

  const tpl = campaign.templateName ? await getTemplate(campaign.templateName) : null;
  if (campaign.templateName && !tpl) {
    await prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { status: 'PAUSADA' } });
    return { blocked: true, motivo: `Template "${campaign.templateName}" não encontrado ou não aprovado na conta.` };
  }

  const bloqueados = lote.length ? await fonesBloqueados() : new Set();
  let sent = 0;
  let failed = 0;
  for (const c of lote) {
    if (bloqueados.has(nucleoFone(c.phone))) {
      await prisma.broadcastContact.update({ where: { id: c.id }, data: { status: 'FALHA', error: 'Número na lista de supressão — envio bloqueado.' } });
      failed++;
      continue;
    }
    try {
      let result;
      if (tpl) {
        result = await sendWhatsApp({
          to: c.phone,
          template: { name: tpl.name, language: { code: campaign.templateLang || tpl.language || 'pt_BR' }, components: montarComponentesTemplate(tpl, campaign, c) },
        });
      } else {
        const body = renderTemplate(campaign.message, { nome: c.name, cidade: c.cityName, bairro: c.neighborhood, responsavel: c.responsible });
        result = await sendViaChannel(campaign.channel, { to: c.phone, body });
      }
      if (result && result.success === false) {
        await prisma.broadcastContact.update({ where: { id: c.id }, data: { status: 'FALHA', error: (result.error || 'Falha no envio').slice(0, 300) } });
        failed++;
      } else {
        await prisma.broadcastContact.update({ where: { id: c.id }, data: { status: 'ENVIADO', sentAt: new Date(), wamid: result?.id || null } });
        sent++;
      }
    } catch (e) {
      await prisma.broadcastContact.update({ where: { id: c.id }, data: { status: 'FALHA', error: (e.message || 'erro').slice(0, 300) } });
      failed++;
    }
  }

  // Consome créditos apenas pelos envios aceitos.
  if (sent > 0) await prisma.creditPackage.update({ where: { id: pkg.id }, data: { used: { increment: sent } } });

  const remaining = await prisma.broadcastContact.count({ where: { campaignId, status: 'PENDENTE' } });
  const updated = await prisma.broadcastCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount: { increment: sent },
      failedCount: { increment: failed },
      creditsUsed: { increment: sent },
      pendingCount: remaining,
      status: remaining === 0 ? 'CONCLUIDA' : 'ENVIANDO',
    },
  });

  return {
    sent,
    failed,
    remaining,
    done: remaining === 0,
    sentCount: updated.sentCount,
    failedCount: updated.failedCount,
    totalContacts: updated.totalContacts,
  };
}

/**
 * Rotina do cron (VPS, a cada minuto): promove AGENDADAs vencidas com
 * declaração aceita e continua o envio das ENVIANDO — o disparo não depende
 * de navegador aberto.
 */
export async function processarAgendadas({ maxLotesPorCampanha = 6, batch = 25 } = {}) {
  const agora = new Date();
  const promovidas = await prisma.broadcastCampaign.updateMany({
    where: { status: 'AGENDADA', scheduledAt: { lte: agora }, declAcceptedAt: { not: null } },
    data: { status: 'ENVIANDO' },
  });

  const ativas = await prisma.broadcastCampaign.findMany({ where: { status: 'ENVIANDO' }, select: { id: true, name: true }, take: 3, orderBy: { updatedAt: 'asc' } });
  const resultados = [];
  for (const c of ativas) {
    let lotes = 0;
    let resumo = { sent: 0, failed: 0 };
    while (lotes < maxLotesPorCampanha) {
      const r = await processarLote(c.id, { batch });
      if (r.blocked) { resumo.motivo = r.motivo; break; }
      resumo.sent += r.sent;
      resumo.failed += r.failed;
      lotes++;
      if (r.done || (r.sent === 0 && r.failed === 0)) break;
    }
    resultados.push({ id: c.id, name: c.name, ...resumo });
  }
  return { promovidas: promovidas.count, campanhas: resultados };
}

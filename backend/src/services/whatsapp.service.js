import env from '../config/env.js';
import prisma from '../config/prisma.js';
import { onlyDigits } from '../utils/helpers.js';

// ============================================================
//  Serviço WhatsApp — arquitetura preparada para a API Oficial
//  (Meta WhatsApp Cloud API). Em modo "simulado" registra e
//  devolve um id fake. Trocar WHATSAPP_PROVIDER=meta_cloud e
//  preencher token/phone ativa envios reais — SEM mudar o
//  restante do código.
// ============================================================

// Garante o código do país (55) em números brasileiros digitados sem DDI.
// Idempotente: número que já começa com 55 (ex.: importado no Disparos) passa
// intacto; 10/11 dígitos (DDD + número) recebem o 55 na frente.
function normalizarNumeroBR(to) {
  const d = String(to || '').replace(/\D/g, '');
  if (!d) return d;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}

// phoneNumberId (opcional) escolhe o número remetente — usado pelo rodízio do
// pool de disparo e pelas respostas de conversa (sair pelo número que recebeu).
// Sem ele, usa o número principal do .env.
export async function sendWhatsApp({ to, body, template, phoneNumberId }) {
  if (env.whatsapp.provider === 'meta_cloud' && env.whatsapp.token) {
    const url = `https://graph.facebook.com/v20.0/${phoneNumberId || env.whatsapp.phoneNumberId}/messages`;
    const dest = normalizarNumeroBR(to);
    const payload = template
      ? { messaging_product: 'whatsapp', to: dest, type: 'template', template }
      : { messaging_product: 'whatsapp', to: dest, type: 'text', text: { body } };
    let data = null;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      data = await resp.json();
      const id = data?.messages?.[0]?.id;
      // Só é sucesso quando a Meta devolve o id da mensagem. Caso contrário
      // (janela de 24h fechada, número inválido, sem template/pagamento…) é
      // FALHA — não pode ser tratado como enviado.
      if (resp.ok && id) return { provider: 'meta_cloud', id, success: true, raw: data };
      const err = data?.error;
      const motivo = err?.error_user_msg || err?.message || 'A Meta recusou o envio.';
      return { provider: 'meta_cloud', id: null, success: false, error: motivo, raw: data };
    } catch (e) {
      return { provider: 'meta_cloud', id: null, success: false, error: 'Falha de conexão com a API do WhatsApp.', raw: data };
    }
  }

  const id = `wamid.SIMULATED.${Date.now()}`;
  console.log(`[whatsapp:simulado] -> ${to}: ${body || JSON.stringify(template)}`);
  return { provider: 'simulado', id, simulated: true, success: true };
}

function resumirTemplate(t) {
  const comps = t.components || [];
  const header = comps.find((c) => c.type === 'HEADER');
  const body = comps.find((c) => c.type === 'BODY');
  const footer = comps.find((c) => c.type === 'FOOTER');
  const buttons = comps.find((c) => c.type === 'BUTTONS');
  const bodyText = body?.text || '';
  const varCount = (bodyText.match(/\{\{\s*\d+\s*\}\}/g) || []).length;
  return {
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    headerFormat: header?.format || null, // IMAGE / TEXT / VIDEO / DOCUMENT / null
    headerText: header?.format === 'TEXT' ? header?.text || null : null,
    bodyText,
    bodyVarCount: varCount,
    footerText: footer?.text || null,
    buttons: (buttons?.buttons || []).map((b) => ({ type: b.type, text: b.text, url: b.url || null })),
  };
}

/** Lista os templates APROVADOS da WABA (alimenta o seletor de disparo). */
export async function getTemplates() {
  if (!(env.whatsapp.provider === 'meta_cloud' && env.whatsapp.token && env.whatsapp.wabaId)) return [];
  const url = `https://graph.facebook.com/v20.0/${env.whatsapp.wabaId}/message_templates?fields=name,status,category,language,components&limit=200`;
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${env.whatsapp.token}` } });
    const data = await resp.json();
    return (data.data || []).filter((t) => t.status === 'APPROVED').map(resumirTemplate);
  } catch {
    return [];
  }
}

/**
 * Utilitário 1 — Acesso liberado: envia login + botão com link para a pessoa
 * criar a própria senha (não trafega senha em texto; a Meta não aprova senha
 * em template). O parâmetro do botão é o SUFIXO que substitui {{1}} na URL
 * cadastrada (https://app.marciobinsely.site/redefinir-senha?token={{1}}).
 */
export async function enviarAcessoLiberado({ to, nome, email, token }) {
  const template = {
    name: 'cadastro_aprovado',
    language: { code: 'pt_BR' },
    components: [
      { type: 'body', parameters: [
        { type: 'text', text: String(nome || 'Ola') },
        { type: 'text', text: String(email || '') },
      ] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(token) }] },
    ],
  };
  return sendWhatsApp({ to, template });
}

/**
 * Dispara um template de JORNADA (notificação automática: voluntário, faixa,
 * material, demanda). Regras de ouro:
 *  - nunca lança — erro é logado e engolido (a operação principal, ex. salvar o
 *    pedido, jamais pode quebrar porque o WhatsApp falhou);
 *  - pula números na blacklist;
 *  - o número é normalizado (DDI 55) dentro do sendWhatsApp.
 * params = variáveis do corpo na ordem ({{1}}, {{2}}...).
 */
export async function dispararJornada(name, to, params = []) {
  try {
    const phone = onlyDigits(to || '');
    if (!phone) return { success: false, error: 'sem telefone' };
    const nucleo = phone.startsWith('55') && phone.length >= 12 ? phone.slice(2) : phone;
    const bloqueado = await prisma.blacklist.findFirst({ where: { phone: { in: [phone, nucleo, '55' + nucleo] } } });
    if (bloqueado) return { success: false, error: 'blacklist' };
    const components = params.length
      ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p ?? '—').slice(0, 300) })) }]
      : [];
    const r = await sendWhatsApp({ to: phone, template: { name, language: { code: 'pt_BR' }, components } });
    if (r?.success === false) console.warn(`[jornada:${name}] falhou p/ ${phone}: ${r.error}`);
    return r;
  } catch (e) {
    console.warn(`[jornada:${name}] erro:`, e.message);
    return { success: false, error: e.message };
  }
}

/** Utilitário 2 — Esqueci a senha: envia o link de redefinição (token no botão). */
export async function enviarRecuperarSenha({ to, nome, token }) {
  const template = {
    name: 'recuperar_senha',
    language: { code: 'pt_BR' },
    components: [
      { type: 'body', parameters: [{ type: 'text', text: String(nome || 'Ola') }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(token) }] },
    ],
  };
  return sendWhatsApp({ to, template });
}

/** Estrutura de um template pelo nome (para montar o envio). */
export async function getTemplate(name) {
  if (!(env.whatsapp.provider === 'meta_cloud' && env.whatsapp.token && env.whatsapp.wabaId)) return null;
  const url = `https://graph.facebook.com/v20.0/${env.whatsapp.wabaId}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,category,language,components`;
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${env.whatsapp.token}` } });
    const data = await resp.json();
    const t = (data.data || [])[0];
    return t ? resumirTemplate(t) : null;
  } catch {
    return null;
  }
}

import { z } from 'zod';
import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendWhatsApp } from '../services/whatsapp.service.js';
import { SUPPORT_TYPES } from '../utils/enums.js';
import { nullifyEmpty, onlyDigits } from '../utils/helpers.js';
import { fallbackLatLng, linkCityByName } from '../utils/geo.js';
import { zonaDoBairro, ehPortoAlegre } from '../utils/zonasPoa.js';

/**
 * Região do cadastro. Em Porto Alegre a zona vem do BAIRRO (a cidade é uma
 * só e mandaria todo mundo para a mesma região); nas demais, vem da cidade.
 */
async function resolverRegiao({ cityName, neighborhood, cityRegionId }) {
  if (ehPortoAlegre(cityName)) {
    const zona = zonaDoBairro(neighborhood);
    if (!zona) return null; // sem bairro conhecido: melhor sem região do que na errada
    const r = await prisma.region.findFirst({ where: { name: zona }, select: { id: true } });
    return r?.id || null;
  }
  return cityRegionId || null;
}

// ============================================================
//  Endpoints PÚBLICOS (sem autenticação) — usados pela Landing Page.
//  Reaproveitam a regra antifraude do cadastro de apoiadores.
// ============================================================

const joinSchema = z.object({
  name: z.string().min(2, 'Informe seu nome'),
  phone: z.string().min(8, 'Informe um telefone válido'),
  email: z.string().email().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  cityName: z.string().nullable().optional(),
  supportType: z.enum(SUPPORT_TYPES).optional(),
});

// ============================================================
//  Recebe o formulário do site WordPress (marciobinsely.site — Fluent Forms).
//  Cai em Apoiadores como "A confirmar" (status PENDENTE): a pessoa
//  preencheu um formulário, ainda não falou com a campanha.
// ============================================================

/**
 * Normaliza telefone brasileiro para DDD + número (10 ou 11 dígitos).
 * Remove o código do país quando vem colado ("+55 47 98866-5310"): sem isso
 * o 55 é lido como DDD e o contato fica inalcançável. Validado no servidor
 * também porque o endpoint é público e pode ser chamado fora do formulário.
 */
function telefoneBR(bruto) {
  let d = onlyDigits(bruto);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.startsWith('0')) d = d.replace(/^0+/, ''); // 0xx operadora
  return d.length === 10 || d.length === 11 ? d : null;
}

/** Lê um campo aceitando as variações que o Fluent Forms manda. */
function campo(body, ...chaves) {
  for (const k of chaves) {
    const v = k.split('.').reduce((o, p) => (o == null ? o : o[p]), body);
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export const siteJoin = asyncHandler(async (req, res) => {
  const b = req.body || {};

  // Fluent Forms manda names como objeto OU achatado em names[first_name].
  const nome = [
    campo(b, 'names.first_name', 'names[first_name]', 'first_name', 'name', 'nome'),
    campo(b, 'names.last_name', 'names[last_name]', 'last_name'),
  ].filter(Boolean).join(' ').trim();

  const telefone = telefoneBR(campo(b, 'whatsApp', 'whatsapp', 'phone', 'telefone', 'input_whatsapp'));

  if (nome.length < 2) return res.status(400).json({ error: 'Nome é obrigatório.' });
  if (!telefone) return res.status(400).json({ error: 'Informe um WhatsApp válido com DDD.' });

  // Mesma trava anti-enxurrada do /join.
  const recentes = await prisma.supporter.count({
    where: { createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recentes >= 60) {
    return res.status(429).json({ error: 'Muitos cadastros agora. Tente novamente em instantes.' });
  }

  const [black, existente] = await Promise.all([
    prisma.blacklist.findFirst({ where: { phone: telefone } }),
    prisma.supporter.findFirst({ where: { phone: telefone } }),
  ]);

  const indicacao = campo(b, 'input_indicacao', 'indicacao');
  const tags = ['SITE 2026'];
  if (indicacao) tags.push(`INDICAÇÃO: ${indicacao.toUpperCase().replace(/\s+/g, ' ').trim()}`);
  if (campo(b, 'input_propaganda', 'propaganda')) tags.push('QUER PLACA/FAIXA');

  const cidade = campo(b, 'input_cidade', 'cidade', 'cityName') || 'Porto Alegre';
  const bairro = campo(b, 'input_bairro', 'bairro');
  const notas = [
    indicacao && `Indicado por: ${indicacao}`,
    campo(b, 'input_propaganda') && `Propaganda: ${campo(b, 'input_propaganda')}`,
    'Origem: formulário do site marciobinsely.site',
  ].filter(Boolean).join('\n');

  // Já existe? Não duplica: enriquece o cadastro e marca para conferência.
  if (existente) {
    const atualizado = await prisma.supporter.update({
      where: { id: existente.id },
      data: {
        tags: Array.from(new Set([...(existente.tags || []), ...tags])),
        email: existente.email || campo(b, 'email') || null,
        neighborhood: existente.neighborhood || bairro || null,
        notes: existente.notes ? `${existente.notes}\n--- site ---\n${notas}` : notas,
        ...(existente.status === 'BLACKLIST' ? {} : { status: 'PENDENTE' }),
      },
    });
    return res.status(200).json({ ok: true, duplicado: true, id: atualizado.id, message: 'Cadastro atualizado!' });
  }

  const city = await linkCityByName(prisma, cidade);
  const geo = fallbackLatLng({ cityName: cidade, neighborhood: bairro, seed: telefone });

  const apoiador = await prisma.supporter.create({
    data: {
      name: nome,
      phone: telefone,
      whatsapp: telefone,
      email: campo(b, 'email') || null,
      cep: onlyDigits(campo(b, 'input_cep', 'cep')) || null,
      street: campo(b, 'input_endereco', 'endereco') || null,
      neighborhood: bairro || null,
      cityName: cidade,
      cityId: city?.id || null,
      regionId: await resolverRegiao({ cityName: cidade, neighborhood: bairro, cityRegionId: city?.regionId }),
      lat: geo.lat,
      lng: geo.lng,
      instagram: campo(b, 'input_social', 'social', 'instagram') || null,
      tags,
      notes: notas,
      supportType: 'NOTICIAS',
      // "A confirmar": veio do site, ninguém da campanha falou com a pessoa ainda.
      status: black ? 'BLACKLIST' : 'PENDENTE',
      flaggedReason: black ? `Telefone consta na blacklist: ${black.reason}` : null,
    },
  });

  res.status(201).json({ ok: true, id: apoiador.id, message: 'Cadastro recebido!' });
});

export const join = asyncHandler(async (req, res) => {
  const data = joinSchema.parse(nullifyEmpty(req.body));
  const phone = onlyDigits(data.phone);

  // Trava global de velocidade (anti-bot em serverless): o rate limit por
  // instância não vale entre lambdas, então limitamos o TOTAL de cadastros
  // por minuto no banco. 60/min = pico legítimo de comício passa; enxurrada
  // de bot degrada por 1 minuto e volta.
  const recentJoins = await prisma.supporter.count({
    where: { createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recentJoins >= 60) {
    return res.status(429).json({ error: 'Estamos recebendo muitos cadastros agora. Tente novamente em instantes.' });
  }

  const [black, existing] = await Promise.all([
    prisma.blacklist.findFirst({ where: { phone } }),
    prisma.supporter.findFirst({ where: { phone } }),
  ]);

  let status = 'NOVO';
  let flaggedReason = null;
  let duplicateOfId = null;

  if (black) {
    status = 'BLACKLIST';
    flaggedReason = `Telefone consta na blacklist: ${black.reason}`;
  } else if (existing) {
    status = 'SUSPEITO';
    flaggedReason = `Telefone duplicado — já cadastrado para "${existing.name}".`;
    duplicateOfId = existing.id;
    await prisma.supporter.update({
      where: { id: existing.id },
      data: { status: 'SUSPEITO', flaggedReason: 'Telefone usado em mais de um cadastro.' },
    });
  }

  // Conexão com o mapa/filtros: vincula cidade→região e garante lat/lng
  // aproximado (centroide da cidade + jitter) quando não há coordenada.
  const cityName = data.cityName || 'Porto Alegre';
  const city = await linkCityByName(prisma, cityName);
  const geo = fallbackLatLng({ cityName, neighborhood: data.neighborhood, seed: phone });

  const supporter = await prisma.supporter.create({
    data: {
      name: data.name,
      phone,
      whatsapp: phone,
      email: data.email || null,
      neighborhood: data.neighborhood || null,
      cityName,
      cityId: city?.id || null,
      regionId: await resolverRegiao({ cityName, neighborhood: data.neighborhood, cityRegionId: city?.regionId }),
      lat: geo.lat,
      lng: geo.lng,
      supportType: data.supportType || 'NOTICIAS',
      status,
      flaggedReason,
      duplicateOfId,
    },
  });

  if (supporter.supportType === 'VOLUNTARIO' && status !== 'BLACKLIST') {
    await prisma.volunteer.create({ data: { supporterId: supporter.id } });
    const body = `Olá ${supporter.name}! 👋 Recebemos seu cadastro na campanha do Márcio Bins Ely. Responda *SIM* para confirmar sua participação. 💪`;
    const r = await sendWhatsApp({ to: phone, body });
    await prisma.conversation.create({
      data: {
        channel: 'WHATSAPP', status: 'AGUARDANDO', contactName: supporter.name, contactPhone: phone,
        supporterId: supporter.id, lastMessageAt: new Date(),
        messages: { create: { direction: 'OUTBOUND', body, channel: 'WHATSAPP', externalId: r.id } },
      },
    });
  }

  res.status(201).json({ ok: true, message: 'Cadastro recebido! Em breve entraremos em contato. 💪' });
});

export const stats = asyncHandler(async (req, res) => {
  const [supporters, volunteers, actions, banners] = await Promise.all([
    prisma.supporter.count(),
    prisma.volunteer.count(),
    prisma.streetAction.count({ where: { status: 'REALIZADA' } }),
    prisma.bannerLocation.count({ where: { status: { in: ['AUTORIZADO', 'INSTALADO'] } } }),
  ]);
  res.json({ supporters, volunteers, actions, banners });
});

export const campaign = asyncHandler(async (req, res) => {
  const row = await prisma.setting.findUnique({ where: { key: 'campaign' } });
  res.json(row?.value || {});
});

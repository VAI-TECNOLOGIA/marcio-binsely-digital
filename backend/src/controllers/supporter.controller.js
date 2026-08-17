import { z } from 'zod';
import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../utils/audit.js';
import { crudFactory } from '../utils/crudFactory.js';
import { supporterScope } from '../utils/scope.js';
import { sendWhatsApp, dispararJornada } from '../services/whatsapp.service.js';
import { SUPPORT_TYPES, SUPPORTER_STATUS } from '../utils/enums.js';
import { nullifyEmpty, onlyDigits } from '../utils/helpers.js';
import { fallbackLatLng, linkCityByName } from '../utils/geo.js';

const include = {
  region: { select: { id: true, name: true } },
  city: { select: { id: true, name: true } },
  coordinator: { select: { id: true, name: true } },
  volunteer: true,
};

const factory = crudFactory('supporter', {
  include,
  scope: supporterScope,
  // A lista de APOIADORES esconde quem já virou voluntário (tem registro em
  // Volunteer): ao ser classificado, a pessoa "sobe" para a tela de Voluntários.
  baseWhere: { volunteer: { is: null } },
  // Ordem alfabética: com 33 mil cadastros, ordenar por data de criação
  // deixava a lista sem lógica de navegação.
  orderBy: { name: 'asc' },
  searchFields: ['name', 'phone', 'email', 'cityName', 'neighborhood'],
  allowedFilters: ['status', 'supportType', 'regionId', 'cityId', 'coordinatorId'],
  arrayFilters: ['tags', 'supportTypes'],
});

// Tipos de apoio que classificam a pessoa como VOLUNTÁRIO da campanha.
const TIPOS_VOLUNTARIO = ['VOLUNTARIO', 'FAIXA_CASA', 'KIT_MATERIAL'];

export const { list, get } = factory;

/** Tags distintas da base (grupos do gabinete), com contagem — alimenta o filtro. */
export const listTags = asyncHandler(async (_req, res) => {
  const rows = await prisma.$queryRaw`
    SELECT t AS tag, count(DISTINCT "Supporter".id)::int AS total
    FROM "Supporter", unnest(tags) t
    GROUP BY t
    ORDER BY count(*) DESC, t ASC
  `;
  res.json({ data: rows });
});

const createSchema = z.object({
  name: z.string().min(2, 'Nome obrigatório'),
  // Opcional: a base importada do gabinete tem contatos só com nome/endereço.
  // O cadastro público (/public/join) continua exigindo telefone.
  phone: z.string().min(8, 'Telefone muito curto').nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  cpf: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  cep: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  number: z.string().nullable().optional(),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  cityName: z.string().nullable().optional(),
  cityId: z.string().uuid().nullable().optional(),
  regionId: z.string().uuid().nullable().optional(),
  lat: z.coerce.number().nullable().optional(),
  lng: z.coerce.number().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  instagram: z.string().nullable().optional(),
  facebook: z.string().nullable().optional(),
  supportType: z.enum(SUPPORT_TYPES).optional(),
  supportTypes: z.array(z.enum(SUPPORT_TYPES)).optional(),
  status: z.enum(SUPPORTER_STATUS).optional(),
  notes: z.string().nullable().optional(),
  coordinatorId: z.string().uuid().nullable().optional(),
  // Grupos (ex.: "MULTIPLICADORES 2026"). Livre: a campanha cria os que precisar.
  tags: z.array(z.string()).optional(),
  // Quem indicou este apoiador (campo dedicado; vira a tag INDICAÇÃO).
  indicante: z.string().nullable().optional(),
});

const PREFIXO_INDICACAO = 'INDICAÇÃO: ';
const TAGS_INTERNAS = ['BASE HISTÓRICA']; // marcadores que o form não mostra, mas devem sobreviver

/**
 * Monta o array final de tags a partir das partes que a interface controla
 * separadamente: grupos (campo Grupos), quem indicou (campo dedicado) e os
 * marcadores internos, que são preservados mesmo sem aparecer no formulário.
 */
function montarTags({ grupos, indicante, tagsExistentes = [] }) {
  const norm = (t) => String(t).trim().toUpperCase();

  // Grupos digitados, já sem a indicação (ela tem campo próprio).
  const gruposLimpos = (Array.isArray(grupos) ? grupos : [])
    .map(norm)
    .filter((t) => t && !t.startsWith(PREFIXO_INDICACAO));

  // Indicação: usa o campo se veio; senão preserva a que já existia.
  let indicacao = tagsExistentes.find((t) => t.startsWith(PREFIXO_INDICACAO)) || null;
  if (indicante !== undefined) {
    const nome = String(indicante || '').trim().toUpperCase();
    indicacao = nome ? PREFIXO_INDICACAO + nome : null;
  }

  const internas = tagsExistentes.filter((t) => TAGS_INTERNAS.includes(t));

  return [...new Set([...gruposLimpos, ...internas, ...(indicacao ? [indicacao] : [])])];
}

/**
 * Aplica a "corrente" do tipo de apoio: se marcou Voluntário / Faixa / Kit, a
 * pessoa vira VOLUNTÁRIO (sai de Apoiadores) e cada item gera seu destino —
 * Faixa → lista de Faixas; Kit → Pedidos de Material. Idempotente (não duplica).
 */
export async function sincronizarDestinos(supporterId, { confirmar = false, userId = null } = {}) {
  const s = await prisma.supporter.findUnique({ where: { id: supporterId }, include: { volunteer: true } });
  if (!s || s.status === 'BLACKLIST') return;
  const tipos = Array.isArray(s.supportTypes) ? s.supportTypes : [];
  if (!tipos.some((t) => TIPOS_VOLUNTARIO.includes(t))) return;

  const fone = s.whatsapp || s.phone;
  let vol = s.volunteer;
  if (!vol) {
    vol = await prisma.volunteer.create({ data: { supporterId } });
    // Só pede confirmação quando NÃO vai confirmar agora (senão manda "confirme?" e "confirmado!" juntos).
    if (!confirmar) dispararJornada('voluntario_confirmacao', fone, [s.name]);
  }
  if (confirmar && !vol.confirmed) {
    await prisma.volunteer.update({
      where: { id: vol.id },
      data: { confirmed: true, active: true, confirmationStatus: 'CONFIRMADO', confirmedAt: new Date() },
    });
    await prisma.supporter.update({ where: { id: supporterId }, data: { status: 'CONFIRMADO' } });
    dispararJornada('voluntario_bem_vindo', fone, [s.name]); // jornada: participação confirmada
  }

  if (tipos.includes('FAIXA_CASA')) {
    const existe = await prisma.bannerLocation.findFirst({ where: { supporterId } });
    if (!existe) {
      await prisma.bannerLocation.create({
        data: {
          supporterId, responsibleName: s.name, phone: s.whatsapp || s.phone || null,
          address: [s.street, s.number].filter(Boolean).join(', ') || null,
          neighborhood: s.neighborhood, cityName: s.cityName, lat: s.lat, lng: s.lng,
          authorized: true, authorizedAt: new Date(), status: 'AGUARDANDO_INSTALACAO',
          notes: 'Marcou "Faixa na minha casa" no tipo de apoio.',
        },
      });
      dispararJornada('faixa_recebida', fone, [s.name, [s.street, s.number].filter(Boolean).join(', ') || s.neighborhood || 'seu endereço']);
    }
  }

  if (tipos.includes('KIT_MATERIAL')) {
    const existe = await prisma.materialRequest.findFirst({ where: { supporterId, materialName: 'Kit de material' } });
    if (!existe) {
      await prisma.materialRequest.create({
        data: {
          materialName: 'Kit de material', materials: ['Kit de material'], quantity: 1, status: 'SOLICITADO',
          supporterId, requesterId: userId || null,
          cityName: s.cityName, neighborhood: s.neighborhood,
          deliveryAddress: [s.street, s.number, s.complement].filter(Boolean).join(', ') || null,
          justification: `${s.name} pediu o kit de material (tipo de apoio).`,
        },
      });
      dispararJornada('material_recebido', fone, [s.name]);
    }
  }
}

/** Deriva o tipo principal (legado) a partir da multi-seleção. */
function tipoPrincipal(tipos) {
  if (!Array.isArray(tipos) || !tipos.length) return null;
  return tipos.includes('VOLUNTARIO') ? 'VOLUNTARIO' : tipos[0];
}

export const create = asyncHandler(async (req, res) => {
  const data = createSchema.parse(nullifyEmpty(req.body));
  const phone = onlyDigits(data.phone);
  // "Quem indicou" vira a tag INDICAÇÃO (junto com os grupos digitados).
  if (data.tags !== undefined || data.indicante !== undefined) {
    data.tags = montarTags({ grupos: data.tags, indicante: data.indicante });
  }
  delete data.indicante;

  // Multi-seleção do tipo de apoio: define o principal (legado) p/ coluna e relatórios.
  if (data.supportTypes?.length) data.supportType = tipoPrincipal(data.supportTypes);

  const [black, existing] = await Promise.all([
    prisma.blacklist.findFirst({ where: { phone } }),
    prisma.supporter.findFirst({ where: { phone } }),
  ]);

  let status = data.status || 'NOVO';
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

  // Conexão com o mapa: sem lat/lng manual, usa centroide da cidade + jitter.
  // Sem cityId, tenta vincular pela cidade digitada (habilita filtro por região).
  if (!data.cityId && data.cityName) {
    const city = await linkCityByName(prisma, data.cityName);
    if (city) {
      data.cityId = city.id;
      if (!data.regionId) data.regionId = city.regionId;
    }
  }
  if (data.lat == null || data.lng == null) {
    const geo = fallbackLatLng({ cityName: data.cityName, neighborhood: data.neighborhood, seed: phone });
    data.lat = geo.lat;
    data.lng = geo.lng;
  }

  const supporter = await prisma.supporter.create({
    data: {
      ...data,
      phone,
      whatsapp: onlyDigits(data.whatsapp) || phone,
      birthDate: data.birthDate ? new Date(data.birthDate) : null,
      status,
      flaggedReason,
      duplicateOfId,
    },
    include,
  });

  // Corrente: se marcou Voluntário/Faixa/Kit, vira voluntário + gera destinos.
  // Os avisos (voluntário/faixa/material) saem por template dentro de sincronizarDestinos
  // — não usar mais o texto livre, que falha fora da janela de 24h.
  if (status !== 'BLACKLIST') {
    await sincronizarDestinos(supporter.id, { confirmar: true, userId: req.user?.id });
  }

  await audit({
    userId: req.user?.id,
    action: 'CREATE',
    entity: 'Supporter',
    entityId: supporter.id,
    changes: { status, flaggedReason },
    ip: req.ip,
  });

  res.status(201).json({ supporter, warning: flaggedReason });
});

/**
 * Mantém a tabela Blacklist (a tela) espelhando o status do apoiador — o card
 * do dashboard, a tela e o bloqueio de disparos leem a MESMA fonte.
 */
export async function sincronizarBlacklist(supporter, { entrar, reason, userId }) {
  const porTelefone = supporter.phone ? { phone: supporter.phone } : { phone: null, name: supporter.name };
  if (entrar) {
    const ja = await prisma.blacklist.findFirst({ where: porTelefone });
    if (!ja) {
      await prisma.blacklist.create({
        data: { phone: supporter.phone, cpf: supporter.cpf, name: supporter.name, reason: reason || 'Marcado na base de apoiadores', createdById: userId || null },
      });
    }
    // Quem entra na blacklist SAI de Voluntários (o cadastro segue na base,
    // marcado). A corrente de destinos ignora BLACKLIST, então não volta.
    await prisma.volunteer.deleteMany({ where: { supporterId: supporter.id } });
  } else {
    await prisma.blacklist.deleteMany({ where: porTelefone });
  }
}

export const update = asyncHandler(async (req, res) => {
  const data = nullifyEmpty(req.body);
  if (data.birthDate) data.birthDate = new Date(data.birthDate);
  if (data.phone) data.phone = onlyDigits(data.phone);
  if (Array.isArray(data.supportTypes) && data.supportTypes.length) data.supportType = tipoPrincipal(data.supportTypes);
  const anterior = data.status !== undefined
    ? await prisma.supporter.findUnique({ where: { id: req.params.id }, select: { status: true } })
    : null;

  // Grupos (campo Grupos) + quem indicou (campo dedicado) + marcadores
  // internos (preservados). Só busca o estado atual quando algum dos dois veio.
  if (data.tags !== undefined || data.indicante !== undefined) {
    const atual = await prisma.supporter.findUnique({
      where: { id: req.params.id },
      select: { tags: true },
    });
    data.tags = montarTags({
      grupos: data.tags !== undefined ? data.tags : atual?.tags,
      indicante: data.indicante,
      tagsExistentes: atual?.tags || [],
    });
  }
  delete data.indicante;
  delete data.id;
  delete data.volunteer;
  delete data.region;
  delete data.city;
  delete data.coordinator;
  const supporter = await prisma.supporter.update({ where: { id: req.params.id }, data, include });
  // Status mudou de/para BLACKLIST na edição comum → espelha na tabela da tela.
  if (anterior && data.status && data.status !== anterior.status) {
    if (data.status === 'BLACKLIST') {
      await sincronizarBlacklist(supporter, { entrar: true, reason: data.flaggedReason, userId: req.user?.id });
    } else if (anterior.status === 'BLACKLIST') {
      await sincronizarBlacklist(supporter, { entrar: false });
    }
  }
  // Corrente: marcar Voluntário/Faixa/Kit e salvar → vira voluntário + destinos.
  await sincronizarDestinos(supporter.id, { confirmar: true, userId: req.user?.id });
  const atualizado = await prisma.supporter.findUnique({ where: { id: supporter.id }, include });
  await audit({ userId: req.user?.id, action: 'UPDATE', entity: 'Supporter', entityId: supporter.id, ip: req.ip });
  res.json(atualizado);
});

export const remove = asyncHandler(async (req, res) => {
  await prisma.supporter.delete({ where: { id: req.params.id } });
  await audit({ userId: req.user?.id, action: 'DELETE', entity: 'Supporter', entityId: req.params.id, ip: req.ip });
  res.status(204).send();
});

export const listSuspects = asyncHandler(async (req, res) => {
  const where = { status: 'SUSPEITO' };
  const busca = (req.query.search || '').trim();
  if (busca) {
    where.OR = ['name', 'phone', 'email', 'cityName', 'neighborhood'].map((f) => ({
      [f]: { contains: busca, mode: 'insensitive' },
    }));
  }
  const data = await prisma.supporter.findMany({
    where,
    include: { ...include, duplicateOf: { select: { id: true, name: true, phone: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ data });
});

export const confirmVolunteer = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { helpPreference } = req.body;
  const supporter = await prisma.supporter.findUnique({ where: { id }, include: { volunteer: true } });
  if (!supporter) throw new AppError('Apoiador não encontrado', 404);

  let volunteer = supporter.volunteer;
  if (!volunteer) volunteer = await prisma.volunteer.create({ data: { supporterId: id } });

  const updated = await prisma.volunteer.update({
    where: { id: volunteer.id },
    data: {
      confirmed: true,
      confirmedAt: new Date(),
      confirmationChannel: 'WHATSAPP',
      active: true,
      helpPreference: helpPreference || volunteer.helpPreference,
    },
  });

  await prisma.supporter.update({ where: { id }, data: { status: 'CONFIRMADO' } });
  await prisma.volunteerStatusHistory.create({
    data: {
      volunteerId: volunteer.id,
      fromStatus: supporter.status,
      toStatus: 'CONFIRMADO',
      reason: 'Confirmação via WhatsApp',
      changedById: req.user?.id,
    },
  });

  res.json(updated);
});

export const toBlacklist = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const s = await prisma.supporter.findUnique({ where: { id } });
  if (!s) throw new AppError('Apoiador não encontrado', 404);

  await sincronizarBlacklist(s, { entrar: true, reason: reason || 'Marcado manualmente', userId: req.user?.id });
  const updated = await prisma.supporter.update({
    where: { id },
    data: { status: 'BLACKLIST', flaggedReason: reason || 'Movido para blacklist' },
  });
  await audit({ userId: req.user?.id, action: 'BLACKLIST', entity: 'Supporter', entityId: id, ip: req.ip });
  res.json(updated);
});

async function sendConfirmation(supporter) {
  const body = `Olá ${supporter.name}! 👋 Aqui é da campanha do Márcio Bins Ely. Recebemos seu cadastro como voluntário(a). Você confirma sua participação? Responda *SIM* para confirmar. 💪`;
  const result = await sendWhatsApp({ to: supporter.whatsapp || supporter.phone, body });
  await prisma.conversation.create({
    data: {
      channel: 'WHATSAPP',
      status: 'AGUARDANDO',
      contactName: supporter.name,
      contactPhone: supporter.phone,
      supporterId: supporter.id,
      lastMessageAt: new Date(),
      messages: {
        create: { direction: 'OUTBOUND', body, channel: 'WHATSAPP', externalId: result.id },
      },
    },
  });
}

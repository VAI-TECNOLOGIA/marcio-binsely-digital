import { crudFactory } from '../utils/crudFactory.js';
import { resourceRouter } from './resourceRouter.js';
import { regionScopeWithGlobal } from '../utils/scope.js';
import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { dispararJornada } from '../services/whatsapp.service.js';

// Assunto legível da demanda (variável {{2}} dos templates de demanda).
const ASSUNTO_DEMANDA = {
  SAUDE: 'saúde', EDUCACAO: 'educação', INFRAESTRUTURA: 'infraestrutura',
  SEGURANCA: 'segurança', EMPREGO: 'emprego', TRANSPORTE: 'transporte', OUTROS: 'sua solicitação',
};
const assuntoDemanda = (d) => ASSUNTO_DEMANDA[d.category] || 'sua solicitação';

// Hierarquia: LIDER (total) · MEMBRO (equipe interna) · PARCEIRO (externo).
// As antigas siglas viram aliases dos novos níveis para preservar a lógica.
const A = 'LIDER';   // antes ADMIN
const C = 'MEMBRO';  // antes COORDINATOR
const S = 'MEMBRO';  // antes SUPERVISOR
const MK = 'MEMBRO'; // antes MARKETING
const MT = 'MEMBRO'; // antes MATERIALS
const SP = 'MEMBRO'; // antes SUPPORT

// 6 — Mural de avisos
export const notices = resourceRouter(
  crudFactory('notice', {
    // Mural de avisos: mais recentes primeiro (não em ordem alfabética).
    sortField: 'createdAt',
    orderBy: { createdAt: 'desc' },
    searchFields: ['title', 'description'],
    include: { author: { select: { name: true } }, region: { select: { name: true } } },
    allowedFilters: ['type', 'priority', 'status', 'regionId'],
    scope: regionScopeWithGlobal,
    dateFields: ['publishDate'],
    writableFields: ['title', 'description', 'type', 'priority', 'publishDate', 'attachmentUrl', 'externalLink', 'status', 'regionId', 'authorId'],
    transformIn: (d, req) => ({ ...d, authorId: d.authorId || req.user?.id }),
  }),
  { writeRoles: [A, C] }
);

// 7 — Mídia Kit
export const mediaKit = resourceRouter(
  crudFactory('mediaKit', {
    sortField: 'title',
    orderBy: { title: 'asc' },
    searchFields: ['title', 'description', 'hashtags'],
    include: { author: { select: { name: true } }, region: { select: { name: true } } },
    allowedFilters: ['type', 'status', 'network', 'priority', 'regionId'],
    dateFields: ['publishDate'],
    writableFields: ['title', 'description', 'type', 'fileUrl', 'thumbnailUrl', 'captionText', 'hashtags', 'network', 'priority', 'status', 'publishDate', 'guidance', 'regionId', 'authorId'],
    transformIn: (d, req) => ({ ...d, authorId: d.authorId || req.user?.id }),
  }),
  { writeRoles: [A, MK] }
);

// 8 — Tarefas de engajamento
export const tasks = resourceRouter(
  crudFactory('task', {
    sortField: 'title',
    orderBy: { title: 'asc' },
    searchFields: ['title', 'description'],
    allowedFilters: ['type', 'active'],
    numberFields: ['points'],
    boolFields: ['active'],
    writableFields: ['type', 'title', 'description', 'points', 'active', 'volunteerId'],
  }),
  { writeRoles: [A] }
);

// 9 — Catálogo de materiais físicos
export const materials = resourceRouter(
  crudFactory('material', {
    orderBy: { name: 'asc' },
    searchFields: ['name', 'category'],
    allowedFilters: ['category', 'active'],
    numberFields: ['stock'],
    boolFields: ['active'],
    writableFields: ['name', 'category', 'unit', 'stock', 'active'],
  }),
  { writeRoles: [A, MT] }
);

// 10 — Faixas em casas
export const banners = resourceRouter(
  crudFactory('bannerLocation', {
    sortField: 'responsibleName',
    orderBy: { responsibleName: 'asc' },
    searchFields: ['responsibleName', 'address', 'cityName', 'neighborhood'],
    include: { supporter: { select: { name: true } } },
    allowedFilters: ['status', 'cityName'],
    numberFields: ['lat', 'lng'],
    boolFields: ['authorized'],
    dateFields: ['authorizedAt'],
    writableFields: ['responsibleName', 'phone', 'address', 'cityName', 'neighborhood', 'lat', 'lng', 'housePhotoUrl', 'bannerPhotoUrl', 'authorized', 'authorizedAt', 'status', 'notes', 'supporterId'],
    // Jornada: avisa quando a faixa é instalada.
    afterChange: (item, req, action, before) => {
      if (item.status === 'INSTALADO' && before?.status !== 'INSTALADO') {
        dispararJornada('faixa_instalada', item.phone, [item.responsibleName || 'apoiador(a)', item.address || item.neighborhood || 'seu endereço']);
      }
    },
  }),
  { writeRoles: [A, C, S], readRoles: [A, C] } // endereços de apoiadores — não expor a apoiador
);

// 12 — Ações de rua
export const streetActions = resourceRouter(
  crudFactory('streetAction', {
    // Ações de rua têm data: ordena por data (mais recentes primeiro).
    sortField: 'date',
    orderBy: { date: 'desc' },
    searchFields: ['title', 'cityName', 'neighborhood', 'address'],
    include: { coordinator: { select: { name: true } }, region: { select: { name: true } } },
    allowedFilters: ['type', 'status', 'regionId', 'cityName'],
    scope: regionScopeWithGlobal,
    dateFields: ['date'],
    numberFields: ['peopleReached', 'lat', 'lng'],
    writableFields: ['type', 'title', 'cityName', 'cityId', 'neighborhood', 'address', 'lat', 'lng', 'date', 'description', 'team', 'peopleReached', 'photos', 'notes', 'status', 'regionId', 'coordinatorId'],
    transformIn: (d, req) => ({ ...d, coordinatorId: d.coordinatorId || req.user?.id }),
  }),
  { writeRoles: [A, C, S], readRoles: [A, C] } // planejamento de campo — só equipe
);

// 13 — Agenda / eventos
export const events = resourceRouter(
  crudFactory('event', {
    // sortField 'date' garante ordem por data mesmo se o front pedir ?ordem=az
    // (cache antigo). O padrão ordena por data e, dentro dela, por horário.
    sortField: 'date',
    searchFields: ['title', 'location', 'cityName'],
    include: { responsible: { select: { name: true } }, region: { select: { name: true } } },
    allowedFilters: ['status', 'regionId', 'cityName'],
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
    dateFields: ['date'],
    writableFields: ['title', 'description', 'location', 'cityName', 'cityId', 'neighborhood', 'date', 'time', 'participants', 'status', 'regionId', 'responsibleId'],
    // A data do evento é dia-cheio (o horário fica no campo `time`). Fixa ao
    // meio-dia UTC para não "voltar" um dia ao exibir no fuso do Brasil (UTC-3).
    transformIn: (d) => {
      if (d.date instanceof Date && !Number.isNaN(d.date.getTime())) {
        d.date = new Date(Date.UTC(d.date.getUTCFullYear(), d.date.getUTCMonth(), d.date.getUTCDate(), 12, 0, 0));
      }
      return d;
    },
  }),
  { writeRoles: [A, C] }
);

// 16 — Demandas da população (Kanban via status)
export const demands = resourceRouter(
  crudFactory('demand', {
    sortField: 'citizenName',
    searchFields: ['citizenName', 'description', 'cityName', 'neighborhood'],
    include: { responsible: { select: { name: true } } },
    allowedFilters: ['status', 'category', 'priority', 'cityName'],
    writableFields: ['citizenName', 'phone', 'cityName', 'cityId', 'neighborhood', 'category', 'description', 'priority', 'status', 'history', 'responsibleId'],
    // Histórico por demanda: registra a criação e cada troca de status
    // (status anterior → novo, data e autor).
    transformIn: async (d, req) => {
      const em = new Date().toISOString();
      const por = req.user?.name || null;
      if (!req.params?.id) {
        return { ...d, history: [{ tipo: 'criada', para: d.status || 'NOVA', em, por }] };
      }
      if (d.status) {
        const atual = await prisma.demand.findUnique({ where: { id: req.params.id }, select: { status: true, history: true } });
        if (atual && atual.status !== d.status) {
          const hist = Array.isArray(atual.history) ? atual.history : [];
          return { ...d, history: [...hist, { tipo: 'status', de: atual.status, para: d.status, em, por }] };
        }
      }
      return d;
    },
    // Jornada: cidadão recebe aviso ao registrar e ao resolver a demanda.
    afterChange: (item, req, action, before) => {
      if (action === 'create') dispararJornada('demanda_recebida', item.phone, [item.citizenName, assuntoDemanda(item)]);
      else if (item.status === 'RESOLVIDA' && before?.status !== 'RESOLVIDA') dispararJornada('demanda_resolvida', item.phone, [item.citizenName, assuntoDemanda(item)]);
    },
  }),
  { writeRoles: [A, SP, C], readRoles: [A, C] } // demandas de cidadãos (dados pessoais) — só equipe
);

// 15 — Automações de relacionamento
export const automations = resourceRouter(
  crudFactory('automation', {
    orderBy: { name: 'asc' },
    searchFields: ['name', 'message'],
    allowedFilters: ['type', 'status'],
    dateFields: ['triggerDate'],
    writableFields: ['name', 'type', 'message', 'audience', 'triggerDate', 'status'],
  }),
  { writeRoles: [A, MK], readRoles: [A, C] } // configuração interna — só equipe
);

// Regiões
export const regions = resourceRouter(
  crudFactory('region', {
    searchFields: ['name'],
    include: {
      _count: { select: { cities: true, supporters: true } },
      coordinator: { select: { id: true, name: true, phone: true, email: true, role: true } },
    },
    orderBy: { name: 'asc' },
    writableFields: ['name', 'uf', 'color', 'coordinatorId'],
  }),
  { writeRoles: [A], readRoles: [A, C] } // expõe coordenadores — só equipe
);

// Cidades
export const cities = resourceRouter(
  crudFactory('city', {
    searchFields: ['name'],
    include: { region: { select: { name: true } } },
    allowedFilters: ['regionId'],
    orderBy: { name: 'asc' },
    writableFields: ['name', 'uf', 'regionId'],
  }),
  { writeRoles: [A], readRoles: [A, C] }
);

// Blacklist — create/remove customizados para manter o STATUS do apoiador em
// espelho com a tabela (a tela, o card do dashboard e o bloqueio de disparos
// leem a mesma fonte).
const blacklistFactory = crudFactory('blacklist', {
  orderBy: { name: 'asc' },
  searchFields: ['name', 'phone', 'cpf', 'reason'],
  writableFields: ['phone', 'cpf', 'name', 'reason', 'createdById'],
  transformIn: (d, req) => ({ ...d, createdById: d.createdById || req.user?.id }),
});

const blacklistCreate = asyncHandler(async (req, res) => {
  const { name, cpf, reason } = req.body || {};
  if (!reason || String(reason).trim().length < 2) throw new AppError('Informe o motivo.', 400);
  const phone = req.body?.phone ? String(req.body.phone).replace(/\D/g, '') : null;
  const row = await prisma.blacklist.create({
    data: { phone: phone || null, cpf: cpf || null, name: name || null, reason, createdById: req.user?.id || null },
  });
  if (phone) {
    await prisma.supporter.updateMany({
      where: { phone, status: { not: 'BLACKLIST' } },
      data: { status: 'BLACKLIST', flaggedReason: `Incluído na blacklist: ${reason}` },
    });
    // Bloqueado sai de Voluntários (o cadastro segue na base, marcado).
    await prisma.volunteer.deleteMany({ where: { supporter: { phone } } });
  }
  res.status(201).json(row);
});

const blacklistRemove = asyncHandler(async (req, res) => {
  const row = await prisma.blacklist.findUnique({ where: { id: req.params.id } });
  if (!row) throw new AppError('Registro não encontrado', 404);
  await prisma.blacklist.delete({ where: { id: row.id } });
  // Libera o(s) apoiador(es) correspondente(s) — sem isso o dashboard seguiria contando.
  const alvo = row.phone ? { phone: row.phone } : row.name ? { name: row.name, phone: null } : null;
  if (alvo) {
    await prisma.supporter.updateMany({
      where: { ...alvo, status: 'BLACKLIST' },
      data: { status: 'ATIVO', flaggedReason: null },
    });
  }
  res.status(204).send();
});

export const blacklist = resourceRouter(
  { ...blacklistFactory, create: blacklistCreate, remove: blacklistRemove },
  { writeRoles: [A], readRoles: [A] } // Blacklist: somente LÍDER (lê e escreve)
);

// Perfis / Roles
export const roles = resourceRouter(
  crudFactory('role', { orderBy: { name: 'asc' }, writableFields: ['name', 'description', 'permissions'] }),
  { writeRoles: [A], readRoles: [A] }
);

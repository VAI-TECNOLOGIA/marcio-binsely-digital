import { crudFactory } from '../utils/crudFactory.js';
import { resourceRouter } from './resourceRouter.js';
import { regionScopeWithGlobal } from '../utils/scope.js';
import prisma from '../config/prisma.js';

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
  }),
  { writeRoles: [A, C, S] }
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
  { writeRoles: [A, C, S] }
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
  }),
  { writeRoles: [A, SP, C] }
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
  { writeRoles: [A, MK] }
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
  { writeRoles: [A] }
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
  { writeRoles: [A] }
);

// Blacklist
export const blacklist = resourceRouter(
  crudFactory('blacklist', {
    orderBy: { name: 'asc' },
    searchFields: ['name', 'phone', 'cpf', 'reason'],
    writableFields: ['phone', 'cpf', 'name', 'reason', 'createdById'],
    transformIn: (d, req) => ({ ...d, createdById: d.createdById || req.user?.id }),
  }),
  { writeRoles: [A] } // Blacklist: somente LÍDER
);

// Perfis / Roles
export const roles = resourceRouter(
  crudFactory('role', { orderBy: { name: 'asc' }, writableFields: ['name', 'description', 'permissions'] }),
  { writeRoles: [A] }
);

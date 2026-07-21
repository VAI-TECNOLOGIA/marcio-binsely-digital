import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { volunteerRanking } from '../services/score.service.js';

const include = {
  supporter: {
    select: {
      id: true, name: true, phone: true, whatsapp: true, cityName: true, neighborhood: true,
      photoUrl: true, status: true, regionId: true,
    },
  },
  supervisor: { select: { id: true, name: true } },
};

export const list = asyncHandler(async (req, res) => {
  const u = req.user;
  const where = {};
  // Hierarquia: LÍDER e MEMBRO (equipe interna) enxergam todos os voluntários.
  if (req.query.active === 'true' || req.query.active === 'false') where.active = req.query.active === 'true';
  if (req.query.confirmed === 'true' || req.query.confirmed === 'false') where.confirmed = req.query.confirmed === 'true';
  if (req.query.confirmationStatus) where.confirmationStatus = req.query.confirmationStatus;
  if (req.query.search) {
    where.supporter = { ...(where.supporter || {}), name: { contains: req.query.search, mode: 'insensitive' } };
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Number(req.query.pageSize) || 20);
  const [data, total] = await Promise.all([
    prisma.volunteer.findMany({ where, include, orderBy: { totalScore: 'desc' }, take: pageSize, skip: (page - 1) * pageSize }),
    prisma.volunteer.count({ where }),
  ]);
  res.json({ data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 } });
});

export const get = asyncHandler(async (req, res) => {
  const v = await prisma.volunteer.findUnique({
    where: { id: req.params.id },
    include: {
      ...include,
      engagements: { orderBy: { createdAt: 'desc' }, take: 30, include: { task: true } },
      statusHistory: { orderBy: { createdAt: 'desc' } },
      scores: { orderBy: { createdAt: 'desc' }, take: 30 },
    },
  });
  if (!v) throw new AppError('Voluntário não encontrado', 404);
  res.json(v);
});

/**
 * Confirma / cancela / devolve para "a confirmar" um voluntário.
 * Mantém `confirmed` em sincronia e registra a mudança no histórico.
 */
export const setConfirmation = asyncHandler(async (req, res) => {
  const VALIDOS = ['A_CONFIRMAR', 'CONFIRMADO', 'CANCELADO'];
  const { status } = req.body;
  if (!VALIDOS.includes(status)) {
    throw new AppError(`Situação inválida. Use: ${VALIDOS.join(', ')}`, 400);
  }

  const atual = await prisma.volunteer.findUnique({
    where: { id: req.params.id },
    include: { supporter: { select: { id: true } } },
  });
  if (!atual) throw new AppError('Voluntário não encontrado', 404);

  const confirmado = status === 'CONFIRMADO';

  // Espelha no apoiador ANTES de reler o voluntário, senão o `include`
  // devolveria o apoiador com o status anterior.
  // O histórico é tipado como SupporterStatus, então converte antes de gravar.
  const paraApoiador = { CONFIRMADO: 'CONFIRMADO', CANCELADO: 'INATIVO', A_CONFIRMAR: 'PENDENTE' };
  await prisma.supporter.update({
    where: { id: atual.supporterId },
    data: { status: paraApoiador[status] },
  });

  const v = await prisma.volunteer.update({
    where: { id: req.params.id },
    data: {
      confirmationStatus: status,
      confirmed: confirmado,
      confirmedAt: confirmado ? atual.confirmedAt || new Date() : null,
      // Cancelado sai da operação; confirmado entra.
      ...(status === 'CANCELADO' ? { active: false } : {}),
      ...(confirmado ? { active: true } : {}),
    },
    include,
  });

  await prisma.volunteerStatusHistory.create({
    data: {
      volunteerId: v.id,
      fromStatus: paraApoiador[atual.confirmationStatus] || null,
      toStatus: paraApoiador[status],
      reason: req.body.reason || 'Alterado na tela de Voluntários',
      changedById: req.user?.id,
    },
  });

  res.json(v);
});

export const update = asyncHandler(async (req, res) => {
  const { active, supervisorId, helpPreference } = req.body;
  const v = await prisma.volunteer.update({
    where: { id: req.params.id },
    data: {
      ...(active !== undefined ? { active: !!active } : {}),
      ...(supervisorId !== undefined ? { supervisorId: supervisorId || null } : {}),
      ...(helpPreference !== undefined ? { helpPreference } : {}),
    },
    include,
  });
  res.json(v);
});

export const ranking = asyncHandler(async (req, res) => {
  const data = await volunteerRanking({
    limit: Number(req.query.limit) || 20,
    regionId: req.query.regionId || undefined,
    supervisorId: req.query.supervisorId || undefined,
  });
  res.json({ data: data.map((v, i) => ({ rank: i + 1, ...v })) });
});

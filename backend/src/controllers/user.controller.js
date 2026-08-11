import { z } from 'zod';
import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword } from '../utils/password.js';
import { USER_ROLES } from '../utils/enums.js';
import { nullifyEmpty, onlyDigits } from '../utils/helpers.js';
import { signSetupToken } from '../utils/jwt.js';
import { enviarAcessoLiberado } from '../services/whatsapp.service.js';
import { audit } from '../utils/audit.js';

const select = {
  id: true, name: true, email: true, role: true, phone: true, active: true,
  avatarUrl: true, regionId: true, managerId: true,
  region: { select: { name: true } }, createdAt: true,
};

export const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.role) where.role = req.query.role;
  if (req.query.search) {
    where.OR = [
      { name: { contains: req.query.search, mode: 'insensitive' } },
      { email: { contains: req.query.search, mode: 'insensitive' } },
    ];
  }
  const data = await prisma.user.findMany({ where, select, orderBy: { name: 'asc' } });
  res.json({ data });
});

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(USER_ROLES),
  phone: z.string().nullable().optional(),
  regionId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
});

export const create = asyncHandler(async (req, res) => {
  const data = createSchema.parse(nullifyEmpty(req.body));
  const exists = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (exists) throw new AppError('E-mail já cadastrado', 409);
  const user = await prisma.user.create({
    data: { ...data, email: data.email.toLowerCase(), password: await hashPassword(data.password) },
    select,
  });
  res.status(201).json(user);
});

export const update = asyncHandler(async (req, res) => {
  const data = nullifyEmpty(req.body);
  ['id', 'region', 'createdAt'].forEach((k) => delete data[k]);
  if (data.password) data.password = await hashPassword(data.password);
  else delete data.password;
  if (data.email) data.email = data.email.toLowerCase();
  const user = await prisma.user.update({ where: { id: req.params.id }, data, select });
  res.json(user);
});

export const remove = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw new AppError('Você não pode remover o próprio usuário', 400);
  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

/**
 * Aprova o usuário e envia o acesso por WhatsApp (template oficial UTILITY).
 * A mensagem leva o login (e-mail) + um link para a própria pessoa criar a
 * senha — nunca enviamos senha em texto (a Meta não aprova, e é mais seguro).
 */
export const enviarAcesso = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new AppError('Usuário não encontrado', 404);

  const phone = onlyDigits(user.phone || '');
  if (!phone) {
    throw new AppError('Este usuário não tem WhatsApp cadastrado. Adicione o telefone antes de enviar o acesso.', 400);
  }

  // "Aprovar" = garantir o usuário ativo + gerar o link de primeiro acesso
  // (reaproveita o resetToken; a pessoa define a senha ao clicar).
  const token = signSetupToken({ sub: user.id });
  await prisma.user.update({
    where: { id: user.id },
    data: { active: true, resetToken: token, resetTokenExpires: new Date(Date.now() + 3 * 24 * 3600_000) },
  });

  const nome = (user.name || '').split(' ')[0] || user.name || '';
  const result = await enviarAcessoLiberado({ to: phone, nome, email: user.email, token });
  if (result?.success === false) {
    throw new AppError(result.error || 'Não foi possível enviar pelo WhatsApp.', 502);
  }

  await audit({ userId: req.user?.id, action: 'SEND_ACCESS', entity: 'User', entityId: user.id, ip: req.ip });
  res.json({ ok: true, message: 'Acesso enviado por WhatsApp.' });
});

/**
 * Notificações push (FCM) — registro de token do dispositivo e envio manual.
 *
 * - POST /notifications/subscribe  (autenticado): o app mobile registra seu
 *   token FCM após o login. Upsert por token (um mesmo aparelho troca de dono
 *   se outro usuário logar nele).
 * - DELETE /notifications/subscribe (autenticado): remove o token no logout.
 * - POST /notifications/send (LIDER): dispara uma notificação para um usuário
 *   específico ou para todos com token registrado. Limpa tokens inválidos.
 */
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { sendPush, getPushStatus } from '../services/push.service.js';

const subscribeSchema = z.object({
  token: z.string().min(10, 'token FCM inválido'),
  platform: z.enum(['android', 'ios', 'web']).nullable().optional(),
});

/** POST /notifications/subscribe — registra/atualiza o token do dispositivo. */
export const subscribe = asyncHandler(async (req, res) => {
  const { token, platform } = subscribeSchema.parse(req.body);

  const record = await prisma.pushToken.upsert({
    where: { token },
    create: { token, platform: platform ?? null, userId: req.user.id },
    update: { userId: req.user.id, platform: platform ?? null },
    select: { id: true, platform: true, createdAt: true, updatedAt: true },
  });

  res.status(201).json({ ok: true, id: record.id });
});

/** DELETE /notifications/subscribe — remove o token (logout / desinstalação). */
export const unsubscribe = asyncHandler(async (req, res) => {
  const token = req.body?.token;
  if (token) {
    await prisma.pushToken.deleteMany({ where: { token, userId: req.user.id } });
  }
  res.json({ ok: true });
});

const sendSchema = z.object({
  userId: z.string().uuid().nullable().optional(), // ausente = todos
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  url: z.string().max(500).nullable().optional(), // deep-link ao tocar
});

/** POST /notifications/send — LIDER envia notificação (1 usuário ou broadcast). */
export const send = asyncHandler(async (req, res) => {
  const { userId, title, body, url } = sendSchema.parse(req.body);

  const rows = await prisma.pushToken.findMany({
    where: userId ? { userId } : {},
    select: { token: true },
  });
  const tokens = rows.map((r) => r.token);

  if (!tokens.length) {
    return res.json({ ok: true, sent: 0, failed: 0, note: 'nenhum dispositivo registrado' });
  }

  const result = await sendPush(tokens, { title, body, url: url ?? undefined });

  // Faxina de tokens que o FCM reportou como inválidos.
  if (result.invalidTokens?.length) {
    await prisma.pushToken.deleteMany({ where: { token: { in: result.invalidTokens } } });
  }

  res.json({ ok: true, ...result, status: getPushStatus() });
});

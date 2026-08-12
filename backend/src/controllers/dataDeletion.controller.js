import { z } from 'zod';
import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { onlyDigits } from '../utils/helpers.js';
import { sendEmail } from '../services/email.service.js';

/** Normaliza string vazia/whitespace para null. */
const emptyToNull = (s) => {
  const t = (s ?? '').toString().trim();
  return t === '' ? null : t;
};

// E-mail do controlador dos dados (recebe aviso de cada solicitação, se Resend ligado).
const CONTROLLER_EMAIL = process.env.PRIVACY_EMAIL || 'contato@marciobinsely.com.br';

const requestSchema = z.object({
  name: z.string().min(2, 'Informe seu nome completo'),
  email: z.string().email('E-mail inválido').nullable().optional(),
  phone: z.string().min(8, 'Informe um telefone válido').nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
});

/**
 * POST /api/public/data-deletion — PÚBLICO.
 * Registra o pedido de exclusão de dados (LGPD art. 18 · requisito Google Play).
 * Não apaga nada automaticamente: um humano (líder) valida a identidade e conclui,
 * evitando que qualquer pessoa apague o cadastro de terceiros só sabendo o telefone.
 */
export const requestDataDeletion = asyncHandler(async (req, res) => {
  const data = requestSchema.parse(req.body);
  const email = emptyToNull(data.email);
  const phone = data.phone ? onlyDigits(data.phone) : null;

  if (!email && !phone) {
    throw new AppError('Informe pelo menos um e-mail ou telefone para localizarmos seu cadastro.', 400);
  }

  // Tenta localizar o apoiador correspondente (só para agilizar o tratamento).
  let matched = null;
  if (phone) matched = await prisma.supporter.findFirst({ where: { phone }, select: { id: true } });
  if (!matched && email) matched = await prisma.supporter.findFirst({ where: { email }, select: { id: true } });

  const request = await prisma.dataDeletionRequest.create({
    data: {
      name: data.name.trim(),
      email,
      phone,
      reason: emptyToNull(data.reason),
      matchedSupporterId: matched?.id || null,
      ip: (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').slice(0, 60),
    },
    select: { id: true, createdAt: true },
  });

  // Avisa o controlador por e-mail (silencioso se Resend não estiver configurado).
  try {
    await sendEmail({
      to: CONTROLLER_EMAIL,
      subject: 'Nova solicitação de exclusão de dados (LGPD)',
      html: `<p>Nova solicitação de exclusão recebida.</p>
             <ul>
               <li><b>Nome:</b> ${escapeHtml(data.name)}</li>
               <li><b>E-mail:</b> ${escapeHtml(email || '—')}</li>
               <li><b>Telefone:</b> ${escapeHtml(phone || '—')}</li>
               <li><b>Motivo:</b> ${escapeHtml(data.reason || '—')}</li>
               <li><b>Cadastro localizado:</b> ${matched ? 'sim' : 'não'}</li>
               <li><b>Protocolo:</b> ${request.id}</li>
             </ul>
             <p>Trate em Administração → Solicitações de exclusão.</p>`,
    });
  } catch (err) {
    console.warn('[data-deletion] falha ao notificar controlador:', err.message);
  }

  res.status(201).json({
    ok: true,
    protocol: request.id,
    message:
      'Solicitação registrada. Seus dados serão excluídos em até 15 dias úteis. Guarde o número de protocolo.',
  });
});

/** GET /api/data-deletion — LIDER. Lista as solicitações (pendentes primeiro). */
export const listDataDeletionRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const where = status ? { status: String(status) } : {};
  const items = await prisma.dataDeletionRequest.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 500,
  });
  const pending = await prisma.dataDeletionRequest.count({ where: { status: 'PENDENTE' } });
  res.json({ items, pending });
});

/** PATCH /api/data-deletion/:id — LIDER. Marca como concluída (ou reabre). */
export const resolveDataDeletionRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const schema = z.object({
    status: z.enum(['PENDENTE', 'CONCLUIDA']),
    note: z.string().max(1000).nullable().optional(),
  });
  const { status, note } = schema.parse(req.body);

  const updated = await prisma.dataDeletionRequest.update({
    where: { id },
    data: {
      status,
      note: emptyToNull(note),
      handledById: status === 'CONCLUIDA' ? req.user?.id || null : null,
      handledAt: status === 'CONCLUIDA' ? new Date() : null,
    },
  });
  res.json(updated);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

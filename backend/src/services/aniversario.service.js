import prisma from '../config/prisma.js';
import { dispararJornada } from './whatsapp.service.js';

// Teto de envios por execução — proteção contra estourar o limite diário da Meta.
// A base engajada rende poucos aniversariantes/dia, então nunca deve ser atingido.
const CAP = 200;

// "Hoje" no fuso da campanha (America/Sao_Paulo): { ano, mmdd: 'MM-DD' }.
function hojeBR() {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const [ano, mes, dia] = s.split('-');
  return { ano: Number(ano), mmdd: `${mes}-${dia}` };
}

/**
 * Envia "feliz aniversário" (template `aniversario`) para os aniversariantes de
 * HOJE da base ENGAJADA — voluntários + apoiadores ATIVO/CONFIRMADO. Deliberado:
 * NÃO envia para os ~33 mil contatos frios importados (parabéns automático a
 * contato frio vira denúncia de spam e derruba a qualidade do número na Meta).
 *
 * Idempotente: `lastBirthdayYear` guarda o ano do último envio — nunca reenvia no
 * mesmo ano, mesmo que o cron rode mais de uma vez. Blacklist é pulada dentro do
 * dispararJornada.
 */
export async function enviarAniversarios() {
  const { ano, mmdd } = hojeBR();
  const alvos = await prisma.$queryRawUnsafe(
    `SELECT s.id, s.name, s.phone, s.whatsapp
       FROM "Supporter" s
       LEFT JOIN "Volunteer" v ON v."supporterId" = s.id
      WHERE s."birthDate" IS NOT NULL
        AND to_char(s."birthDate", 'MM-DD') = $1
        AND s.status <> 'BLACKLIST'
        AND (s.phone IS NOT NULL OR s.whatsapp IS NOT NULL)
        AND (v.id IS NOT NULL OR s.status IN ('ATIVO', 'CONFIRMADO'))
        AND (s."lastBirthdayYear" IS NULL OR s."lastBirthdayYear" <> $2)
      LIMIT ${CAP}`,
    mmdd, ano
  );

  let enviados = 0, pulados = 0, falhas = 0;
  for (const s of alvos) {
    const nome = (s.name || '').split(' ')[0] || 'apoiador(a)';
    const r = await dispararJornada('aniversario', s.whatsapp || s.phone, [nome]);
    if (r?.success) {
      await prisma.supporter.update({ where: { id: s.id }, data: { lastBirthdayYear: ano } });
      enviados++;
    } else if (r?.error === 'blacklist') {
      pulados++;
    } else {
      falhas++;
    }
  }
  return { data: mmdd, candidatos: alvos.length, enviados, pulados, falhas };
}

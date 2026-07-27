import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Relatório consolidado. */
export const summary = asyncHandler(async (req, res) => {
  const [
    supportersByRegion,
    supportersByCity,
    bannersByStatus,
    actionsByType,
    engagementByType,
    demandsByCategory,
    materialsDelivered,
  ] = await Promise.all([
    prisma.region.findMany({ select: { name: true, _count: { select: { supporters: true } } } }),
    prisma.supporter.groupBy({ by: ['cityName'], _count: { _all: true }, orderBy: { _count: { cityName: 'desc' } }, take: 15 }),
    prisma.bannerLocation.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.streetAction.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.engagement.groupBy({ by: ['type'], _count: { _all: true }, _sum: { points: true } }),
    prisma.demand.groupBy({ by: ['category'], _count: { _all: true } }),
    prisma.materialRequest.groupBy({ by: ['materialName'], where: { status: 'ENTREGUE' }, _sum: { quantity: true } }),
  ]);

  res.json({
    supportersByRegion: supportersByRegion.map((r) => ({ name: r.name, value: r._count.supporters })),
    supportersByCity: supportersByCity.map((c) => ({ name: c.cityName || 'Não informado', value: c._count._all })),
    bannersByStatus: bannersByStatus.map((b) => ({ name: b.status, value: b._count._all })),
    actionsByType: actionsByType.map((a) => ({ name: a.type, value: a._count._all })),
    engagementByType: engagementByType.map((e) => ({ name: e.type, value: e._count._all, points: e._sum.points || 0 })),
    demandsByCategory: demandsByCategory.map((d) => ({ name: d.category, value: d._count._all })),
    materialsDelivered: materialsDelivered.map((m) => ({ name: m.materialName, value: m._sum.quantity || 0 })),
  });
});

/** Crescimento da base ao longo do tempo (série acumulada por dia). */
export const growth = asyncHandler(async (req, res) => {
  // Cap defensivo: 100k linhas é ~4MB — não trava memoria da lambda.
  // Se o banco crescer além disso, migrar pra agregação SQL (DATE_TRUNC).
  const supporters = await prisma.supporter.findMany({
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 100_000,
  });
  const byDay = {};
  for (const s of supporters) {
    const day = s.createdAt.toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }
  let cumulative = 0;
  const series = Object.entries(byDay).map(([date, count]) => {
    cumulative += count;
    return { date, count, total: cumulative };
  });
  res.json({ series });
});

/**
 * Acompanhamento das indicações, em tempo real.
 *
 * Quem indicou fica na tag `INDICAÇÃO: <NOME>` do apoiador — é assim que a
 * planilha de pré-campanha e o formulário do site gravam. Aqui a tag é
 * revertida em ranking de indicantes, com quantos viraram voluntário e
 * quantos já foram confirmados.
 */
export const indicacoes = asyncHandler(async (req, res) => {
  const dias = Math.min(365, Math.max(1, Number(req.query.dias) || 30));
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - (dias - 1));

  const [ranking, recentes, totais] = await Promise.all([
    // Ranking de quem mais indicou
    prisma.$queryRaw`
      SELECT
        replace(t, 'INDICAÇÃO: ', '')                                    AS indicante,
        count(*)::int                                                    AS total,
        count(*) FILTER (WHERE s."supportType" = 'VOLUNTARIO')::int      AS voluntarios,
        count(*) FILTER (WHERE s.status = 'CONFIRMADO')::int             AS confirmados,
        count(*) FILTER (WHERE s."createdAt" >= ${desde})::int           AS no_periodo
      FROM "Supporter" s, unnest(s.tags) t
      WHERE t LIKE 'INDICAÇÃO: %'
      GROUP BY 1
      ORDER BY 2 DESC
    `,
    // Últimas indicações recebidas (o "tempo real" da tela)
    prisma.$queryRaw`
      SELECT s.id, s.name AS indicado, s."createdAt", s.status, s."supportType",
             s."cityName", s.neighborhood,
             replace(t, 'INDICAÇÃO: ', '') AS indicante
      FROM "Supporter" s, unnest(s.tags) t
      WHERE t LIKE 'INDICAÇÃO: %'
      ORDER BY s."createdAt" DESC
      LIMIT 40
    `,
    prisma.$queryRaw`
      SELECT
        count(DISTINCT s.id)::int                                   AS indicados,
        count(DISTINCT replace(t, 'INDICAÇÃO: ', ''))::int          AS indicantes,
        count(DISTINCT s.id) FILTER (WHERE s."createdAt" >= ${desde})::int AS no_periodo
      FROM "Supporter" s, unnest(s.tags) t
      WHERE t LIKE 'INDICAÇÃO: %'
    `,
  ]);

  res.json({ ranking, recentes, resumo: totais[0] || {}, dias });
});

/**
 * Lista de quem uma pessoa indicou — o drill-down do ranking.
 * Recebe o nome do indicante (como aparece na tag) e devolve os apoiadores
 * que têm `INDICAÇÃO: <nome>`.
 */
export const indicadosDe = asyncHandler(async (req, res) => {
  const nome = String(req.params.nome || '').trim().toUpperCase();
  if (!nome) return res.json({ indicados: [] });

  const indicados = await prisma.supporter.findMany({
    where: { tags: { has: `INDICAÇÃO: ${nome}` } },
    select: {
      id: true, name: true, phone: true, whatsapp: true, status: true,
      supportType: true, cityName: true, neighborhood: true, createdAt: true,
    },
    orderBy: { name: 'asc' },
  });
  res.json({ indicante: nome, total: indicados.length, indicados });
});

/**
 * Aniversariantes de uma data (padrão: hoje). Compara dia e mês, ignorando
 * o ano — é o que a campanha usa para mandar "feliz aniversário".
 */
export const aniversariantes = asyncHandler(async (req, res) => {
  // data no formato YYYY-MM-DD; sem isso, usa o dia de hoje no fuso de Brasília.
  let dia, mes;
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.data || '')) {
    [, mes, dia] = req.query.data.match(/^\d{4}-(\d{2})-(\d{2})$/);
  } else {
    const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    dia = String(hoje.getDate()).padStart(2, '0');
    mes = String(hoje.getMonth() + 1).padStart(2, '0');
  }

  // Metade da base tem só dia/mês (ano veio inválido do CSV do gabinete). O
  // dia/mês é o que importa para o aniversário; a idade só aparece quando o
  // ano é real (>= 1920), senão daria "2025 anos".
  const lista = await prisma.$queryRawUnsafe(
    `SELECT id, name, phone, whatsapp, "cityName", neighborhood, "birthDate", "supportType",
            CASE WHEN date_part('year', "birthDate") >= 1920
                 THEN date_part('year', age("birthDate"))::int END AS idade
     FROM "Supporter"
     WHERE "birthDate" IS NOT NULL
       AND to_char("birthDate", 'MM-DD') = $1
     ORDER BY name ASC`,
    `${mes}-${dia}`
  );

  res.json({ data: `${dia}/${mes}`, total: lista.length, aniversariantes: lista });
});

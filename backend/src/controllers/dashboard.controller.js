import prisma from '../config/prisma.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Indicadores principais do painel. */
export const getStats = asyncHandler(async (req, res) => {
  const [
    totalSupporters,
    totalVolunteers,
    activeVolunteers,
    pendingVolunteers,
    authorizedBanners,
    deliveredMaterials,
    pendingRequests,
    doneActions,
    suspects,
    blacklisted,
    openDemands,
    openConversations,
  ] = await Promise.all([
    prisma.supporter.count(),
    prisma.volunteer.count(),
    prisma.volunteer.count({ where: { active: true } }),
    prisma.supporter.count({ where: { status: 'PENDENTE' } }),
    prisma.bannerLocation.count({ where: { status: { in: ['AUTORIZADO', 'INSTALADO'] } } }),
    prisma.materialRequest.count({ where: { status: 'ENTREGUE' } }),
    prisma.materialRequest.count({
      where: { status: { in: ['SOLICITADO', 'EM_ANALISE', 'APROVADO', 'SEPARADO'] } },
    }),
    prisma.streetAction.count({ where: { status: 'REALIZADA' } }),
    prisma.supporter.count({ where: { status: 'SUSPEITO' } }),
    prisma.supporter.count({ where: { status: 'BLACKLIST' } }),
    prisma.demand.count({ where: { status: { in: ['NOVA', 'EM_ANALISE', 'EM_ANDAMENTO'] } } }),
    prisma.conversation.count({ where: { status: { in: ['ABERTA', 'EM_ATENDIMENTO', 'AGUARDANDO'] } } }),
  ]);

  res.json({
    totalSupporters,
    totalVolunteers,
    activeVolunteers,
    pendingVolunteers,
    authorizedBanners,
    deliveredMaterials,
    pendingRequests,
    doneActions,
    suspects,
    blacklisted,
    openDemands,
    openConversations,
  });
});

/** Dados para os gráficos do painel. */
export const getCharts = asyncHandler(async (req, res) => {
  const [byRegionRaw, byCityRaw, byStatusRaw, bySupportRaw] = await Promise.all([
    prisma.region.findMany({
      select: { name: true, color: true, _count: { select: { supporters: true } } },
    }),
    prisma.supporter.groupBy({
      by: ['cityName'],
      _count: { _all: true },
      orderBy: { _count: { cityName: 'desc' } },
      take: 12,
    }),
    prisma.supporter.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.supporter.groupBy({ by: ['supportType'], _count: { _all: true } }),
  ]);

  const regions = byRegionRaw
    .map((r) => ({ name: r.name, value: r._count.supporters, color: r.color }))
    .sort((a, b) => b.value - a.value);

  res.json({
    byRegion: regions,
    strongRegions: regions.slice(0, 3),
    weakRegions: regions.filter((r) => r.value <= 1),
    byCity: byCityRaw.map((c) => ({ name: c.cityName || 'Não informado', value: c._count._all })),
    byStatus: byStatusRaw.map((s) => ({ name: s.status, value: s._count._all })),
    bySupportType: bySupportRaw.map((s) => ({ name: s.supportType, value: s._count._all })),
  });
});

/**
 * Cadastros novos por dia — responde "quantos estão entrando por dia".
 * Preenche os dias sem cadastro com zero para o gráfico não mentir
 * (buraco no eixo daria impressão de continuidade).
 */
export const getDailySignups = asyncHandler(async (req, res) => {
  const dias = Math.min(180, Math.max(7, Number(req.query.dias) || 30));
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setDate(desde.getDate() - (dias - 1));

  // A base migrada tem createdAt = data da importação (não da inscrição real).
  // Incluí-la geraria um pico de 33 mil que achataria os dias reais no gráfico.
  const linhas = await prisma.$queryRaw`
    SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS dia,
           count(*)::int AS total,
           count(*) FILTER (WHERE 'SITE 2026' = ANY(tags))::int AS site
    FROM "Supporter"
    WHERE "createdAt" >= ${desde}
      AND NOT ('BASE HISTÓRICA' = ANY(tags))
    GROUP BY 1
    ORDER BY 1
  `;

  const porDia = new Map(linhas.map((l) => [l.dia, l]));
  const serie = [];
  for (let i = 0; i < dias; i++) {
    const d = new Date(desde);
    d.setDate(desde.getDate() + i);
    const chave = d.toISOString().slice(0, 10);
    const achado = porDia.get(chave);
    serie.push({ dia: chave, total: achado?.total || 0, site: achado?.site || 0 });
  }

  const hoje = serie.at(-1)?.total || 0;
  const total = serie.reduce((s, d) => s + d.total, 0);
  res.json({
    serie,
    resumo: {
      hoje,
      ontem: serie.at(-2)?.total || 0,
      ultimos7: serie.slice(-7).reduce((s, d) => s + d.total, 0),
      periodo: total,
      mediaDia: Number((total / dias).toFixed(1)),
      dias,
    },
  });
});

/** Camadas georreferenciadas do mapa político (fonte única e agregada). */
/**
 * Apoiadores agrupados por bairro — bolhas no mapa.
 * Desenhar 29 mil pontos trava o navegador e vira uma mancha ilegível;
 * o mapa antes mostrava só os 3.000 primeiros, o que dava uma leitura
 * errada de onde está a base. Agrupado, cada bairro vira uma bolha com
 * o total real, e nada fica de fora.
 */
export const getMapClusters = asyncHandler(async (_req, res) => {
  const linhas = await prisma.$queryRaw`
    SELECT
      COALESCE(NULLIF(btrim(neighborhood), ''), '(sem bairro)') AS bairro,
      COALESCE(NULLIF(btrim("cityName"),   ''), '(sem cidade)') AS cidade,
      count(*)::int AS total,
      avg(lat)::float AS lat,
      avg(lng)::float AS lng
    FROM "Supporter"
    WHERE lat IS NOT NULL AND lng IS NOT NULL
    GROUP BY 1, 2
    HAVING count(*) > 0
    ORDER BY count(*) DESC
  `;
  const total = linhas.reduce((s, l) => s + l.total, 0);
  res.json({ clusters: linhas, total, bairros: linhas.length });
});

export const getMap = asyncHandler(async (req, res) => {
  const geo = { lat: { not: null }, lng: { not: null } };
  const [supporters, banners, streetActions] = await Promise.all([
    prisma.supporter.findMany({
      where: geo,
      select: { id: true, name: true, lat: true, lng: true, cityName: true, neighborhood: true, supportType: true, phone: true },
      take: 3000,
    }),
    prisma.bannerLocation.findMany({
      where: geo,
      select: { id: true, responsibleName: true, address: true, cityName: true, neighborhood: true, lat: true, lng: true, status: true },
      take: 1000,
    }),
    prisma.streetAction.findMany({
      where: geo,
      select: { id: true, title: true, type: true, lat: true, lng: true, neighborhood: true, date: true },
      take: 1000,
    }),
  ]);
  res.json({ supporters, banners, streetActions });
});

/** Rankings de coordenadores e voluntários. */
export const getRankings = asyncHandler(async (req, res) => {
  const [volunteers, coordinators] = await Promise.all([
    prisma.volunteer.findMany({
      orderBy: { totalScore: 'desc' },
      take: 10,
      include: { supporter: { select: { name: true, cityName: true, photoUrl: true } } },
    }),
    prisma.user.findMany({
      where: { role: 'MEMBRO' },
      select: {
        id: true,
        name: true,
        region: { select: { name: true } },
        _count: { select: { coordinatedSupporters: true } },
      },
      orderBy: { coordinatedSupporters: { _count: 'desc' } },
      take: 10,
    }),
  ]);

  res.json({
    volunteers: volunteers.map((v, i) => ({
      rank: i + 1,
      id: v.id,
      name: v.supporter?.name || 'Voluntário',
      score: v.totalScore,
      city: v.supporter?.cityName,
      photoUrl: v.supporter?.photoUrl,
    })),
    coordinators: coordinators.map((c, i) => ({
      rank: i + 1,
      id: c.id,
      name: c.name,
      region: c.region?.name || '—',
      supporters: c._count.coordinatedSupporters,
    })),
  });
});

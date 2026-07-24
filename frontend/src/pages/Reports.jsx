import { useEffect, useState } from 'react';
import { Download, BarChart3, Trophy, TrendingUp, UserPlus, Users, Search } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import { Card, StatCard } from '../components/ui/Card.jsx';
import { LoadingBox } from '../components/ui/Spinner.jsx';
import { BarChartCard, PieChartCard, LineChartCard } from '../components/charts/Charts.jsx';
import api from '../api/client.js';
import { label } from '../config/enums.js';

const tr = (group, arr = []) => arr.map((x) => ({ ...x, name: label(group, x.name) }));

export default function Reports() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let vivo = true;
    const carregar = () =>
      Promise.all([
        api.get('/reports/summary'),
        api.get('/reports/growth'),
        api.get('/reports/indicacoes').catch(() => ({ data: null })),
      ])
        .then(([s, g, i]) => vivo && setData({ ...s.data, growth: g.data.series, indicacoes: i.data }))
        .catch(() => vivo && setData({ error: true }));

    carregar();
    // "Tempo real": recarrega a cada 30s enquanto a aba está aberta.
    const t = setInterval(carregar, 30_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  function exportCsv() {
    const lines = ['Relatório;Item;Valor'];
    const push = (title, arr) => (arr || []).forEach((x) => lines.push(`${title};${x.name};${x.value}`));
    push('Apoiadores por região', data.supportersByRegion);
    push('Apoiadores por cidade', data.supportersByCity);
    push('Faixas por status', tr('BannerStatus', data.bannersByStatus));
    push('Ações por tipo', tr('StreetActionType', data.actionsByType));
    push('Engajamento por tipo', tr('TaskType', data.engagementByType));
    push('Demandas por categoria', tr('DemandCategory', data.demandsByCategory));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'relatorio-campanha.csv';
    a.click();
  }

  if (!data) {
    return (
      <Layout title="Relatórios">
        <LoadingBox />
      </Layout>
    );
  }

  return (
    <Layout title="Relatórios" subtitle="Consolidado da campanha — exporte e acompanhe a evolução">
      <div className="toolbar">
        <div className="spacer" />
        <button className="btn" onClick={exportCsv}>
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      <div className="grid grid-2">
        <Card title="Apoiadores por região" icon={BarChart3}>
          <BarChartCard data={data.supportersByRegion} color="#1B7A43" />
        </Card>
        <Card title="Apoiadores por cidade/bairro" icon={BarChart3}>
          <BarChartCard data={data.supportersByCity} />
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Card title="Faixas por status">
          <PieChartCard data={tr('BannerStatus', data.bannersByStatus)} />
        </Card>
        <Card title="Demandas por categoria">
          <PieChartCard data={tr('DemandCategory', data.demandsByCategory)} />
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Card title="Ações de rua por tipo">
          <BarChartCard data={tr('StreetActionType', data.actionsByType)} color="#1B7A43" />
        </Card>
        <Card title="Engajamento por tipo">
          <BarChartCard data={tr('TaskType', data.engagementByType)} color="#B45309" />
        </Card>
      </div>

      <div style={{ marginTop: 18 }}>
        <Card title="Crescimento da base">
          <LineChartCard data={data.growth} />
        </Card>
      </div>

      {data.indicacoes && <BlocoIndicacoes dados={data.indicacoes} />}
    </Layout>
  );
}

/** Acompanhamento das indicações: quem indicou, quantos e o que aconteceu. */
function BlocoIndicacoes({ dados }) {
  const { ranking = [], recentes = [], resumo = {} } = dados;
  // O cliente precisa ver TODOS os indicantes para cobrar produtividade
  // individual — não só o topo da lista.
  const [verTodos, setVerTodos] = useState(false);
  const [buscaInd, setBuscaInd] = useState('');

  // Sem acento dos dois lados: a base está cheia de "SÉRGINHO", "JOÃO",
  // "PROTÁSIO" — e ninguém digita acento na busca.
  const semAcento = (s) =>
    String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filtrado = buscaInd.trim()
    ? ranking.filter((r) => semAcento(r.indicante).includes(semAcento(buscaInd.trim())))
    : ranking;
  const visiveis = verTodos ? filtrado : filtrado.slice(0, 15);

  function exportarIndicacoes() {
    const cab = ['Posição', 'Quem indicou', 'Indicados', 'Voluntários', 'Confirmados'];
    const linhas = [cab.join(';')];
    ranking.forEach((r, i) =>
      linhas.push([i + 1, r.indicante.replace(/;/g, ' '), r.total, r.voluntarios, r.confirmados].join(';'))
    );
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `indicacoes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const quando = (iso) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    return new Date(iso).toLocaleDateString('pt-BR');
  };

  return (
    <>
      <div className="grid stats-grid" style={{ marginTop: 18 }}>
        <StatCard label="Pessoas indicadas" value={resumo.indicados ?? 0} icon={UserPlus} tone="blue" />
        <StatCard label="Quem indicou" value={resumo.indicantes ?? 0} icon={Users} tone="violet" />
        <StatCard label={`Novas em ${dados.dias} dias`} value={resumo.no_periodo ?? 0} icon={TrendingUp} tone="green" />
      </div>

      <div className="grid cols-2-1" style={{ marginTop: 18 }}>
        <Card
          title={`Ranking de indicações (${ranking.length})`}
          icon={Trophy}
          subtitle="Produtividade individual de quem trouxe gente para a pré-campanha"
        >
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <div className="search">
              <Search size={16} />
              <input
                className="input"
                placeholder="Buscar quem indicou..."
                value={buscaInd}
                onChange={(e) => setBuscaInd(e.target.value)}
              />
            </div>
            <div className="spacer" />
            <button className="btn btn-sm" onClick={exportarIndicacoes} title="Baixar o ranking completo">
              <Download size={15} /> Excel
            </button>
          </div>

          <div className="table-wrap" style={verTodos ? { maxHeight: 460, overflowY: 'auto' } : undefined}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th><th>Quem indicou</th>
                  <th className="text-right">Indicados</th>
                  <th className="text-right">Voluntários</th>
                  <th className="text-right">Confirmados</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r, i) => (
                  <tr key={r.indicante}>
                    <td className="cell-muted">{i + 1}º</td>
                    <td className="cell-strong">{r.indicante}</td>
                    <td className="text-right"><span className="rank-score">{r.total}</span></td>
                    <td className="text-right cell-muted">{r.voluntarios}</td>
                    <td className="text-right cell-muted">{r.confirmados}</td>
                  </tr>
                ))}
                {!visiveis.length && (
                  <tr><td colSpan={5} className="cell-muted" style={{ textAlign: 'center', padding: 18 }}>
                    {ranking.length ? 'Ninguém encontrado com esse nome.' : 'Nenhuma indicação registrada ainda.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {filtrado.length > 15 && (
            <button className="btn btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? 'Mostrar só os 15 primeiros' : `Ver todos os ${filtrado.length} que indicaram`}
            </button>
          )}
        </Card>

        <Card title="Últimas indicações" icon={TrendingUp} subtitle="Atualiza sozinho a cada 30s">
          <div className="ind-feed">
            {recentes.slice(0, 12).map((r) => (
              <div className="ind-item" key={r.id}>
                <div>
                  <div className="cell-strong">{r.indicado}</div>
                  <div className="cell-muted text-sm">
                    por <b>{r.indicante}</b>
                    {r.neighborhood ? ` · ${r.neighborhood}` : ''}
                  </div>
                </div>
                <span className="cell-muted text-sm">{quando(r.createdAt)}</span>
              </div>
            ))}
            {!recentes.length && <div className="cell-muted text-sm">Nenhuma indicação ainda.</div>}
          </div>
        </Card>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { Download, BarChart3, Trophy, TrendingUp, UserPlus, Users, Search, Cake } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import { Card, StatCard } from '../components/ui/Card.jsx';
import { LoadingBox } from '../components/ui/Spinner.jsx';
import { BarChartCard, PieChartCard, LineChartCard } from '../components/charts/Charts.jsx';
import Modal from '../components/ui/Modal.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import PhoneCell from '../components/PhoneCell.jsx';
import api from '../api/client.js';
import { label } from '../config/enums.js';
import { nomeProprio } from '../lib/format.js';

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
          <BarChartCard data={data.supportersByRegion} color="#2DBE60" />
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
          <BarChartCard data={tr('StreetActionType', data.actionsByType)} color="#2DBE60" />
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
      <BlocoAniversariantes />
    </Layout>
  );
}

/** Aniversariantes do dia (ou de uma data escolhida) — para mandar parabéns. */
function BlocoAniversariantes() {
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataSel, setDataSel] = useState(hoje);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    api.get('/reports/aniversariantes', { params: { data: dataSel } })
      .then((r) => vivo && setLista(r.data.aniversariantes || []))
      .catch(() => vivo && setLista([]))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [dataSel]);

  const ehHoje = dataSel === hoje;
  const [d, m] = [dataSel.slice(8, 10), dataSel.slice(5, 7)];

  return (
    <div style={{ marginTop: 18 }}>
      <Card
        title={`Aniversariantes ${ehHoje ? 'de hoje' : `de ${d}/${m}`}`}
        icon={Cake}
        subtitle="Mande o feliz aniversário — clique no telefone para abrir o WhatsApp"
      >
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <label className="cell-muted text-sm" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Data:
            <input type="date" className="input" style={{ width: 'auto' }} value={dataSel}
              onChange={(e) => setDataSel(e.target.value || hoje)} />
          </label>
          {!ehHoje && <button className="btn btn-sm" onClick={() => setDataSel(hoje)}>Hoje</button>}
          <div className="spacer" />
          <span className="rank-score">{lista.length} {lista.length === 1 ? 'aniversariante' : 'aniversariantes'}</span>
        </div>

        {carregando ? (
          <LoadingBox />
        ) : !lista.length ? (
          <p className="cell-muted text-sm" style={{ textAlign: 'center', padding: 16 }}>
            Ninguém faz aniversário nesta data.
          </p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Nome</th><th>Idade</th><th>Cidade / Bairro</th><th className="text-right">WhatsApp</th></tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-strong">{nomeProprio(p.name)}</td>
                    <td className="cell-muted">{p.idade != null ? `${p.idade} anos` : '—'}</td>
                    <td className="cell-muted">{[p.cityName, p.neighborhood].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="text-right">
                      <PhoneCell person={{ ...p, __msg: `Feliz aniversário, ${nomeProprio(p.name).split(' ')[0]}! 🎉 A equipe do Márcio Bins Ely deseja tudo de bom pra você.` }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Acompanhamento das indicações: quem indicou, quantos e o que aconteceu. */
function BlocoIndicacoes({ dados }) {
  const { ranking = [], recentes = [], resumo = {} } = dados;
  // O cliente precisa ver TODOS os indicantes para cobrar produtividade
  // individual — não só o topo da lista.
  const [verTodos, setVerTodos] = useState(false);
  const [buscaInd, setBuscaInd] = useState('');
  // Drill-down: clicar num indicante mostra QUEM ele indicou.
  const [abrir, setAbrir] = useState(null); // { indicante, indicados[] } | 'carregando'

  async function verIndicados(nome) {
    setAbrir('carregando');
    try {
      const { data } = await api.get(`/reports/indicacoes/${encodeURIComponent(nome)}`);
      setAbrir({ indicante: nome, indicados: data.indicados || [] });
    } catch {
      setAbrir({ indicante: nome, indicados: [], erro: true });
    }
  }

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
          subtitle="Produtividade individual de quem trouxe gente para a campanha"
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
                  <tr key={r.indicante} className="ind-clicavel" onClick={() => verIndicados(r.indicante)} title="Ver quem esta pessoa indicou">
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

      {abrir && (
        <Modal
          title={abrir === 'carregando' ? 'Carregando...' : `Indicados por ${abrir.indicante}`}
          onClose={() => setAbrir(null)}
          wide
        >
          {abrir === 'carregando' ? (
            <LoadingBox />
          ) : !abrir.indicados.length ? (
            <p className="cell-muted">Nenhum indicado encontrado.</p>
          ) : (
            <>
              <p className="cell-muted text-sm" style={{ marginBottom: 10 }}>
                {abrir.indicados.length} {abrir.indicados.length === 1 ? 'pessoa indicada' : 'pessoas indicadas'}.
              </p>
              <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th>Nome</th><th>Cidade / Bairro</th><th>Situação</th><th className="text-right">WhatsApp</th></tr>
                  </thead>
                  <tbody>
                    {abrir.indicados.map((p) => (
                      <tr key={p.id}>
                        <td className="cell-strong">{nomeProprio(p.name)}</td>
                        <td className="cell-muted">{[p.cityName, p.neighborhood].filter(Boolean).join(' · ') || '—'}</td>
                        <td><StatusBadge group="SupporterStatus" value={p.status} /></td>
                        <td className="text-right"><PhoneCell person={p} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

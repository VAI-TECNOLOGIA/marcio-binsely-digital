import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Send, Megaphone, X, Search, Users, ShieldCheck, Clock, Copy, Trash2,
  Download, Pause, Play, ChevronLeft, ChevronRight, Zap, ClipboardList, RefreshCw,
  ScrollText,
} from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import { Card } from '../components/ui/Card.jsx';
import Modal from '../components/ui/Modal.jsx';
import Field from '../components/ui/Field.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import { StatusBadge, Badge } from '../components/ui/Badge.jsx';
import { LoadingBox } from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import api, { apiError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { label, options } from '../config/enums.js';

// ============================================================
//  Campanhas — disparo pela API Oficial.
//  Público por segmentos da base + números colados, template com
//  prévia, declaração de conformidade obrigatória (não pré-
//  marcada), créditos com validade e envio agora ou agendado.
// ============================================================

const FONTES_VAR = [
  { value: 'nome', label: 'Nome do contato' },
  { value: 'cidade', label: 'Cidade' },
  { value: 'bairro', label: 'Bairro' },
  { value: 'responsavel', label: 'Responsável' },
  { value: 'fixo', label: 'Texto fixo' },
];

function fmtData(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Prévia da mensagem em bolha (header, corpo com variáveis, rodapé, botões). */
function PreviewBolha({ tpl, headerImageUrl, vars }) {
  if (!tpl) return null;
  const corpo = (tpl.bodyText || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const v = vars?.[Number(n) - 1];
    if (!v) return `{{${n}}}`;
    if (v.source === 'fixo') return v.value || `{{${n}}}`;
    return `[${FONTES_VAR.find((f) => f.value === v.source)?.label || v.source}]`;
  });
  return (
    <div className="wa-preview">
      <div className="wa-bubble">
        {tpl.headerFormat === 'IMAGE' && (
          headerImageUrl
            ? <img src={headerImageUrl} alt="" className="wa-header-img" onError={(e) => { e.target.style.display = 'none'; }} />
            : <div className="wa-header-ph">Imagem do topo</div>
        )}
        {tpl.headerText && <div className="wa-header-text">{tpl.headerText}</div>}
        <div className="wa-body">{corpo}</div>
        {tpl.footerText && <div className="wa-footer">{tpl.footerText}</div>}
        {tpl.buttons?.length > 0 && (
          <div className="wa-buttons">
            {tpl.buttons.map((b, i) => <div key={i} className="wa-btn">{b.text}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Barra de progresso do envio de uma campanha. */
function Progresso({ c }) {
  const total = c.totalContacts || 0;
  if (!total) return <span className="cell-muted">—</span>;
  const feito = (c.sentCount || 0) + (c.failedCount || 0);
  const pct = Math.min(100, Math.round((feito / total) * 100));
  return (
    <div className="bc-progress" style={{ minWidth: 130 }}>
      <div className="bc-progress-bar"><div className="bc-progress-fill" style={{ width: `${pct}%` }} /></div>
      <div className="bc-progress-info" style={{ fontSize: 11 }}>{feito}/{total} ({pct}%)</div>
    </div>
  );
}

export default function Broadcasts() {
  const toast = useToast();
  const { user } = useAuth();
  const isLider = user?.role === 'LIDER';

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('');
  const [templates, setTemplates] = useState([]);
  const [creditos, setCreditos] = useState(null);
  const [pool, setPool] = useState(null);
  const [declInfo, setDeclInfo] = useState(null);

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [passo, setPasso] = useState(1);
  const [form, setForm] = useState({});
  const [filtros, setFiltros] = useState({});
  const [colados, setColados] = useState('');
  const [opcoes, setOpcoes] = useState(null);
  const [tags, setTags] = useState([]);
  const [previewPublico, setPreviewPublico] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [modo, setModo] = useState('template');
  const [vars, setVars] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [campId, setCampId] = useState(null);
  const [declAceita, setDeclAceita] = useState(false);
  const [fonesTeste, setFoneTeste] = useState('');

  // Extrato de envios (monitoramento cruzando campanhas)
  const [extratoOpen, setExtratoOpen] = useState(false);
  const [extrato, setExtrato] = useState({ data: [], total: 0, page: 1, resumo: {} });
  const [exFiltro, setExFiltro] = useState({ campaignId: '', status: '', sender: '', search: '', de: '', ate: '', page: 1 });

  // Detalhe
  const [detail, setDetail] = useState(null);
  const [contatos, setContatos] = useState({ data: [], total: 0, page: 1 });
  const [contatoStatus, setContatoStatus] = useState('');
  const [sendingState, setSendingState] = useState(null);
  const cancelRef = useRef(false);
  const [declDetalheAceita, setDeclDetalheAceita] = useState(false);

  const tplSel = useMemo(() => templates.find((t) => t.name === form.templateName) || null, [templates, form.templateName]);

  useEffect(() => {
    api.get('/whatsapp/templates').then(({ data }) => setTemplates(data.data || [])).catch(() => {});
    api.get('/broadcasts/declaracao/texto').then(({ data }) => setDeclInfo(data)).catch(() => {});
    carregarCreditos();
  }, []);

  function carregarCreditos() {
    api.get('/broadcasts/creditos/status').then(({ data }) => setCreditos(data)).catch(() => {});
    api.get('/broadcasts/pool/status').then(({ data }) => setPool(data)).catch(() => {});
  }

  // ---------- Extrato de envios ----------
  async function carregarExtrato(filtro = exFiltro) {
    try {
      const params = { page: filtro.page || 1, take: 50 };
      for (const k of ['campaignId', 'status', 'sender', 'search', 'de', 'ate']) if (filtro[k]) params[k] = filtro[k];
      const { data } = await api.get('/broadcasts/extrato/lista', { params });
      setExtrato(data);
    } catch (e) {
      toast.error(apiError(e));
    }
  }
  useEffect(() => {
    if (!extratoOpen) return;
    carregarExtrato();
    const t = setInterval(() => carregarExtrato(), 8000); // monitor: atualiza sozinho
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extratoOpen, exFiltro]);

  async function exportarExtrato() {
    try {
      const params = { format: 'csv' };
      for (const k of ['campaignId', 'status', 'sender', 'search', 'de', 'ate']) if (exFiltro[k]) params[k] = exFiltro[k];
      const resp = await api.get('/broadcasts/extrato/lista', { params, responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'extrato-envios.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiError(e));
    }
  }
  const setExF = (k, v) => setExFiltro((f) => ({ ...f, [k]: v, page: 1 }));
  const displayNumero = (phoneId) => pool?.numeros?.find((n) => n.phoneNumberId === phoneId)?.display || (phoneId ? `…${String(phoneId).slice(-6)}` : '—');

  async function alternarNumero(n) {
    try {
      await api.patch(`/broadcasts/pool/${n.id}`, { active: !n.active });
      carregarCreditos();
    } catch (e) {
      toast.error(apiError(e));
    }
  }
  async function salvarCap(n, valor) {
    const cap = parseInt(valor, 10);
    if (!cap || cap === n.dailyCap) return;
    try {
      await api.patch(`/broadcasts/pool/${n.id}`, { dailyCap: cap });
      toast.success(`Limite diário do ${n.display} ajustado para ${cap}.`);
      carregarCreditos();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (busca.trim()) params.search = busca.trim();
      if (statusFiltro) params.status = statusFiltro;
      const { data } = await api.get('/broadcasts', { params });
      setList(data.data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const t = setTimeout(load, busca ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, statusFiltro]);

  // Atualiza o detalhe sozinho enquanto a campanha envia (o cron também envia).
  useEffect(() => {
    if (!detail || detail.status !== 'ENVIANDO' || sendingState) return;
    const t = setInterval(() => refreshDetail(detail.id), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id, detail?.status, sendingState]);

  const setCampo = (n, v) => setForm((s) => ({ ...s, [n]: v }));

  // ---------- Wizard ----------
  function abrirWizard() {
    setForm({ templateLang: 'pt_BR' });
    setFiltros({ usarBase: true });
    setColados('');
    setPreviewPublico(null);
    setModo('template');
    setVars([]);
    setCampId(null);
    setDeclAceita(false);
    setPasso(1);
    setWizardOpen(true);
    if (!opcoes) {
      api.get('/broadcasts/audiencia/opcoes').then(({ data }) => setOpcoes(data)).catch(() => {});
      api.get('/supporters/tags').then(({ data }) => setTags(data.data || data || [])).catch(() => {});
    }
  }

  function selecionarTemplate(name) {
    const t = templates.find((x) => x.name === name);
    setForm((s) => ({ ...s, templateName: name || null, templateLang: t?.language || 'pt_BR', headerImageUrl: t?.headerFormat === 'IMAGE' ? (s.headerImageUrl || '') : null }));
    setVars(Array.from({ length: t?.bodyVarCount || 0 }, (_, i) => ({ source: i === 0 ? 'nome' : 'fixo', value: '' })));
  }

  function toggleFiltro(chave, valor) {
    setFiltros((f) => {
      const atual = new Set(f[chave] || []);
      if (atual.has(valor)) atual.delete(valor); else atual.add(valor);
      return { ...f, [chave]: [...atual] };
    });
    setPreviewPublico(null);
  }

  async function calcularPublico() {
    setCalculando(true);
    try {
      const { data } = await api.post('/broadcasts/audiencia/preview', { filtros, colados });
      setPreviewPublico(data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setCalculando(false);
    }
  }

  async function avancar() {
    if (passo === 1) {
      if (!form.name || form.name.trim().length < 2) return toast.error('Dê um nome para a campanha.');
      return setPasso(2);
    }
    if (passo === 2) {
      if (!previewPublico) return toast.error('Clique em "Calcular público" para conferir os números.');
      if (!previewPublico.total) return toast.error('O público está vazio — ajuste os filtros ou cole números.');
      return setPasso(3);
    }
    if (passo === 3) {
      if (modo === 'template' && !form.templateName) return toast.error('Selecione um template aprovado.');
      if (modo === 'livre' && !(form.message || '').trim()) return toast.error('Escreva a mensagem.');
      // Cria a campanha (rascunho/agendada) + grava o público.
      setSalvando(true);
      try {
        const payload = {
          name: form.name,
          channel: 'WHATSAPP',
          scheduledAt: form.scheduledAt || null,
          ...(modo === 'template'
            ? { templateName: form.templateName, templateLang: form.templateLang, headerImageUrl: form.headerImageUrl || null, varsJson: vars }
            : { message: form.message }),
        };
        let id = campId;
        if (!id) {
          const { data } = await api.post('/broadcasts', payload);
          id = data.id;
          setCampId(id);
        } else {
          await api.patch(`/broadcasts/${id}`, payload);
        }
        await api.post(`/broadcasts/${id}/audiencia`, { filtros, colados, replace: true });
        setDeclAceita(false);
        setPasso(4);
      } catch (e) {
        toast.error(apiError(e));
      } finally {
        setSalvando(false);
      }
    }
  }

  async function enviarTesteWizard() {
    if (!fonesTeste.trim()) return toast.error('Informe o número para o teste.');
    try {
      await api.post(`/broadcasts/${campId}/teste`, { phone: fonesTeste });
      toast.success('Teste enviado. Confira o WhatsApp.');
      carregarCreditos();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  async function concluirWizard(enviarAgora) {
    if (!declAceita) return toast.error('Marque a declaração de conformidade para liberar o envio.');
    setSalvando(true);
    try {
      await api.post(`/broadcasts/${campId}/declaracao`, { aceito: true });
      if (enviarAgora) {
        setWizardOpen(false);
        const { data } = await api.get(`/broadcasts/${campId}`);
        setDetail(data);
        await dispararLoop(data);
      } else {
        toast.success(form.scheduledAt ? 'Campanha agendada. O sistema envia sozinho no horário.' : 'Campanha pronta. Abra e clique em Disparar quando quiser.');
        setWizardOpen(false);
      }
      load();
      carregarCreditos();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSalvando(false);
    }
  }

  // ---------- Detalhe ----------
  async function refreshDetail(id) {
    try {
      const { data } = await api.get(`/broadcasts/${id}`);
      setDetail(data);
      const params = { page: contatos.page, take: 50 };
      if (contatoStatus) params.status = contatoStatus;
      const r = await api.get(`/broadcasts/${id}/contacts`, { params });
      setContatos(r.data);
    } catch { /* silencioso */ }
  }
  async function openDetail(row) {
    const { data } = await api.get(`/broadcasts/${row.id}`);
    setDetail(data);
    setDeclDetalheAceita(false);
    setContatoStatus('');
    const r = await api.get(`/broadcasts/${row.id}/contacts`, { params: { page: 1, take: 50 } });
    setContatos(r.data);
  }
  useEffect(() => {
    if (!detail) return;
    const params = { page: contatos.page, take: 50 };
    if (contatoStatus) params.status = contatoStatus;
    api.get(`/broadcasts/${detail.id}/contacts`, { params }).then((r) => setContatos(r.data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatoStatus, contatos.page]);

  async function dispararLoop(camp) {
    const id = camp.id;
    const total = camp.totalContacts || 0;
    cancelRef.current = false;
    setSendingState({ sent: camp.sentCount || 0, failed: camp.failedCount || 0, total, pct: 0 });
    try {
      let done = false;
      while (!done && !cancelRef.current) {
        const { data } = await api.post(`/broadcasts/${id}/send`);
        const processed = data.sentCount + data.failedCount;
        setSendingState({ sent: data.sentCount, failed: data.failedCount, total: data.totalContacts || total, pct: total ? Math.round((processed / total) * 100) : 100 });
        done = data.done;
        if (data.poolEsgotado) { toast.success(data.motivoPool || 'Limite diário dos números atingido — o envio continua sozinho amanhã.'); break; }
        if (!done && data.sent === 0 && data.failed === 0) break;
      }
      if (cancelRef.current) { await api.post(`/broadcasts/${id}/pause`).catch(() => {}); toast.success('Envio pausado.'); }
      else if (done) toast.success('Disparo concluído.');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSendingState(null);
      cancelRef.current = false;
      refreshDetail(id);
      load();
      carregarCreditos();
    }
  }

  async function aceitarDeclaracaoDetalhe() {
    if (!declDetalheAceita) return toast.error('Marque a declaração para registrar o aceite.');
    try {
      await api.post(`/broadcasts/${detail.id}/declaracao`, { aceito: true });
      toast.success('Declaração registrada. Envio liberado.');
      refreshDetail(detail.id);
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  async function exportarCsv() {
    try {
      const resp = await api.get(`/broadcasts/${detail.id}/contacts`, { params: { format: 'csv' }, responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campanha-${(detail.name || 'export').replace(/[^\w-]+/g, '-').toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  async function duplicar(row) {
    try {
      await api.post(`/broadcasts/${row.id}/duplicar`);
      toast.success('Campanha duplicada como rascunho.');
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  }
  async function excluir(row) {
    if (!window.confirm(`Excluir a campanha "${row.name}"?`)) return;
    try {
      await api.delete(`/broadcasts/${row.id}`);
      toast.success('Campanha excluída.');
      setDetail(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  }
  async function ativarPacote() {
    if (!window.confirm('Ativar o pacote de 80.000 mensagens? A validade de 120 dias começa agora.')) return;
    try {
      await api.post('/broadcasts/creditos/ativar', { total: 80000 });
      toast.success('Pacote ativado.');
      carregarCreditos();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  const columns = [
    { key: 'name', label: 'Campanha', render: (r) => (
      <div>
        <div className="cell-strong">{r.name}</div>
        <div className="cell-muted" style={{ fontSize: 12 }}>{r.templateName ? `Template: ${r.templateName}` : 'Mensagem livre'}</div>
      </div>
    ) },
    { key: 'contacts', label: 'Público', render: (r) => r._count?.contacts ?? r.totalContacts ?? 0 },
    { key: 'progress', label: 'Progresso', render: (r) => <Progresso c={r} /> },
    { key: 'lidas', label: 'Entregues / Lidas', render: (r) => <span>{r.deliveredCount || 0} / {r.readCount || 0}</span> },
    { key: 'agendada', label: 'Agendada para', render: (r) => (r.scheduledAt ? fmtData(r.scheduledAt) : '—') },
    { key: 'decl', label: 'Declaração', render: (r) => (r.declAcceptedAt ? <Badge tone="green">Registrada</Badge> : <Badge tone="amber">Pendente</Badge>) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge group="BroadcastStatus" value={r.status} /> },
  ];

  const pctCreditos = creditos?.total ? Math.min(100, Math.round(((creditos.usado || 0) / creditos.total) * 100)) : 0;

  return (
    <Layout title="Campanhas" subtitle="Disparo pela API Oficial — segmentos da base, templates aprovados e agendamento">
      {/* Painel de créditos */}
      <Card>
        <div className="flex" style={{ alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Zap size={20} style={{ color: 'var(--gold, #F7A810)' }} />
            <div>
              <div className="stat-label">Créditos de mensagem</div>
              {creditos?.total ? (
                <div className="stat-value" style={{ fontSize: 22 }}>
                  {(creditos.saldo ?? 0).toLocaleString('pt-BR')} <span className="cell-muted" style={{ fontSize: 13, fontWeight: 400 }}>de {creditos.total.toLocaleString('pt-BR')}</span>
                </div>
              ) : (
                <div className="cell-muted">Nenhum pacote ativado</div>
              )}
            </div>
          </div>
          {creditos?.total > 0 && (
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="bc-progress-bar"><div className="bc-progress-fill" style={{ width: `${pctCreditos}%` }} /></div>
              <div className="cell-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {creditos.usado.toLocaleString('pt-BR')} usados · validade: {creditos.diasRestantes} dia(s) restante(s)
                {creditos.expirado && <b style={{ color: 'var(--red)' }}> · EXPIRADO</b>}
              </div>
            </div>
          )}
          {isLider && (!creditos?.total || (creditos?.expirado)) && (
            <button className="btn btn-primary" onClick={ativarPacote}><Zap size={15} /> Ativar pacote 80.000</button>
          )}
        </div>

        {/* Rodízio de números — o envio alterna entre os ativos, respeitando o limite diário de cada um */}
        {pool?.numeros?.length > 0 && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border, #e6e9ee)', paddingTop: 12 }}>
            <div className="stat-label" style={{ marginBottom: 8 }}>Rodízio de números · envios de hoje ({pool.dia})</div>
            <div className="pool-grid">
              {pool.numeros.map((n) => {
                const pct = n.dailyCap ? Math.min(100, Math.round((n.sentToday / n.dailyCap) * 100)) : 0;
                return (
                  <div key={n.id} className={`pool-card ${n.active ? '' : 'pool-off'}`}>
                    <div className="flex" style={{ alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 13 }}>{n.display}</b>
                      <div className="spacer" />
                      {isLider && (
                        <button className={`btn btn-sm ${n.active ? '' : 'btn-primary'}`} onClick={() => alternarNumero(n)}>
                          {n.active ? 'Pausar' : 'Ativar'}
                        </button>
                      )}
                    </div>
                    <div className="bc-progress-bar" style={{ marginTop: 6 }}><div className="bc-progress-fill" style={{ width: `${pct}%` }} /></div>
                    <div className="cell-muted" style={{ fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {n.sentToday}/
                      {isLider ? (
                        <input
                          className="input" type="number" defaultValue={n.dailyCap}
                          style={{ width: 74, padding: '1px 6px', fontSize: 11, height: 22 }}
                          onBlur={(e) => salvarCap(n, e.target.value)}
                          title="Limite diário deste número (tier da Meta)"
                        />
                      ) : n.dailyCap}
                      hoje · total {n.sentTotal.toLocaleString('pt-BR')}
                      {!n.active && <b style={{ color: 'var(--amber, #b7791f)' }}>· fora do rodízio</b>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <div className="toolbar" style={{ marginTop: 16 }}>
        <div className="search">
          <Search size={16} />
          <input className="input" placeholder="Buscar campanha..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select className="select" style={{ width: 'auto' }} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
          <option value="">Todos os status</option>
          {options('BroadcastStatus').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="spacer" />
        <button className="btn" onClick={() => { setExFiltro({ campaignId: '', status: '', sender: '', search: '', de: '', ate: '', page: 1 }); setExtratoOpen(true); }}>
          <ScrollText size={16} /> Extrato de envios
        </button>
        <button className="btn btn-primary" onClick={abrirWizard}><Plus size={16} /> Nova campanha</button>
      </div>

      <Card noBody>
        {loading ? (
          <LoadingBox />
        ) : (
          <DataTable
            columns={columns}
            rows={list}
            empty={<EmptyState icon={Megaphone} title="Nenhuma campanha" message="Crie uma campanha para falar com a sua base." />}
            actions={(row) => (
              <div className="flex gap-8">
                <button className="btn btn-ghost btn-sm" onClick={() => openDetail(row)}>Abrir</button>
                <button className="btn btn-ghost btn-sm" title="Duplicar" onClick={() => duplicar(row)}><Copy size={14} /></button>
              </div>
            )}
          />
        )}
      </Card>

      {/* ==================== WIZARD ==================== */}
      {wizardOpen && (
        <Modal
          title={`Nova campanha — passo ${passo} de 4`}
          wide
          onClose={() => setWizardOpen(false)}
          footer={
            <>
              {passo > 1 && passo < 4 && <button className="btn" onClick={() => setPasso(passo - 1)}><ChevronLeft size={15} /> Voltar</button>}
              <div className="spacer" />
              {passo < 4 && <button className="btn btn-primary" disabled={salvando} onClick={avancar}>{salvando ? 'Salvando...' : <>Avançar <ChevronRight size={15} /></>}</button>}
              {passo === 4 && (
                <>
                  <button className="btn" disabled={salvando || !declAceita} onClick={() => concluirWizard(false)}>
                    <Clock size={15} /> {form.scheduledAt ? 'Confirmar agendamento' : 'Salvar para depois'}
                  </button>
                  {isLider && !form.scheduledAt && (
                    <button className="btn btn-primary" disabled={salvando || !declAceita} onClick={() => concluirWizard(true)}>
                      <Send size={15} /> Enviar agora
                    </button>
                  )}
                </>
              )}
            </>
          }
        >
          {/* Passo 1 — dados */}
          {passo === 1 && (
            <>
              <Field field={{ name: 'name', label: 'Nome da campanha', required: true, hint: 'Uso interno — ex.: "Convite lançamento Zona Sul".' }} value={form.name} onChange={setCampo} />
              <Field field={{ name: 'scheduledAt', label: 'Agendar para (opcional)', type: 'datetime-local', hint: 'Em branco = envio manual. Agendada, o sistema dispara sozinho no horário.' }} value={form.scheduledAt} onChange={setCampo} />
            </>
          )}

          {/* Passo 2 — público */}
          {passo === 2 && (
            <>
              <div className="field">
                <label><Users size={14} style={{ verticalAlign: -2 }} /> Bases importadas</label>
                <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className={`btn btn-sm ${filtros.usarBase !== false ? 'btn-primary' : ''}`} onClick={() => { setFiltros((f) => ({ ...f, usarBase: f.usarBase === false })); setPreviewPublico(null); }}>
                    Usar a base de apoiadores
                  </button>
                  <button type="button" className={`btn btn-sm ${filtros.apenasVoluntarios ? 'btn-primary' : ''}`} onClick={() => { setFiltros((f) => ({ ...f, apenasVoluntarios: !f.apenasVoluntarios })); setPreviewPublico(null); }}>
                    Somente voluntários ativos {opcoes ? `(${opcoes.voluntariosAtivos})` : ''}
                  </button>
                </div>
                <span className="field-hint">Sem nenhum filtro abaixo, entra a base inteira com telefone. Cada filtro reduz o público.</span>
              </div>

              {filtros.usarBase !== false && (
                <>
                  <div className="field">
                    <label>Grupos / etiquetas</label>
                    <div className="chip-wrap">
                      {(tags || []).slice(0, 60).map((t) => {
                        const nome = t.tag || t.value || t;
                        const qtd = t.count ?? t.total ?? null;
                        const on = (filtros.tags || []).includes(nome);
                        return (
                          <button key={nome} type="button" className={`chip ${on ? 'chip-on' : ''}`} onClick={() => toggleFiltro('tags', nome)}>
                            {nome}{qtd != null ? ` · ${qtd}` : ''}
                          </button>
                        );
                      })}
                      {(!tags || !tags.length) && <span className="cell-muted">Sem etiquetas na base.</span>}
                    </div>
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="field">
                      <label>Cidades</label>
                      <div className="chip-wrap" style={{ maxHeight: 130, overflow: 'auto' }}>
                        {(opcoes?.cidades || []).map((c) => (
                          <button key={c.value} type="button" className={`chip ${(filtros.cities || []).includes(c.value) ? 'chip-on' : ''}`} onClick={() => toggleFiltro('cities', c.value)}>
                            {c.value} · {c.count}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="field">
                      <label>Bairros</label>
                      <div className="chip-wrap" style={{ maxHeight: 130, overflow: 'auto' }}>
                        {(opcoes?.bairros || []).map((b) => (
                          <button key={b.value} type="button" className={`chip ${(filtros.neighborhoods || []).includes(b.value) ? 'chip-on' : ''}`} onClick={() => toggleFiltro('neighborhoods', b.value)}>
                            {b.value} · {b.count}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="field">
                <label><ClipboardList size={14} style={{ verticalAlign: -2 }} /> Colar números novos (um por linha)</label>
                <textarea
                  className="textarea" rows={4}
                  placeholder={'51999990000 Maria da Silva\n(51) 98888-7777\n5551977776666'}
                  value={colados}
                  onChange={(e) => { setColados(e.target.value); setPreviewPublico(null); }}
                />
                <span className="field-hint">Aceita com ou sem DDI 55, com máscara ou só dígitos. O nome depois do número é opcional.</span>
              </div>

              <div className="flex gap-8" style={{ alignItems: 'center' }}>
                <button className="btn btn-primary" disabled={calculando} onClick={calcularPublico}><RefreshCw size={15} /> {calculando ? 'Calculando...' : 'Calcular público'}</button>
                {previewPublico && (
                  <div className="media-caption" style={{ flex: 1 }}>
                    <b>{previewPublico.total.toLocaleString('pt-BR')} destinatários</b>
                    {' '}· base: {previewPublico.daBase - previewPublico.semTelefone} · colados válidos: {previewPublico.colados - previewPublico.coladosInvalidos}
                    {previewPublico.blacklist > 0 && <> · <b style={{ color: 'var(--red)' }}>{previewPublico.blacklist} na lista de supressão (fora)</b></>}
                    {previewPublico.duplicados > 0 && <> · {previewPublico.duplicados} duplicados</>}
                    {previewPublico.coladosInvalidos > 0 && <> · {previewPublico.coladosInvalidos} inválidos</>}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Passo 3 — mensagem */}
          {passo === 3 && (
            <>
              <div className="field">
                <label>Tipo de envio</label>
                <div className="flex gap-8">
                  <button type="button" className={`btn ${modo === 'template' ? 'btn-primary' : ''}`} onClick={() => setModo('template')}>Template aprovado</button>
                  <button type="button" className={`btn ${modo === 'livre' ? 'btn-primary' : ''}`} onClick={() => setModo('livre')}>Mensagem livre</button>
                </div>
                <span className="field-hint">{modo === 'template' ? 'Necessário para alcançar quem não falou com o número nas últimas 24h.' : 'Entrega somente para quem respondeu nas últimas 24 horas.'}</span>
              </div>

              {modo === 'template' ? (
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div className="field">
                      <label>Templates aprovados na conta <span className="req">*</span></label>
                      <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border, #e2e5ea)', borderRadius: 8 }}>
                        {templates.map((t) => (
                          <button
                            key={t.name} type="button"
                            className="tpl-item"
                            style={{
                              display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none',
                              borderBottom: '1px solid var(--border, #eef0f3)', background: form.templateName === t.name ? 'var(--soft-primary, #e7eff7)' : 'transparent', cursor: 'pointer',
                            }}
                            onClick={() => selecionarTemplate(t.name)}
                          >
                            <div className="cell-strong" style={{ fontSize: 13 }}>{t.name}</div>
                            <div className="cell-muted" style={{ fontSize: 11 }}>{t.category} · {t.language}{t.headerFormat ? ` · topo ${t.headerFormat}` : ''}{t.bodyVarCount ? ` · ${t.bodyVarCount} variável(is)` : ''}</div>
                          </button>
                        ))}
                        {templates.length === 0 && <div className="cell-muted" style={{ padding: 12 }}>Nenhum template aprovado encontrado na conta.</div>}
                      </div>
                    </div>
                    {tplSel?.headerFormat === 'IMAGE' && (
                      <Field field={{ name: 'headerImageUrl', label: 'Imagem do topo (URL pública)', hint: 'Ex.: arte da campanha hospedada no site.' }} value={form.headerImageUrl} onChange={setCampo} />
                    )}
                    {tplSel?.bodyVarCount > 0 && (
                      <div className="field">
                        <label>Variáveis do texto</label>
                        {vars.map((v, i) => (
                          <div key={i} className="flex gap-8" style={{ marginBottom: 6, alignItems: 'center' }}>
                            <span className="cell-muted" style={{ width: 42 }}>{'{{' + (i + 1) + '}}'}</span>
                            <select className="select" style={{ flex: 1 }} value={v.source} onChange={(e) => setVars((arr) => arr.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}>
                              {FONTES_VAR.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                            {v.source === 'fixo' && (
                              <input className="input" style={{ flex: 1 }} placeholder="Texto fixo" value={v.value || ''} onChange={(e) => setVars((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="field"><label>Prévia</label></div>
                    {tplSel ? <PreviewBolha tpl={tplSel} headerImageUrl={form.headerImageUrl} vars={vars} /> : <div className="cell-muted">Selecione um template para ver a prévia.</div>}
                  </div>
                </div>
              ) : (
                <Field field={{ name: 'message', label: 'Mensagem', type: 'textarea', rows: 5, hint: 'Variáveis: {{nome}}, {{cidade}}, {{bairro}}, {{responsavel}}' }} value={form.message} onChange={setCampo} />
              )}
            </>
          )}

          {/* Passo 4 — revisão + declaração */}
          {passo === 4 && (
            <>
              <div className="grid stats-grid" style={{ marginBottom: 14 }}>
                <div className="stat-card"><div className="stat-meta"><div className="stat-label">Destinatários</div><div className="stat-value">{(previewPublico?.total || 0).toLocaleString('pt-BR')}</div></div></div>
                <div className="stat-card"><div className="stat-meta"><div className="stat-label">Créditos após envio</div><div className="stat-value">{Math.max(0, (creditos?.saldo || 0) - (previewPublico?.total || 0)).toLocaleString('pt-BR')}</div></div></div>
                <div className="stat-card"><div className="stat-meta"><div className="stat-label">Quando</div><div className="stat-value" style={{ fontSize: 15 }}>{form.scheduledAt ? fmtData(form.scheduledAt) : 'Envio manual'}</div></div></div>
              </div>
              {(creditos?.saldo || 0) < (previewPublico?.total || 0) && (
                <div className="warning-box" style={{ marginBottom: 12 }}>
                  <span>O público é maior que o saldo de créditos. O envio para automaticamente quando o saldo acabar.</span>
                </div>
              )}

              <div className="field">
                <label>Teste antes de enviar (recomendado)</label>
                <div className="flex gap-8">
                  <input className="input" style={{ maxWidth: 220 }} placeholder="Seu número com DDD" value={fonesTeste} onChange={(e) => setFoneTeste(e.target.value)} />
                  <button className="btn" onClick={enviarTesteWizard}><Send size={14} /> Enviar teste</button>
                </div>
                <span className="field-hint">Envia a mensagem real para o número informado (consome 1 crédito).</span>
              </div>

              <div className="decl-box" style={{ border: '1.5px solid var(--navy, #043868)', borderRadius: 10, padding: '14px 16px', background: 'var(--soft-primary, #f4f7fa)' }}>
                <div className="flex" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <input id="decl" type="checkbox" checked={declAceita} onChange={(e) => setDeclAceita(e.target.checked)} style={{ marginTop: 4, width: 16, height: 16 }} />
                  <label htmlFor="decl" style={{ fontSize: 13, lineHeight: 1.55, cursor: 'pointer' }}>
                    {declInfo?.texto || 'Carregando o texto da declaração...'}
                  </label>
                </div>
                <div className="cell-muted" style={{ fontSize: 11, marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={13} /> O aceite registra usuário, data, hora e IP, e fica na auditoria da campanha. Sem o aceite o sistema bloqueia o envio.
                </div>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ==================== EXTRATO DE ENVIOS ==================== */}
      {extratoOpen && (
        <Modal title="Extrato de envios" wide onClose={() => setExtratoOpen(false)}>
          {(() => {
            const r = extrato.resumo || {};
            const enviadas = (r.ENVIADO || 0) + (r.ENTREGUE || 0) + (r.LIDA || 0);
            const entregues = (r.ENTREGUE || 0) + (r.LIDA || 0);
            const lidas = r.LIDA || 0;
            const falhas = r.FALHA || 0;
            const txEnt = enviadas ? Math.round((entregues / enviadas) * 100) : 0;
            const txLida = enviadas ? Math.round((lidas / enviadas) * 100) : 0;
            return (
              <div className="grid stats-grid" style={{ marginBottom: 14 }}>
                <div className="stat-card"><div className="stat-meta"><div className="stat-label">Enviadas</div><div className="stat-value">{enviadas.toLocaleString('pt-BR')}</div></div></div>
                <div className="stat-card"><div className="stat-meta"><div className="stat-label">Entregues</div><div className="stat-value" style={{ color: 'var(--green-rs, #2DBE60)' }}>{entregues.toLocaleString('pt-BR')} <span className="cell-muted" style={{ fontSize: 12, fontWeight: 400 }}>({txEnt}%)</span></div></div></div>
                <div className="stat-card"><div className="stat-meta"><div className="stat-label">Lidas</div><div className="stat-value">{lidas.toLocaleString('pt-BR')} <span className="cell-muted" style={{ fontSize: 12, fontWeight: 400 }}>({txLida}%)</span></div></div></div>
                <div className="stat-card"><div className="stat-meta"><div className="stat-label">Falhas</div><div className="stat-value" style={{ color: 'var(--red, #c53030)' }}>{falhas.toLocaleString('pt-BR')}</div></div></div>
              </div>
            );
          })()}

          <div className="flex gap-8" style={{ flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            <select className="select" style={{ width: 'auto', maxWidth: 220 }} value={exFiltro.campaignId} onChange={(e) => setExF('campaignId', e.target.value)}>
              <option value="">Todas as campanhas</option>
              {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="select" style={{ width: 'auto' }} value={exFiltro.status} onChange={(e) => setExF('status', e.target.value)}>
              <option value="">Todos os status</option>
              {options('BroadcastContactStatus').filter((o) => o.value !== 'PENDENTE').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="select" style={{ width: 'auto' }} value={exFiltro.sender} onChange={(e) => setExF('sender', e.target.value)}>
              <option value="">Todos os números</option>
              {(pool?.numeros || []).map((n) => <option key={n.phoneNumberId} value={n.phoneNumberId}>{n.display}</option>)}
            </select>
            <input className="input" type="date" style={{ width: 'auto' }} value={exFiltro.de} onChange={(e) => setExF('de', e.target.value)} title="De" />
            <input className="input" type="date" style={{ width: 'auto' }} value={exFiltro.ate} onChange={(e) => setExF('ate', e.target.value)} title="Até" />
            <input className="input" style={{ flex: 1, minWidth: 150 }} placeholder="Nome ou telefone..." value={exFiltro.search} onChange={(e) => setExF('search', e.target.value)} />
            <button className="btn btn-ghost btn-sm" onClick={exportarExtrato}><Download size={14} /> CSV</button>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Enviado em</th><th>Campanha</th><th>Nome</th><th>Telefone</th><th>Via</th><th>Status</th><th>Recebimento</th></tr></thead>
              <tbody>
                {extrato.data.map((c) => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtData(c.sentAt || c.createdAt)}</td>
                    <td className="cell-muted" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.campaign?.name || '—'}</td>
                    <td>{c.name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.phone}</td>
                    <td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{displayNumero(c.senderPhoneId)}</td>
                    <td><StatusBadge group="BroadcastContactStatus" value={c.status} /></td>
                    <td className="cell-muted" style={{ fontSize: 12 }}>
                      {c.status === 'FALHA'
                        ? (c.error || 'Falha')
                        : [c.deliveredAt && `entregue ${fmtData(c.deliveredAt)}`, c.readAt && `lida ${fmtData(c.readAt)}`].filter(Boolean).join(' · ') || 'aguardando confirmação'}
                    </td>
                  </tr>
                ))}
                {!extrato.data.length && <tr><td colSpan={7} className="cell-muted">Nenhum envio no período/filtros selecionados.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex gap-8" style={{ alignItems: 'center', marginTop: 10 }}>
            <span className="cell-muted" style={{ fontSize: 12 }}>{extrato.total.toLocaleString('pt-BR')} registro(s) · atualiza sozinho a cada 8s</span>
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm" disabled={(exFiltro.page || 1) <= 1} onClick={() => setExFiltro((f) => ({ ...f, page: (f.page || 1) - 1 }))}><ChevronLeft size={14} /></button>
            <span className="cell-muted" style={{ fontSize: 12 }}>pág. {exFiltro.page || 1}</span>
            <button className="btn btn-ghost btn-sm" disabled={(exFiltro.page || 1) * 50 >= extrato.total} onClick={() => setExFiltro((f) => ({ ...f, page: (f.page || 1) + 1 }))}><ChevronRight size={14} /></button>
          </div>
        </Modal>
      )}

      {/* ==================== DETALHE ==================== */}
      {detail && (
        <Modal title={detail.name} wide onClose={() => { setDetail(null); load(); }}>
          <div className="flex gap-8" style={{ marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge group="BroadcastStatus" value={detail.status} />
            {detail.scheduledAt && <Badge tone="blue"><Clock size={12} style={{ verticalAlign: -2 }} /> {fmtData(detail.scheduledAt)}</Badge>}
            {detail.declAcceptedAt
              ? <Badge tone="green"><ShieldCheck size={12} style={{ verticalAlign: -2 }} /> Declaração: {detail.declUserName || 'registrada'} em {fmtData(detail.declAcceptedAt)}</Badge>
              : <Badge tone="amber">Declaração pendente</Badge>}
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={exportarCsv}><Download size={14} /> Exportar CSV</button>
            {isLider && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => excluir(detail)}><Trash2 size={14} /> Excluir</button>}
          </div>

          <div className="grid stats-grid" style={{ marginBottom: 14 }}>
            <div className="stat-card"><div className="stat-meta"><div className="stat-label">Total</div><div className="stat-value">{detail.totalContacts}</div></div></div>
            <div className="stat-card"><div className="stat-meta"><div className="stat-label">Enviadas</div><div className="stat-value" style={{ color: 'var(--green-rs, #2DBE60)' }}>{detail.sentCount}</div></div></div>
            <div className="stat-card"><div className="stat-meta"><div className="stat-label">Entregues</div><div className="stat-value">{detail.deliveredCount || 0}</div></div></div>
            <div className="stat-card"><div className="stat-meta"><div className="stat-label">Lidas</div><div className="stat-value">{detail.readCount || 0}</div></div></div>
            <div className="stat-card"><div className="stat-meta"><div className="stat-label">Pendentes</div><div className="stat-value" style={{ color: 'var(--amber, #b7791f)' }}>{detail.pendingCount}</div></div></div>
            <div className="stat-card"><div className="stat-meta"><div className="stat-label">Falhas</div><div className="stat-value" style={{ color: 'var(--red, #c53030)' }}>{detail.failedCount}</div></div></div>
          </div>

          <div className="field">
            <label>{detail.templateName ? 'Template de disparo' : 'Mensagem'}</label>
            <div className="media-caption">{detail.templateName ? `${detail.templateName} · ${detail.templateLang || 'pt_BR'}` : (detail.message || '—')}</div>
          </div>

          {/* Gate da declaração no detalhe (campanha sem aceite) */}
          {!detail.declAcceptedAt && isLider && ['RASCUNHO', 'AGENDADA', 'PAUSADA'].includes(detail.status) && (
            <div className="decl-box" style={{ border: '1.5px solid var(--navy, #043868)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, background: 'var(--soft-primary, #f4f7fa)' }}>
              <div className="flex" style={{ gap: 10, alignItems: 'flex-start' }}>
                <input id="decl2" type="checkbox" checked={declDetalheAceita} onChange={(e) => setDeclDetalheAceita(e.target.checked)} style={{ marginTop: 4, width: 16, height: 16 }} />
                <label htmlFor="decl2" style={{ fontSize: 13, lineHeight: 1.5, cursor: 'pointer' }}>{declInfo?.texto}</label>
              </div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={!declDetalheAceita} onClick={aceitarDeclaracaoDetalhe}>
                <ShieldCheck size={14} /> Registrar declaração e liberar envio
              </button>
            </div>
          )}

          <div className="flex gap-8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
            {isLider && !sendingState && ['RASCUNHO', 'AGENDADA', 'PAUSADA', 'ENVIANDO'].includes(detail.status) && (
              <button className="btn btn-primary" onClick={() => dispararLoop(detail)} disabled={!detail.declAcceptedAt}>
                <Send size={15} /> {detail.sentCount > 0 ? 'Continuar envio' : 'Disparar agora'}
              </button>
            )}
            {sendingState && <button className="btn btn-danger" onClick={() => { cancelRef.current = true; }}><Pause size={15} /> Pausar envio</button>}
            {isLider && detail.status === 'PAUSADA' && !sendingState && (
              <button className="btn" onClick={async () => { try { await api.post(`/broadcasts/${detail.id}/resume`); refreshDetail(detail.id); } catch (e) { toast.error(apiError(e)); } }}>
                <Play size={15} /> Retomar (envio automático)
              </button>
            )}
            {isLider && (
              <div className="flex gap-8" style={{ alignItems: 'center' }}>
                <input className="input" style={{ maxWidth: 190 }} placeholder="Número para teste" value={fonesTeste} onChange={(e) => setFoneTeste(e.target.value)} />
                <button
                  className="btn"
                  onClick={async () => {
                    if (!fonesTeste.trim()) return toast.error('Informe o número.');
                    try { await api.post(`/broadcasts/${detail.id}/teste`, { phone: fonesTeste }); toast.success('Teste enviado.'); carregarCreditos(); } catch (e) { toast.error(apiError(e)); }
                  }}
                >
                  Teste
                </button>
              </div>
            )}
          </div>

          {sendingState && (
            <div className="bc-progress" style={{ marginBottom: 14 }}>
              <div className="bc-progress-bar"><div className="bc-progress-fill" style={{ width: `${sendingState.pct}%` }} /></div>
              <div className="bc-progress-info">Enviando... <b>{sendingState.sent}</b> enviadas · {sendingState.failed} falhas · {sendingState.total} total ({sendingState.pct}%)</div>
            </div>
          )}

          <div className="flex gap-8" style={{ alignItems: 'center', marginBottom: 8 }}>
            <label className="cell-muted" style={{ fontSize: 12 }}>Contatos ({contatos.total}):</label>
            <select className="select" style={{ width: 'auto' }} value={contatoStatus} onChange={(e) => { setContatoStatus(e.target.value); setContatos((c) => ({ ...c, page: 1 })); }}>
              <option value="">Todos</option>
              {options('BroadcastContactStatus').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="spacer" />
            <button className="btn btn-ghost btn-sm" disabled={contatos.page <= 1} onClick={() => setContatos((c) => ({ ...c, page: c.page - 1 }))}><ChevronLeft size={14} /></button>
            <span className="cell-muted" style={{ fontSize: 12 }}>pág. {contatos.page}</span>
            <button className="btn btn-ghost btn-sm" disabled={contatos.page * 50 >= contatos.total} onClick={() => setContatos((c) => ({ ...c, page: c.page + 1 }))}><ChevronRight size={14} /></button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nome</th><th>Telefone</th><th>Origem</th><th>Status</th><th>Detalhe</th></tr></thead>
              <tbody>
                {contatos.data.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name || '—'}</td>
                    <td>{c.phone}</td>
                    <td className="cell-muted">{c.source || '—'}</td>
                    <td><StatusBadge group="BroadcastContactStatus" value={c.status} /></td>
                    <td className="cell-muted" style={{ fontSize: 12 }}>
                      {c.status === 'FALHA' ? (c.error || '') : [c.deliveredAt && `entregue ${fmtData(c.deliveredAt)}`, c.readAt && `lida ${fmtData(c.readAt)}`].filter(Boolean).join(' · ')}
                    </td>
                  </tr>
                ))}
                {!contatos.data.length && <tr><td colSpan={5} className="cell-muted">Nenhum contato.</td></tr>}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

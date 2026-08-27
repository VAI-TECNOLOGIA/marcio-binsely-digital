import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Send, Megaphone, X, Search, ShieldCheck, Clock, Copy, Trash2,
  Download, Pause, Play, ChevronLeft, ChevronRight, Zap, ClipboardList,
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

const ORIGENS = {
  CAMPANHA: 'Campanha', JORNADA: 'Automática', TESTE: 'Teste', CONVERSA: 'Conversa', AVULSO: 'Avulso',
};
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

/** Exemplos usados na prévia para dados do contato. */
const EXEMPLO_VAR = { nome: 'Maria', cidade: 'Porto Alegre', bairro: 'Centro', responsavel: 'Carlos' };

/** Trecho da frase logo antes da variável — vira o rótulo do campo. */
function contextoVar(bodyText, n) {
  const idx = (bodyText || '').indexOf(`{{${n}}}`);
  if (idx < 0) return `Campo ${n}`;
  const antes = (bodyText || '').slice(0, idx).trim().split(/\s+/).slice(-4).join(' ');
  return antes ? `... ${antes} ___` : `Campo ${n}`;
}

/**
 * Prévia AO VIVO da mensagem: dados do contato entram como exemplo real,
 * texto digitado entra na hora e lacuna vazia fica destacada em âmbar.
 */
function PreviewBolha({ tpl, headerImageUrl, vars }) {
  if (!tpl) return null;
  const texto = tpl.bodyText || '';
  const partes = [];
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(texto))) {
    if (m.index > last) partes.push(texto.slice(last, m.index));
    const v = vars?.[Number(m[1]) - 1];
    if (v && v.source === 'fixo') {
      partes.push(v.value?.trim()
        ? <span key={k++} className="wa-fill">{v.value}</span>
        : <span key={k++} className="wa-gap">escreva aqui</span>);
    } else if (v && !v.source) {
      partes.push(<span key={k++} className="wa-gap">escolha abaixo</span>);
    } else if (v) {
      partes.push(<span key={k++} className="wa-fill" title={FONTES_VAR.find((f) => f.value === v.source)?.label}>{EXEMPLO_VAR[v.source] || EXEMPLO_VAR.nome}</span>);
    } else {
      partes.push(<span key={k++} className="wa-gap">escreva aqui</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < texto.length) partes.push(texto.slice(last));
  return (
    <div className="wa-preview">
      <div className="wa-bubble">
        {tpl.headerFormat === 'IMAGE' && (
          headerImageUrl
            ? <img src={headerImageUrl} alt="" className="wa-header-img" onError={(e) => { e.target.style.display = 'none'; }} />
            : <div className="wa-header-ph">Imagem do topo</div>
        )}
        {tpl.headerText && <div className="wa-header-text">{tpl.headerText}</div>}
        <div className="wa-body">{partes}</div>
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
  // Público — modo simples primeiro (divulgação progressiva)
  const [modoPublico, setModoPublico] = useState('todos'); // todos | voluntarios | segmentar
  const [buscaGrupo, setBuscaGrupo] = useState('');
  const [verTodosGrupos, setVerTodosGrupos] = useState(false);
  const [vars, setVars] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [campId, setCampId] = useState(null);
  const [declAceita, setDeclAceita] = useState(false);
  const [fonesTeste, setFoneTeste] = useState('');
  // Decisão final da campanha: enviar agora, agendar ou guardar rascunho.
  const [modoEnvio, setModoEnvio] = useState('agora');

  // Criador de modelos (template) com prévia de celular.
  const [tplOpen, setTplOpen] = useState(false);
  const [tplForm, setTplForm] = useState({ titulo: '', corpo: '', rodape: '', tipoBotoes: 'nenhum', botoes: [''], urlBotao: '', textoBotaoUrl: '', imagem: null });
  const [tplSalvando, setTplSalvando] = useState(false);
  const [tplSubindoImg, setTplSubindoImg] = useState(false);

  // Extrato de envios (monitoramento cruzando campanhas)
  const [extratoOpen, setExtratoOpen] = useState(false);
  const [extrato, setExtrato] = useState({ data: [], total: 0, page: 1, resumo: {} });
  const [exFiltro, setExFiltro] = useState({ campaignId: '', status: '', sender: '', search: '', de: '', ate: '', kind: '', page: 1 });

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
      for (const k of ['campaignId', 'status', 'sender', 'search', 'de', 'ate', 'kind']) if (filtro[k]) params[k] = filtro[k];
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
      for (const k of ['campaignId', 'status', 'sender', 'search', 'de', 'ate', 'kind']) if (exFiltro[k]) params[k] = exFiltro[k];
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
    setModoPublico('todos');
    setBuscaGrupo('');
    setVerTodosGrupos(false);
    setColados('');
    setPreviewPublico(null);
    setVars([]);
    setCampId(null);
    setDeclAceita(false);
    setModoEnvio('agora');
    setPasso(1);
    setWizardOpen(true);
    if (!opcoes) {
      api.get('/broadcasts/audiencia/opcoes').then(({ data }) => setOpcoes(data)).catch(() => {});
      api.get('/supporters/tags').then(({ data }) => setTags(data.data || data || [])).catch(() => {});
    }
  }

  function selecionarTemplate(name) {
    const t = templates.find((x) => x.name === name);
    setForm((s) => ({ ...s, templateName: name || null, templateLang: t?.language || 'pt_BR', headerImageUrl: t?.headerFormat === 'IMAGE' ? (s.headerImageUrl || t?.headerUrl || '') : null }));
    setVars(Array.from({ length: t?.bodyVarCount || 0 }, (_, i) => ({ source: i === 0 ? 'nome' : '', value: '' })));
  }

  function toggleFiltro(chave, valor) {
    setFiltros((f) => {
      const atual = new Set(f[chave] || []);
      if (atual.has(valor)) atual.delete(valor); else atual.add(valor);
      return { ...f, [chave]: [...atual] };
    });
    setPreviewPublico(null);
  }

  function trocarModoPublico(m) {
    setModoPublico(m);
    if (m === 'todos') setFiltros({ usarBase: true });
    else if (m === 'voluntarios') setFiltros({ usarBase: true, apenasVoluntarios: true });
    else setFiltros((f) => ({ usarBase: true, apenasVoluntarios: false, tags: f.tags || [], cities: f.cities || [], neighborhoods: f.neighborhoods || [], statuses: f.statuses || [] }));
    setPreviewPublico(null);
  }

  // O público calcula SOZINHO: qualquer mudança de filtro/números atualiza a
  // contagem depois de 600ms — feedback contínuo, sem botão "Calcular".
  useEffect(() => {
    if (!wizardOpen || passo !== 2) return;
    const t = setTimeout(() => { calcularPublico(); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardOpen, passo, filtros, colados]);

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
      if (calculando || !previewPublico) return toast.error('Um instante — ainda calculando o público.');
      if (!previewPublico.total) return toast.error('O público está vazio — ajuste a seleção ou cole números.');
      return setPasso(3);
    }
    if (passo === 3) {
      if (!form.templateName) return toast.error('Escolha um modelo aprovado.');
      if (vars.some((v) => !v.source)) return toast.error('Defina de onde vem cada informação do texto.');
      if (vars.some((v) => v.source === 'fixo' && !(v.value || '').trim())) return toast.error('Preencha os campos marcados como "igual para todos".');
      // Cria a campanha (rascunho/agendada) + grava o público.
      setSalvando(true);
      try {
        const payload = {
          name: form.name,
          channel: 'WHATSAPP',
          templateName: form.templateName,
          templateLang: form.templateLang,
          headerImageUrl: form.headerImageUrl || null,
          varsJson: vars,
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

  async function concluirWizard() {
    setSalvando(true);
    try {
      if (modoEnvio === 'rascunho') {
        // Rascunho não exige declaração — nada vai ser enviado.
        await api.patch(`/broadcasts/${campId}`, { scheduledAt: null });
        toast.success('Campanha salva como rascunho. Abra quando quiser enviar.');
        setWizardOpen(false);
      } else if (modoEnvio === 'agendar') {
        if (!form.scheduledAt) { toast.error('Escolha a data e a hora do envio.'); return; }
        if (!declAceita) { toast.error('Marque a declaração para agendar o envio.'); return; }
        await api.patch(`/broadcasts/${campId}`, { scheduledAt: form.scheduledAt });
        await api.post(`/broadcasts/${campId}/declaracao`, { aceito: true });
        toast.success('Campanha agendada. O sistema envia sozinho no horário.');
        setWizardOpen(false);
      } else {
        if (!declAceita) { toast.error('Marque a declaração para liberar o envio.'); return; }
        await api.post(`/broadcasts/${campId}/declaracao`, { aceito: true });
        setWizardOpen(false);
        const { data } = await api.get(`/broadcasts/${campId}`);
        setDetail(data);
        await dispararLoop(data);
      }
      load();
      carregarCreditos();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSalvando(false);
    }
  }

  // ---------- Criador de modelos ----------
  const setTpl = (k, v) => setTplForm((f) => ({ ...f, [k]: v }));
  async function subirImagemTpl(file) {
    if (!file) return;
    setTplSubindoImg(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setTpl('imagem', { filename: data.filename, url: data.url });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setTplSubindoImg(false);
    }
  }
  async function enviarTemplateParaAnalise() {
    setTplSalvando(true);
    try {
      const payload = {
        titulo: tplForm.titulo,
        corpo: tplForm.corpo,
        rodape: tplForm.rodape,
        tipoBotoes: tplForm.tipoBotoes,
        botoes: tplForm.botoes.map((b) => b.trim()).filter(Boolean),
        urlBotao: tplForm.urlBotao,
        textoBotaoUrl: tplForm.textoBotaoUrl,
        imagemFilename: tplForm.imagem?.filename || '',
      };
      const { data } = await api.post('/whatsapp/templates', payload);
      toast.success(`Modelo "${data.name}" enviado para análise da Meta. Ele aparece na galeria assim que for aprovado.`);
      setTplOpen(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setTplSalvando(false);
    }
  }

  // ---------- Detalhe ----------  // ---------- Detalhe ----------
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
        <button className="btn" onClick={() => { setTplForm({ titulo: '', corpo: '', rodape: '', tipoBotoes: 'nenhum', botoes: [''], urlBotao: '', textoBotaoUrl: '', imagem: null }); setTplOpen(true); }}>
          <ClipboardList size={16} /> Criar modelo
        </button>
        <button className="btn" onClick={() => { setExFiltro({ campaignId: '', status: '', sender: '', search: '', de: '', ate: '', kind: '', page: 1 }); setExtratoOpen(true); }}>
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
                  <button className="btn" onClick={() => setPasso(3)}><ChevronLeft size={15} /> Voltar</button>
                  <button
                    className="btn btn-primary"
                    disabled={salvando || (modoEnvio !== 'rascunho' && !declAceita) || (modoEnvio === 'agendar' && !form.scheduledAt)}
                    onClick={concluirWizard}
                  >
                    {modoEnvio === 'agora' && <><Send size={15} /> {salvando ? 'Enviando...' : 'Enviar agora'}</>}
                    {modoEnvio === 'agendar' && <><Clock size={15} /> {salvando ? 'Agendando...' : 'Agendar envio'}</>}
                    {modoEnvio === 'rascunho' && <>{salvando ? 'Salvando...' : 'Salvar rascunho'}</>}
                  </button>
                </>
              )}
            </>
          }
        >
          {/* Passo 1 — dados */}
          {passo === 1 && (
            <>
              <Field field={{ name: 'name', label: 'Nome da campanha', required: true, hint: 'Uso interno — ex.: "Convite lançamento Zona Sul". Você decide quando enviar no final.' }} value={form.name} onChange={setCampo} />
            </>
          )}

          {/* Passo 2 — público (simples primeiro; avançado só quando pedido) */}
          {passo === 2 && (() => {
            const selTags = filtros.tags || [];
            const selCidades = filtros.cities || [];
            const selBairros = filtros.neighborhoods || [];
            const selStatus = filtros.statuses || [];
            const listaTags = (tags || []).map((t) => ({ nome: t.tag || t.value || t, qtd: t.count ?? t.total ?? null }));
            const filtradas = buscaGrupo.trim()
              ? listaTags.filter((t) => t.nome.toLowerCase().includes(buscaGrupo.trim().toLowerCase()))
              : listaTags;
            const visiveis = verTodosGrupos || buscaGrupo.trim() ? filtradas : filtradas.slice(0, 14);
            const linhasColadas = colados.split(/\n+/).map((x) => x.trim()).filter(Boolean).length;
            return (
            <>
              <p className="cell-muted" style={{ marginBottom: 10, fontSize: 13 }}>Para quem vai esta mensagem?</p>

              {/* Caminhos comuns em 1 clique */}
              <div className="rc-grid" role="radiogroup" aria-label="Público da campanha">
                <button type="button" role="radio" aria-checked={modoPublico === 'todos'} className={`rc-card ${modoPublico === 'todos' ? 'rc-on' : ''}`} onClick={() => trocarModoPublico('todos')}>
                  <b>Toda a base</b>
                  <span>Todos os apoiadores com telefone</span>
                </button>
                <button type="button" role="radio" aria-checked={modoPublico === 'voluntarios'} className={`rc-card ${modoPublico === 'voluntarios' ? 'rc-on' : ''}`} onClick={() => trocarModoPublico('voluntarios')}>
                  <b>Voluntários ativos</b>
                  <span>{opcoes ? `${opcoes.voluntariosAtivos.toLocaleString('pt-BR')} pessoas da equipe de rua` : 'Somente quem é voluntário'}</span>
                </button>
                <button type="button" role="radio" aria-checked={modoPublico === 'segmentar'} className={`rc-card ${modoPublico === 'segmentar' ? 'rc-on' : ''}`} onClick={() => trocarModoPublico('segmentar')}>
                  <b>Escolher grupos</b>
                  <span>Filtrar por grupo, cidade ou bairro</span>
                </button>
              </div>

              {/* Segmentação — só aparece quando escolhida */}
              {modoPublico === 'segmentar' && (
                <div className="seg-area">
                  {(selTags.length > 0 || selCidades.length > 0 || selBairros.length > 0 || selStatus.length > 0) && (
                    <div className="sel-line">
                      <span className="sel-label">Selecionados:</span>
                      {selTags.map((t) => <button key={`t-${t}`} type="button" className="chip chip-on" onClick={() => toggleFiltro('tags', t)}>{t} ✕</button>)}
                      {selCidades.map((c) => <button key={`c-${c}`} type="button" className="chip chip-on" onClick={() => toggleFiltro('cities', c)}>{c} ✕</button>)}
                      {selBairros.map((b) => <button key={`b-${b}`} type="button" className="chip chip-on" onClick={() => toggleFiltro('neighborhoods', b)}>{b} ✕</button>)}
                      {selStatus.map((st) => <button key={`s-${st}`} type="button" className="chip chip-on" onClick={() => toggleFiltro('statuses', st)}>{label('SupporterStatus', st) || st} ✕</button>)}
                    </div>
                  )}
                  <span className="field-hint" style={{ display: 'block', marginBottom: 8 }}>Grupos somam pessoas. Cidade, bairro e situação refinam o resultado.</span>

                  <div className="field" style={{ marginBottom: 6 }}>
                    <div className="search" style={{ maxWidth: 340 }}>
                      <Search size={14} />
                      <input className="input" placeholder="Buscar grupo pelo nome..." value={buscaGrupo} onChange={(e) => setBuscaGrupo(e.target.value)} />
                    </div>
                  </div>
                  <div className="chip-wrap">
                    {visiveis.map((t) => {
                      const on = selTags.includes(t.nome);
                      return (
                        <button key={t.nome} type="button" aria-pressed={on} className={`chip ${on ? 'chip-on' : ''}`} onClick={() => toggleFiltro('tags', t.nome)}>
                          {on ? '✓ ' : ''}{t.nome}{t.qtd != null ? ` · ${t.qtd.toLocaleString('pt-BR')}` : ''}
                        </button>
                      );
                    })}
                    {!visiveis.length && <span className="cell-muted">Nenhum grupo com esse nome.</span>}
                  </div>
                  {!buscaGrupo.trim() && filtradas.length > 14 && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setVerTodosGrupos(!verTodosGrupos)}>
                      {verTodosGrupos ? 'Mostrar menos' : `Mostrar todos os ${filtradas.length} grupos`}
                    </button>
                  )}

                  <details className="sec-det">
                    <summary>Cidades {selCidades.length ? `· ${selCidades.length} selecionada(s)` : ''}</summary>
                    <div className="chip-wrap" style={{ maxHeight: 150, overflow: 'auto' }}>
                      {(opcoes?.cidades || []).map((c) => {
                        const on = selCidades.includes(c.value);
                        return <button key={c.value} type="button" aria-pressed={on} className={`chip ${on ? 'chip-on' : ''}`} onClick={() => toggleFiltro('cities', c.value)}>{on ? '✓ ' : ''}{c.value} · {c.count}</button>;
                      })}
                    </div>
                  </details>
                  <details className="sec-det">
                    <summary>Bairros {selBairros.length ? `· ${selBairros.length} selecionado(s)` : ''}</summary>
                    <div className="chip-wrap" style={{ maxHeight: 150, overflow: 'auto' }}>
                      {(opcoes?.bairros || []).map((b) => {
                        const on = selBairros.includes(b.value);
                        return <button key={b.value} type="button" aria-pressed={on} className={`chip ${on ? 'chip-on' : ''}`} onClick={() => toggleFiltro('neighborhoods', b.value)}>{on ? '✓ ' : ''}{b.value} · {b.count}</button>;
                      })}
                    </div>
                  </details>
                  <details className="sec-det">
                    <summary>Situação do apoiador {selStatus.length ? `· ${selStatus.length}` : ''}</summary>
                    <div className="chip-wrap">
                      {(opcoes?.statuses || []).map((st) => {
                        const on = selStatus.includes(st.value);
                        return <button key={st.value} type="button" aria-pressed={on} className={`chip ${on ? 'chip-on' : ''}`} onClick={() => toggleFiltro('statuses', st.value)}>{on ? '✓ ' : ''}{label('SupporterStatus', st.value) || st.value} · {st.count}</button>;
                      })}
                    </div>
                  </details>
                </div>
              )}

              {/* Números avulsos — recolhido; abre só quem precisa */}
              <details className="sec-det" open={linhasColadas > 0}>
                <summary><ClipboardList size={13} style={{ verticalAlign: -2 }} /> Adicionar números avulsos {linhasColadas ? `· ${linhasColadas} linha(s)` : '(colar do WhatsApp, planilha...)'}</summary>
                <textarea
                  className="textarea" rows={4}
                  placeholder={'51999990000 Maria da Silva\n(51) 98888-7777\n5551977776666'}
                  value={colados}
                  onChange={(e) => setColados(e.target.value)}
                />
                <span className="field-hint">Um número por linha, com ou sem DDI 55. O nome depois do número é opcional. Entram junto com a seleção acima.</span>
              </details>

              {/* Contador SEMPRE visível — atualiza sozinho */}
              <div className="publico-resumo" aria-live="polite">
                {calculando || !previewPublico ? (
                  <div className="pr-num pr-calc">Calculando público...</div>
                ) : (
                  <>
                    <div className="pr-num">{previewPublico.total.toLocaleString('pt-BR')} <span>pessoas vão receber</span></div>
                    <div className="pr-det">
                      {previewPublico.blacklist > 0 && <span className="pr-block">{previewPublico.blacklist} pediram para não receber (fora)</span>}
                      {previewPublico.duplicados > 0 && <span>{previewPublico.duplicados} repetidos removidos</span>}
                      {previewPublico.coladosInvalidos > 0 && <span>{previewPublico.coladosInvalidos} números inválidos</span>}
                      {previewPublico.semTelefone > 0 && <span>{previewPublico.semTelefone.toLocaleString('pt-BR')} sem telefone</span>}
                    </div>
                  </>
                )}
              </div>
            </>
            );
          })()}

          {/* Passo 3 — mensagem (somente template aprovado; variáveis MAPEADAS para dados do contato) */}
          {passo === 3 && (
            <>
              <p className="cell-muted" style={{ marginBottom: 10, fontSize: 13 }}>
                Qual mensagem vai ser enviada? Campanhas usam somente modelos aprovados pela Meta.
              </p>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1.1fr', gap: 16 }}>
                <div>
                  <div className="field">
                    <label>Modelos aprovados <span className="req">*</span></label>
                    <div style={{ maxHeight: 380, overflow: 'auto', border: '1px solid var(--border, #e2e5ea)', borderRadius: 8 }}>
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
                          <div className="cell-strong" style={{ fontSize: 13 }}>{form.templateName === t.name ? '✓ ' : ''}{t.name}</div>
                          <div className="cell-muted" style={{ fontSize: 11 }}>{t.category} · {t.language}{t.headerFormat ? ` · topo ${t.headerFormat}` : ''}{t.bodyVarCount ? ` · ${t.bodyVarCount} ${t.bodyVarCount > 1 ? 'campos' : 'campo'}` : ''}</div>
                        </button>
                      ))}
                      {templates.length === 0 && <div className="cell-muted" style={{ padding: 12 }}>Nenhum modelo aprovado na conta ainda. Os modelos em análise na Meta aparecem aqui quando aprovarem.</div>}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="field"><label>Como vai chegar no WhatsApp</label></div>
                  {tplSel ? (
                    <>
                      <PreviewBolha tpl={tplSel} headerImageUrl={form.headerImageUrl} vars={vars} />
                      {tplSel.headerFormat === 'IMAGE' && (
                        <Field field={{ name: 'headerImageUrl', label: 'Imagem do topo (URL pública)', hint: 'Ex.: arte da campanha hospedada no site.' }} value={form.headerImageUrl} onChange={setCampo} />
                      )}
                      {tplSel.bodyVarCount > 0 && (
                        <div className="field" style={{ marginTop: 12 }}>
                          <label>De onde vem cada informação?</label>
                          <span className="field-hint" style={{ display: 'block', marginBottom: 8 }}>
                            No envio em massa, cada campo é preenchido com o dado de cada pessoa — por isso você MAPEIA, não digita. "Escrever texto" é só para o que é igual para todos (nome do evento, data...).
                          </span>
                          {vars.map((v, i) => (
                            <div key={i} className="map-var">
                              <div className="map-ctx">{contextoVar(tplSel.bodyText, i + 1)}</div>
                              <div className="flex gap-8" style={{ alignItems: 'center' }}>
                                <select
                                  className={`select ${!v.source ? 'map-pend' : ''}`} style={{ flex: 1 }}
                                  value={v.source}
                                  onChange={(e) => setVars((arr) => arr.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}
                                >
                                  <option value="">Escolher...</option>
                                  <optgroup label="Dados do contato (muda por pessoa)">
                                    <option value="nome">Nome do contato</option>
                                    <option value="cidade">Cidade do contato</option>
                                    <option value="bairro">Bairro do contato</option>
                                    <option value="responsavel">Responsável pelo contato</option>
                                  </optgroup>
                                  <optgroup label="Igual para todos">
                                    <option value="fixo">Escrever texto</option>
                                  </optgroup>
                                </select>
                                {v.source === 'fixo' && (
                                  <input className="input" style={{ flex: 1.3 }} placeholder="Ex.: lançamento da campanha" value={v.value || ''} onChange={(e) => setVars((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : <div className="cell-muted">Escolha um modelo à esquerda para ver a mensagem.</div>}
                </div>
              </div>
            </>
          )}

          {/* Passo 4 — decisão PRIMEIRO, depois só o que a escolha exige */}
          {passo === 4 && (() => {
            const total = previewPublico?.total || 0;
            const saldo = creditos?.saldo || 0;
            const numerosAtivos = (pool?.numeros || []).filter((n) => n.active);
            const semPacote = !creditos?.total || creditos?.expirado;
            const precisaDecl = modoEnvio !== 'rascunho';
            return (
            <>
              {/* 1) A pergunta que manda: o que fazer? */}
              <div className="field" style={{ marginBottom: 4 }}>
                <label style={{ fontSize: 14 }}>O que fazer com esta campanha?</label>
                <div className="rc-grid" role="radiogroup" aria-label="Decisão de envio">
                  <button type="button" role="radio" aria-checked={modoEnvio === 'agora'} className={`rc-card ${modoEnvio === 'agora' ? 'rc-on' : ''}`} onClick={() => setModoEnvio('agora')}>
                    <b>Enviar agora</b>
                    <span>O disparo começa imediatamente</span>
                  </button>
                  <button type="button" role="radio" aria-checked={modoEnvio === 'agendar'} className={`rc-card ${modoEnvio === 'agendar' ? 'rc-on' : ''}`} onClick={() => setModoEnvio('agendar')}>
                    <b>Agendar envio</b>
                    <span>O sistema dispara sozinho no dia e hora</span>
                  </button>
                  <button type="button" role="radio" aria-checked={modoEnvio === 'rascunho'} className={`rc-card ${modoEnvio === 'rascunho' ? 'rc-on' : ''}`} onClick={() => setModoEnvio('rascunho')}>
                    <b>Salvar rascunho</b>
                    <span>Nada é enviado — termina depois</span>
                  </button>
                </div>
                {modoEnvio === 'agendar' && (
                  <div style={{ marginTop: 10, maxWidth: 280 }}>
                    <Field field={{ name: 'scheduledAt', label: 'Data e hora do envio', type: 'datetime-local', required: true }} value={form.scheduledAt} onChange={setCampo} />
                  </div>
                )}
              </div>

              {/* 2) Resumo + prévia */}
              <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr', gap: 16, marginTop: 6 }}>
                <div>
                  <div className="rev-card">
                    <div className="rev-row"><span className="rev-k">Mensagem</span><span className="rev-v"><b>{form.templateName}</b></span></div>
                    <div className="rev-row"><span className="rev-k">Vai para</span><span className="rev-v"><b>{total.toLocaleString('pt-BR')} pessoas</b>{previewPublico?.blacklist ? ` · ${previewPublico.blacklist} fora por pedido` : ''}</span></div>
                    <div className="rev-row"><span className="rev-k">Quando</span><span className="rev-v">{modoEnvio === 'rascunho' ? 'Fica guardada como rascunho' : modoEnvio === 'agendar' ? (form.scheduledAt ? <b>{fmtData(form.scheduledAt)}</b> : 'Escolha a data acima') : 'Assim que você confirmar'}</span></div>
                    <div className="rev-row"><span className="rev-k">Sai por</span><span className="rev-v">{numerosAtivos.length} número(s) em rodízio, respeitando o limite diário de cada um</span></div>
                    <div className="rev-row"><span className="rev-k">Créditos</span><span className="rev-v">{semPacote ? '—' : <>vai consumir até <b>{Math.min(total, saldo).toLocaleString('pt-BR')}</b> dos {saldo.toLocaleString('pt-BR')} disponíveis</>}</span></div>
                  </div>

                  {precisaDecl && semPacote && (
                    <div className="warning-box" style={{ marginTop: 10 }}>
                      <span><b>Pacote de créditos não ativado.</b> {modoEnvio === 'agendar' ? 'Pode agendar agora; o' : 'O'} envio só sai depois de ativar o pacote na tela de Campanhas.</span>
                    </div>
                  )}
                  {precisaDecl && !semPacote && saldo < total && (
                    <div className="warning-box" style={{ marginTop: 10 }}>
                      <span>O público é maior que o saldo. O envio para sozinho quando os créditos acabarem e os demais ficam pendentes.</span>
                    </div>
                  )}

                  {precisaDecl && (
                    <div className="rev-card" style={{ marginTop: 10 }}>
                      <div className="cell-strong" style={{ fontSize: 13, marginBottom: 6 }}>Teste antes de enviar (recomendado)</div>
                      <div className="flex gap-8">
                        <input className="input" style={{ maxWidth: 210 }} placeholder="Seu número com DDD" value={fonesTeste} onChange={(e) => setFoneTeste(e.target.value)} />
                        <button className="btn" onClick={enviarTesteWizard}><Send size={14} /> Enviar teste</button>
                      </div>
                      <span className="field-hint">Chega no seu WhatsApp exatamente como o eleitor vai receber (consome 1 crédito).</span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="field"><label>Como vai chegar no WhatsApp</label></div>
                  {tplSel ? <PreviewBolha tpl={tplSel} headerImageUrl={form.headerImageUrl} vars={vars} /> : <div className="cell-muted">Modelo não carregado.</div>}
                </div>
              </div>

              {/* 3) Declaração — só quando vai enviar ou agendar */}
              {precisaDecl ? (
                <div className="decl-box" style={{ border: '1.5px solid var(--navy, #043868)', borderRadius: 10, padding: '14px 16px', marginTop: 14, background: 'var(--soft-primary, #f4f7fa)' }}>
                  <div className="cell-strong" style={{ fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={15} /> Declaração de responsabilidade da campanha
                  </div>
                  <div className="flex" style={{ gap: 10, alignItems: 'flex-start' }}>
                    <input id="decl" type="checkbox" checked={declAceita} onChange={(e) => setDeclAceita(e.target.checked)} style={{ marginTop: 4, width: 16, height: 16 }} />
                    <label htmlFor="decl" style={{ fontSize: 13, lineHeight: 1.55, cursor: 'pointer' }}>
                      {declInfo?.texto || 'Carregando o texto da declaração...'}
                    </label>
                  </div>
                  <div className="cell-muted" style={{ fontSize: 11, marginTop: 8 }}>
                    Necessária para {modoEnvio === 'agendar' ? 'agendar' : 'enviar'}. Registra usuário, data, hora e IP na auditoria. Mudou o público depois? O sistema exige aceitar de novo.
                  </div>
                </div>
              ) : (
                <div className="aviso" style={{ marginTop: 14 }}>
                  <b>Rascunho.</b> Nada será enviado agora. A campanha fica guardada e você conclui — envia ou agenda — quando quiser, abrindo ela na lista.
                </div>
              )}
            </>
            );
          })()}
        </Modal>
      )}

      {/* ==================== CRIADOR DE MODELOS ==================== */}
      {tplOpen && (
        <Modal
          title="Criar modelo de mensagem"
          wide
          onClose={() => setTplOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setTplOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={tplSalvando || tplSubindoImg} onClick={enviarTemplateParaAnalise}>
                <Send size={15} /> {tplSalvando ? 'Enviando...' : 'Enviar para análise da Meta'}
              </button>
            </>
          }
        >
          <p className="cell-muted" style={{ marginBottom: 12, fontSize: 13 }}>
            Monte a mensagem, veja como fica no celular e envie para a Meta aprovar. Aprovado, o modelo entra na galeria das campanhas.
          </p>
          <div className="grid" style={{ gridTemplateColumns: '1.15fr 1fr', gap: 18 }}>
            <div>
              <Field field={{ name: 'titulo', label: 'Nome do modelo', required: true, hint: 'Ex.: "Convite comício outubro". Vira o nome interno na Meta.' }} value={tplForm.titulo} onChange={setTpl} />

              <div className="field">
                <label>Imagem do topo (opcional)</label>
                <div className="flex gap-8" style={{ alignItems: 'center' }}>
                  <input type="file" accept="image/png,image/jpeg" id="tpl-img" style={{ display: 'none' }} onChange={(e) => subirImagemTpl(e.target.files?.[0])} />
                  <button type="button" className="btn btn-sm" onClick={() => document.getElementById('tpl-img').click()} disabled={tplSubindoImg}>
                    {tplSubindoImg ? 'Enviando imagem...' : (tplForm.imagem ? 'Trocar imagem' : 'Enviar imagem')}
                  </button>
                  {tplForm.imagem && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTpl('imagem', null)}><X size={14} /> Remover</button>}
                </div>
                <span className="field-hint">JPG ou PNG na horizontal (ideal 1200x628). Aparece no topo da mensagem.</span>
              </div>

              <div className="field">
                <label>Texto da mensagem <span className="req">*</span></label>
                <textarea className="textarea" rows={6} value={tplForm.corpo} onChange={(e) => setTpl('corpo', e.target.value)}
                  placeholder={'Olá {{1}}! Escreva aqui a mensagem da campanha...'}
                />
                <div className="flex gap-8" style={{ marginTop: 6, alignItems: 'center' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTpl('corpo', (tplForm.corpo || '') + '{{1}}')}>+ Inserir nome da pessoa</button>
                  <span className="field-hint">O nome entra automaticamente para cada contato no envio.</span>
                </div>
              </div>

              <Field field={{ name: 'rodape', label: 'Rodapé (opcional)', hint: 'Até 60 caracteres. Ex.: "Propaganda eleitoral · Responda SAIR para não receber".' }} value={tplForm.rodape} onChange={setTpl} />

              <div className="field">
                <label>Botões</label>
                <div className="flex gap-8" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className={`btn btn-sm ${tplForm.tipoBotoes === 'nenhum' ? 'btn-primary' : ''}`} onClick={() => setTpl('tipoBotoes', 'nenhum')}>Sem botões</button>
                  <button type="button" className={`btn btn-sm ${tplForm.tipoBotoes === 'respostas' ? 'btn-primary' : ''}`} onClick={() => setTpl('tipoBotoes', 'respostas')}>Respostas (aceite)</button>
                  <button type="button" className={`btn btn-sm ${tplForm.tipoBotoes === 'link' ? 'btn-primary' : ''}`} onClick={() => setTpl('tipoBotoes', 'link')}>Link do site</button>
                </div>
                {tplForm.tipoBotoes === 'respostas' && (
                  <div style={{ marginTop: 8 }}>
                    {tplForm.botoes.map((b, i) => (
                      <div key={i} className="flex gap-8" style={{ marginBottom: 6 }}>
                        <input className="input" style={{ flex: 1 }} maxLength={25} placeholder={i === 0 ? 'Ex.: Quero participar' : 'Ex.: Agora não'} value={b}
                          onChange={(e) => setTpl('botoes', tplForm.botoes.map((x, j) => (j === i ? e.target.value : x)))} />
                        {tplForm.botoes.length > 1 && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTpl('botoes', tplForm.botoes.filter((_, j) => j !== i))}><X size={14} /></button>
                        )}
                      </div>
                    ))}
                    {tplForm.botoes.length < 3 && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTpl('botoes', [...tplForm.botoes, ''])}><Plus size={14} /> Adicionar botão</button>
                    )}
                    <span className="field-hint" style={{ display: 'block', marginTop: 4 }}>A resposta de quem toca chega nas Conversas — serve como aceite registrado.</span>
                  </div>
                )}
                {tplForm.tipoBotoes === 'link' && (
                  <div style={{ marginTop: 8 }}>
                    <div className="flex gap-8">
                      <input className="input" style={{ flex: 1 }} maxLength={25} placeholder="Texto do botão — ex.: Conhecer as propostas" value={tplForm.textoBotaoUrl} onChange={(e) => setTpl('textoBotaoUrl', e.target.value)} />
                      <input className="input" style={{ flex: 1.4 }} placeholder="https://marciobinsely.com" value={tplForm.urlBotao} onChange={(e) => setTpl('urlBotao', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="field"><label>Como fica no celular</label></div>
              <div className="phone-mock">
                <div className="wa-bubble" style={{ maxWidth: '100%' }}>
                  {tplForm.imagem
                    ? <img src={tplForm.imagem.url} alt="" className="wa-header-img" />
                    : null}
                  <div className="wa-body">
                    {(tplForm.corpo || 'A sua mensagem aparece aqui...').split(/(\{\{\s*1\s*\}\})/g).map((parte, i) =>
                      /^\{\{\s*1\s*\}\}$/.test(parte) ? <span key={i} className="wa-fill">Maria</span> : parte
                    )}
                  </div>
                  {tplForm.rodape && <div className="wa-footer">{tplForm.rodape}</div>}
                  {tplForm.tipoBotoes === 'respostas' && tplForm.botoes.filter((b) => b.trim()).length > 0 && (
                    <div className="wa-buttons">
                      {tplForm.botoes.filter((b) => b.trim()).map((b, i) => <div key={i} className="wa-btn">{b}</div>)}
                    </div>
                  )}
                  {tplForm.tipoBotoes === 'link' && (
                    <div className="wa-buttons"><div className="wa-btn">{tplForm.textoBotaoUrl || 'Saiba mais'}</div></div>
                  )}
                </div>
              </div>
              <div className="cell-muted" style={{ fontSize: 11, marginTop: 10, textAlign: 'center' }}>
                A Meta analisa em minutos ou horas. Aprovado, entra na galeria sozinho.
              </div>
            </div>
          </div>
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
            <select className="select" style={{ width: 'auto' }} value={exFiltro.kind} onChange={(e) => setExF('kind', e.target.value)}>
              <option value="">Todas as origens</option>
              {Object.entries(ORIGENS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
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

          {extrato.porDia?.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table className="table">
                <thead><tr><th>Dia</th><th>Enviadas</th><th>Entregues</th><th>Lidas</th><th>Falhas</th></tr></thead>
                <tbody>
                  {extrato.porDia.map((d) => (
                    <tr key={d.dia}>
                      <td className="cell-strong">{d.dia.split('-').reverse().join('/')}</td>
                      <td>{d.enviadas}</td>
                      <td style={{ color: 'var(--green-rs, #2DBE60)' }}>{d.entregues}{d.enviadas ? ` (${Math.round((d.entregues / d.enviadas) * 100)}%)` : ''}</td>
                      <td>{d.lidas}{d.enviadas ? ` (${Math.round((d.lidas / d.enviadas) * 100)}%)` : ''}</td>
                      <td style={{ color: d.falhas ? 'var(--red, #c53030)' : 'inherit' }}>{d.falhas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Enviado em</th><th>Origem</th><th>Nome</th><th>Telefone</th><th>Via</th><th>Status</th><th>Recebimento</th></tr></thead>
              <tbody>
                {extrato.data.map((c) => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtData(c.sentAt)}</td>
                    <td className="cell-muted" style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ORIGENS[c.kind] || c.kind}
                      {c.kind === 'CAMPANHA' && (list.find((x) => x.id === c.refId)?.name ? ` · ${list.find((x) => x.id === c.refId).name}` : '')}
                      {c.refType && c.refType !== 'texto' ? ` · ${c.refType}` : ''}
                    </td>
                    <td>{c.toName || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.to}</td>
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

import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import Modal from '../components/ui/Modal.jsx';
import Field from '../components/ui/Field.jsx';
import { Badge, StatusBadge } from '../components/ui/Badge.jsx';
import { LoadingBox } from '../components/ui/Spinner.jsx';
import api, { apiError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';
import { label, options, LABELS } from '../config/enums.js';
import { waLink, formatPhone, formatDateTime } from '../lib/format.js';
import WhatsAppIcon from '../components/icons/WhatsAppIcon.jsx';

const COLUMNS = ['NOVA', 'EM_ANALISE', 'EM_ANDAMENTO', 'RESOLVIDA', 'ARQUIVADA'];

// Peso da prioridade: urgentes primeiro no topo de cada coluna.
const PESO_PRIO = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };

const FIELDS = [
  { name: 'citizenName', label: 'Nome do cidadão', required: true, full: true },
  { name: 'phone', label: 'Telefone', type: 'tel' },
  { name: 'category', label: 'Categoria', type: 'select', options: options('DemandCategory'), required: true },
  { name: 'priority', label: 'Prioridade', type: 'select', options: options('Priority') },
  { name: 'cityName', label: 'Cidade' },
  { name: 'neighborhood', label: 'Bairro' },
  { name: 'description', label: 'Descrição da demanda', type: 'textarea', full: true, required: true },
];
const STATUS_FIELD = { name: 'status', label: 'Status', type: 'select', options: options('DemandStatus') };

export default function Demands() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtroCat, setFiltroCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [arrastando, setArrastando] = useState(null); // card sendo arrastado
  const [colAlvo, setColAlvo] = useState(null);        // coluna sob o cursor
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);        // demanda em edição (ou null = nova)
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = { pageSize: 500 };
      if (busca.trim()) params.search = busca.trim();
      const { data } = await api.get('/demands', { params });
      setItems(data.data);
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
  }, [busca]);

  async function move(demand, status) {
    setItems((arr) => arr.map((d) => (d.id === demand.id ? { ...d, status } : d)));
    try {
      const { data } = await api.put(`/demands/${demand.id}`, { status });
      // Sincroniza com o servidor (traz o histórico atualizado).
      setItems((arr) => arr.map((d) => (d.id === demand.id ? data : d)));
    } catch (e) {
      toast.error(apiError(e));
      load();
    }
  }

  function abrirNova() {
    setEditing(null);
    setForm({ category: 'OUTROS', priority: 'MEDIA' });
    setOpen(true);
  }

  function abrirEdicao(d) {
    setEditing(d);
    setForm({
      citizenName: d.citizenName || '', phone: d.phone || '', category: d.category || 'OUTROS',
      priority: d.priority || 'MEDIA', cityName: d.cityName || '', neighborhood: d.neighborhood || '',
      description: d.description || '', status: d.status || 'NOVA',
    });
    setOpen(true);
  }

  async function excluir(d) {
    if (!window.confirm(`Excluir a demanda de ${d.citizenName}? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/demands/${d.id}`);
      setItems((arr) => arr.filter((x) => x.id !== d.id));
      toast.success('Demanda excluída.');
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  async function submit() {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/demands/${editing.id}`, form);
        toast.success('Demanda atualizada!');
      } else {
        await api.post('/demands', form);
        toast.success('Demanda registrada!');
      }
      setOpen(false);
      setEditing(null);
      setForm({});
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  const camposModal = editing ? [...FIELDS, STATUS_FIELD] : FIELDS;
  const visiveis = filtroCat ? items.filter((d) => d.category === filtroCat) : items;

  return (
    <Layout title="Departamento de demandas" subtitle="Pedidos da população organizados em quadro Kanban">
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input
            className="input"
            placeholder="Buscar por cidadão, descrição, bairro..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select className="select" style={{ width: 'auto' }} value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} title="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {options('DemandCategory').map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={abrirNova}>
          <Plus size={16} /> Nova demanda
        </button>
      </div>

      {loading ? (
        <LoadingBox />
      ) : (
        <div className="kanban">
          {COLUMNS.map((col) => {
            const cards = visiveis
              .filter((d) => d.status === col)
              .sort((a, b) => (PESO_PRIO[a.priority] ?? 9) - (PESO_PRIO[b.priority] ?? 9) || new Date(b.createdAt) - new Date(a.createdAt));
            return (
              <div
                className={`kanban-col ${colAlvo === col ? 'kanban-col--alvo' : ''}`}
                key={col}
                onDragOver={(e) => { e.preventDefault(); setColAlvo(col); }}
                onDragLeave={() => setColAlvo((c) => (c === col ? null : c))}
                onDrop={() => { if (arrastando && arrastando.status !== col) move(arrastando, col); setColAlvo(null); setArrastando(null); }}
              >
                <div className="kanban-col-head">
                  <span>{LABELS.DemandStatus[col]}</span>
                  <span className="kanban-count">{cards.length}</span>
                </div>
                <div className="kanban-col-body">
                  {cards.map((d) => {
                    const primeiro = (d.citizenName || '').split(' ')[0];
                    const msg = `Olá, ${primeiro}! Sobre sua demanda ("${(d.description || '').slice(0, 40)}${(d.description || '').length > 40 ? '…' : ''}"): o status agora é ${LABELS.DemandStatus[d.status]}.`;
                    return (
                      <div
                        className="kanban-card"
                        key={d.id}
                        draggable
                        onDragStart={() => setArrastando(d)}
                        onDragEnd={() => { setArrastando(null); setColAlvo(null); }}
                      >
                        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                          <Badge tone="blue">{label('DemandCategory', d.category)}</Badge>
                          <div className="flex items-center gap-8">
                            <StatusBadge group="Priority" value={d.priority} />
                            <button className="btn btn-ghost btn-sm" title="Editar demanda" onClick={(e) => { e.stopPropagation(); abrirEdicao(d); }}>
                              <Pencil size={13} />
                            </button>
                            <button className="btn btn-ghost btn-sm" title="Excluir demanda" onClick={(e) => { e.stopPropagation(); excluir(d); }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <h5>{d.citizenName}</h5>
                        <p>{d.description}</p>
                        <div className="text-sm muted" style={{ marginBottom: 8 }}>{[d.neighborhood, d.cityName].filter(Boolean).join(', ')}</div>
                        <div className="kanban-card-foot">
                          {d.phone ? (
                            <a
                              className="kanban-wa"
                              href={waLink(d.phone, msg)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`Responder ${primeiro} no WhatsApp`}
                            >
                              <WhatsAppIcon size={14} /> {formatPhone(d.phone)}
                            </a>
                          ) : (
                            <span className="cell-sem-tel">Sem telefone</span>
                          )}
                          <select className="select" style={{ padding: '4px 6px', fontSize: 12 }} value={d.status} onChange={(e) => move(d, e.target.value)}>
                            {COLUMNS.map((c) => (
                              <option key={c} value={c}>{LABELS.DemandStatus[c]}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                  {cards.length === 0 && <div className="text-sm muted" style={{ padding: 10, textAlign: 'center' }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <Modal
          title={editing ? 'Editar demanda' : 'Nova demanda'}
          onClose={() => { setOpen(false); setEditing(null); }}
          footer={
            <>
              <button className="btn" onClick={() => { setOpen(false); setEditing(null); }}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? 'Salvando...' : (editing ? 'Salvar' : 'Registrar')}</button>
            </>
          }
        >
          <div className="form-grid">
            {camposModal.map((f) => (
              <Field key={f.name} field={f} value={form[f.name]} onChange={(n, v) => setForm((s) => ({ ...s, [n]: v }))} />
            ))}
          </div>
          {editing && Array.isArray(editing.history) && editing.history.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>Histórico da demanda</label>
              <div className="rank-list">
                {editing.history.slice().reverse().map((h, i) => (
                  <div className="rank-row" key={i}>
                    <div className="rank-info">
                      <strong>
                        {h.tipo === 'criada'
                          ? `Criada como "${LABELS.DemandStatus[h.para] || h.para}"`
                          : `${LABELS.DemandStatus[h.de] || h.de} → ${LABELS.DemandStatus[h.para] || h.para}`}
                      </strong>
                      <span>{formatDateTime(h.em)}{h.por ? ` · ${h.por}` : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </Layout>
  );
}

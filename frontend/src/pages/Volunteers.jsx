import { useEffect, useState } from 'react';
import { Power, Trophy, Search, Check, X, Pencil, Trash2 } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import { Card } from '../components/ui/Card.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import { LoadingBox } from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Modal from '../components/ui/Modal.jsx';
import Field from '../components/ui/Field.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import PhoneCell from '../components/PhoneCell.jsx';
import api, { apiError } from '../api/client.js';
import { nomeProprio } from '../lib/format.js';
import { options } from '../config/enums.js';
import { useToast } from '../context/ToastContext.jsx';

/**
 * "Prefere ajudar" chega do formulário como texto corrido
 * ("- Posso curtir..., - Quero participar de mutirões..., - ...").
 * Vira lista de itens curtos para caber numa linha de tabela.
 */
function preferencias(texto) {
  if (!texto) return [];
  return texto
    .split(/\s*,?\s*-\s+/)
    .map((s) => s.replace(/^[-\s]+|[,\s]+$/g, '').trim())
    .filter(Boolean);
}

// Frases longas do formulário viram rótulos curtos e escaneáveis.
const APELIDOS = [
  [/indicar pessoas/i, 'Indicar pessoas'],
  [/curtir, comentar|repercutir/i, 'Engajar nas redes'],
  [/mutir(õ|o)es|caminhadas/i, 'Mutirões e caminhadas'],
  [/reuni(õ|o)es presenciais|encontros em casa/i, 'Encontros em casa'],
  [/grupos oficiais|whatsapp e telegram/i, 'Grupos de WhatsApp'],
  [/pol(í|i)tica de base|forma(ç|c)(ã|a)o pol(í|i)tica/i, 'Experiência política'],
];
const apelido = (t) => APELIDOS.find(([re]) => re.test(t))?.[1] || t;

const CONFIRMACAO = {
  A_CONFIRMAR: { rotulo: 'A confirmar', tom: 'amber' },
  CONFIRMADO: { rotulo: 'Confirmado', tom: 'green' },
  CANCELADO: { rotulo: 'Cancelado', tom: 'red' },
};

// Campos editáveis do cadastro (subconjunto do apoiador) — mesma multi-seleção.
const EDIT_FIELDS = [
  { name: 'name', label: 'Nome completo', required: true, full: true },
  { name: 'phone', label: 'Telefone', type: 'tel' },
  { name: 'whatsapp', label: 'WhatsApp', type: 'tel' },
  { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'cpf', label: 'CPF' },
  { name: 'birthDate', label: 'Data de nascimento', type: 'date' },
  { name: 'cep', label: 'CEP', hint: 'Digite o CEP para preencher o endereço' },
  { name: 'street', label: 'Endereço (rua)', full: true },
  { name: 'number', label: 'Número' },
  { name: 'complement', label: 'Complemento' },
  { name: 'neighborhood', label: 'Bairro' },
  { name: 'cityName', label: 'Cidade' },
  { name: 'supportTypes', label: 'Tipo de apoio', type: 'checklist', full: true, options: [
    { value: 'VOLUNTARIO', label: 'Quero ser voluntário' },
    { value: 'FAIXA_CASA', label: 'Faixa na minha casa' },
    { value: 'KIT_MATERIAL', label: 'Kit de material' },
  ] },
  { name: 'status', label: 'Status', type: 'select', options: options('SupporterStatus') },
];

export default function Volunteers() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [salvando, setSalvando] = useState(null);
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState(null);
  const [ordem, setOrdem] = useState('az');
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  // Quem indicou este voluntário, quando encontrado na base (p/ chamar no WhatsApp).
  const [indicante, setIndicante] = useState(null);

  async function load(p = page) {
    setLoading(true);
    try {
      const params = { page: p, ordem };
      if (search) params.search = search;
      if (filter === 'active') params.active = 'true';
      else if (filter) params.confirmationStatus = filter;
      const { data } = await api.get('/volunteers', { params });
      setRows(data.data);
      setPageInfo(data.pagination || null);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  // Buscar ou filtrar volta para a primeira página (senão a lista vem vazia).
  useEffect(() => {
    setPage(1);
  }, [search, filter]);

  useEffect(() => {
    const t = setTimeout(() => load(page), search ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter, page, ordem]);

  async function toggle(row) {
    try {
      await api.put(`/volunteers/${row.id}`, { active: !row.active });
      toast.success(row.active ? 'Voluntário desativado.' : 'Voluntário ativado.');
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  async function definirConfirmacao(row, status) {
    setSalvando(row.id);
    try {
      await api.patch(`/volunteers/${row.id}/confirmation`, { status });
      const nome = row.supporter?.name?.split(' ')[0] || 'Voluntário';
      toast.success(status === 'CONFIRMADO' ? `${nome} confirmado!` : `${nome} marcado como cancelado.`);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSalvando(null);
    }
  }

  // Editar o cadastro da pessoa (o apoiador por trás do voluntário).
  async function abrirEdicao(row) {
    try {
      setIndicante(null);
      const { data } = await api.get(`/supporters/${row.supporter.id}`);
      // A indicação vive como tag "INDICAÇÃO: NOME" — vira campo editável e,
      // quando o indicante está na base com telefone, atalho de WhatsApp.
      const tagInd = (data.tags || []).find((t) => t.startsWith('INDICAÇÃO: '));
      const nomeInd = tagInd ? tagInd.slice('INDICAÇÃO: '.length).trim() : '';
      if (nomeInd) {
        api.get('/supporters/indicante', { params: { nome: nomeInd } })
          .then((r) => { if (r.data.data) setIndicante(r.data.data); })
          .catch(() => {});
      }
      setEditForm({
        indicante: nomeInd ? nomeProprio(nomeInd) : '',
        name: data.name || '',
        phone: data.phone || '',
        whatsapp: data.whatsapp || '',
        email: data.email || '',
        cpf: data.cpf || '',
        birthDate: data.birthDate ? String(data.birthDate).slice(0, 10) : '',
        cep: data.cep || '',
        street: data.street || '',
        number: data.number || '',
        complement: data.complement || '',
        neighborhood: data.neighborhood || '',
        cityName: data.cityName || '',
        supportTypes: Array.isArray(data.supportTypes) ? data.supportTypes : [],
        status: data.status || 'NOVO',
      });
      setEditing(row);
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  const setCampo = (name, value) => {
    setEditForm((f) => ({ ...f, [name]: value }));
    // CEP completo preenche rua/bairro/cidade (ViaCEP) — facilita corrigir o endereço.
    if (name === 'cep') {
      const cep = String(value).replace(/\D/g, '');
      if (cep.length === 8) {
        fetch(`https://viacep.com.br/ws/${cep}/json/`)
          .then((r) => r.json())
          .then((d) => {
            if (d.erro) return;
            setEditForm((f) => ({
              ...f,
              street: d.logradouro || f.street,
              neighborhood: d.bairro || f.neighborhood,
              cityName: d.localidade || f.cityName,
            }));
          })
          .catch(() => {});
      }
    }
  };

  async function salvarEdicao() {
    if (!editing) return;
    setSavingEdit(true);
    try {
      await api.put(`/supporters/${editing.supporter.id}`, editForm);
      toast.success('Cadastro atualizado.');
      setEditing(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingEdit(false);
    }
  }

  async function excluir(row) {
    const nome = row.supporter?.name || 'esta pessoa';
    if (!window.confirm(`Excluir o cadastro de ${nome}? A pessoa sai da base (voluntário e apoiador).`)) return;
    try {
      await api.delete(`/volunteers/${row.id}`);
      toast.success('Cadastro excluído.');
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Voluntário',
      thStyle: { width: '26%', minWidth: 230 },
      render: (r) => (
        <div className="cell-person">
          <Avatar name={r.supporter?.name} src={r.supporter?.photoUrl} size="avatar-sm" />
          <div className="cell-person-txt">
            <div className="cell-strong">{nomeProprio(r.supporter?.name) || '—'}</div>
            <div className="cell-muted text-sm">
              {[r.supporter?.cityName, r.supporter?.neighborhood].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'confirmed',
      label: 'Confirmação',
      thStyle: { width: 210, minWidth: 200 },
      render: (r) => {
        const st = r.confirmationStatus || 'A_CONFIRMAR';
        const c = CONFIRMACAO[st];
        const ocupado = salvando === r.id;
        return (
          <div className="conf-cell">
            <span className={`badge badge-${c.tom}`}>{c.rotulo}</span>
            {st !== 'CONFIRMADO' && (
              <button
                className="btn-conf btn-conf--ok"
                disabled={ocupado}
                title="Confirmar voluntário"
                onClick={() => definirConfirmacao(r, 'CONFIRMADO')}
              >
                <Check size={14} /> Confirmar
              </button>
            )}
            {st !== 'CANCELADO' && (
              <button
                className="btn-conf btn-conf--no"
                disabled={ocupado}
                title="Marcar como cancelado"
                onClick={() => definirConfirmacao(r, 'CANCELADO')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: 'help',
      label: 'Prefere ajudar',
      render: (r) => {
        const itens = preferencias(r.helpPreference);
        if (!itens.length) return <span className="cell-muted">—</span>;
        return (
          <div className="cell-tags" title={itens.join(' · ')}>
            {itens.slice(0, 2).map((t, i) => (
              <span key={i} className="badge">{apelido(t)}</span>
            ))}
            {itens.length > 2 && <span className="cell-muted text-sm">+{itens.length - 2}</span>}
          </div>
        );
      },
    },
    {
      key: 'score',
      label: 'Pontos',
      thStyle: { width: 90 },
      render: (r) => (r.totalScore > 0 ? <span className="rank-score">{r.totalScore} pts</span> : <span className="cell-muted">—</span>),
    },
    {
      key: 'active',
      label: 'Situação',
      thStyle: { width: 110 },
      render: (r) => <StatusBadge group="SupporterStatus" value={r.active ? 'ATIVO' : 'INATIVO'} />,
    },
    // Última coluna: telefone em destaque, com a ausência sinalizada em vermelho.
    {
      key: 'phone',
      label: 'Telefone',
      thStyle: { width: 150 },
      render: (r) => <PhoneCell person={r.supporter} />,
    },
  ];

  return (
    <Layout title="Voluntários" subtitle="Engajamento, pontuação e situação da equipe de base">
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input className="input" placeholder="Buscar voluntário..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Todos</option>
          <option value="A_CONFIRMAR">A confirmar</option>
          <option value="CONFIRMADO">Confirmados</option>
          <option value="CANCELADO">Cancelados</option>
          <option value="active">Somente ativos</option>
        </select>
        <select className="select" style={{ width: 'auto' }} value={ordem} onChange={(e) => setOrdem(e.target.value)} title="Ordenar a lista">
          <option value="az">Ordem alfabética (A–Z)</option>
          <option value="za">Ordem alfabética (Z–A)</option>
          <option value="recentes">Mais recentes primeiro</option>
          <option value="antigos">Mais antigos primeiro</option>
          <option value="pontos">Mais pontos primeiro</option>
        </select>
      </div>
      <Card noBody>
        {loading ? (
          <LoadingBox />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            empty={<EmptyState icon={Trophy} title="Nenhum voluntário" message="Cadastros do formulário e apoiadores classificados aparecem aqui." />}
            actions={(row) => (
              <>
                <WhatsAppButton person={row.supporter} />
                <button className="btn btn-ghost btn-sm" title="Editar cadastro" onClick={() => abrirEdicao(row)}>
                  <Pencil size={15} />
                </button>
                <button className="btn btn-ghost btn-sm" title={row.active ? 'Desativar' : 'Ativar'} onClick={() => toggle(row)}>
                  <Power size={15} />
                </button>
                <button className="btn btn-ghost btn-sm" title="Excluir cadastro" onClick={() => excluir(row)}>
                  <Trash2 size={15} />
                </button>
              </>
            )}
          />
        )}
      </Card>

      <Pagination
        info={pageInfo}
        onChange={(p) => {
          setPage(p);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {editing && (
        <Modal title={`Editar ${editing.supporter?.name || 'cadastro'}`} onClose={() => setEditing(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {EDIT_FIELDS.map((f) => (
              <Field key={f.name} field={f} value={editForm[f.name]} onChange={setCampo} />
            ))}
            <div className="field">
              <label>Quem indicou</label>
              <div className="flex items-center gap-8">
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={editForm.indicante ?? ''}
                  onChange={(e) => setCampo('indicante', e.target.value)}
                  placeholder="Nome de quem indicou esta pessoa"
                />
                {indicante && <WhatsAppButton person={indicante} size={16} />}
              </div>
              {indicante ? (
                <span className="cell-muted text-sm">
                  Indicado por <b>{nomeProprio(indicante.name)}</b> — o botão verde chama quem indicou no WhatsApp
                  (útil quando o telefone do voluntário está errado).
                </span>
              ) : editForm.indicante ? (
                <span className="cell-muted text-sm">Indicante ainda não encontrado na base (sem atalho de WhatsApp).</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-8" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={savingEdit}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvarEdicao} disabled={savingEdit}>
              {savingEdit ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

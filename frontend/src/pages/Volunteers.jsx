import { useEffect, useState } from 'react';
import { Power, Trophy, Search, Check, X } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import { Card } from '../components/ui/Card.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import { LoadingBox } from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { StatusBadge } from '../components/ui/Badge.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import PhoneCell from '../components/PhoneCell.jsx';
import api, { apiError } from '../api/client.js';
import { nomeProprio } from '../lib/format.js';
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
            empty={<EmptyState icon={Trophy} title="Nenhum voluntário" message="Cadastros do tipo 'Quero ser voluntário' aparecem aqui." />}
            actions={(row) => (
              <>
                <WhatsAppButton person={row.supporter} />
                <button className="btn btn-ghost btn-sm" title={row.active ? 'Desativar' : 'Ativar'} onClick={() => toggle(row)}>
                  <Power size={15} />
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
    </Layout>
  );
}

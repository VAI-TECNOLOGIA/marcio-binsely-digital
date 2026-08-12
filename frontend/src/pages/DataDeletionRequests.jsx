import { useEffect, useState } from 'react';
import { ShieldCheck, Check, RotateCcw, ExternalLink } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import { Card } from '../components/ui/Card.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import { LoadingBox } from '../components/ui/Spinner.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import api, { apiError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function DataDeletionRequests() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/data-deletion');
      setRows(data.items || []);
      setPending(data.pending || 0);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resolve(row, status) {
    let note = row.note || null;
    if (status === 'CONCLUIDA') {
      note = window.prompt('Observação do tratamento (opcional):', '') ?? note;
    }
    try {
      await api.patch(`/data-deletion/${row.id}`, { status, note });
      toast.success(status === 'CONCLUIDA' ? 'Marcada como concluída.' : 'Reaberta.');
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Solicitante',
      render: (r) => (
        <div>
          <strong>{r.name}</strong>
          <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
            {r.email || '—'}{r.email && r.phone ? ' · ' : ''}{r.phone || ''}
          </div>
        </div>
      ),
    },
    { key: 'reason', label: 'Motivo', render: (r) => r.reason || '—' },
    {
      key: 'matched',
      label: 'Cadastro',
      render: (r) =>
        r.matchedSupporterId ? (
          <a href={`/apoiadores?id=${r.matchedSupporterId}`} title="Abrir apoiador">
            localizado <ExternalLink size={12} />
          </a>
        ) : (
          <span style={{ color: 'var(--muted)' }}>não encontrado</span>
        ),
    },
    { key: 'createdAt', label: 'Recebida em', render: (r) => fmtDate(r.createdAt) },
    {
      key: 'status',
      label: 'Status',
      render: (r) =>
        r.status === 'CONCLUIDA' ? (
          <Badge tone="green">Concluída</Badge>
        ) : (
          <Badge tone="amber">Pendente</Badge>
        ),
    },
  ];

  return (
    <Layout
      title="Solicitações de exclusão"
      subtitle="Pedidos de exclusão de dados (LGPD) recebidos pela página pública"
    >
      <Card
        icon={ShieldCheck}
        title={`${pending} pendente${pending === 1 ? '' : 's'}`}
        subtitle="Valide a identidade do solicitante antes de excluir o cadastro correspondente."
      >
        {loading ? (
          <LoadingBox label="Carregando solicitações..." />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            empty={
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                Nenhuma solicitação de exclusão recebida até o momento.
              </div>
            }
            actions={(r) =>
              r.status === 'PENDENTE' ? (
                <button className="btn btn-sm btn-primary" onClick={() => resolve(r, 'CONCLUIDA')}>
                  <Check size={14} /> Concluir
                </button>
              ) : (
                <button className="btn btn-sm btn-ghost" onClick={() => resolve(r, 'PENDENTE')}>
                  <RotateCcw size={14} /> Reabrir
                </button>
              )
            }
          />
        )}
      </Card>
    </Layout>
  );
}

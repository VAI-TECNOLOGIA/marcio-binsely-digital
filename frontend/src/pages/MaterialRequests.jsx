import { useState } from 'react';
import { History, Package } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import ResourcePage from '../components/ResourcePage.jsx';
import Modal from '../components/ui/Modal.jsx';
import { StatusBadge, Badge } from '../components/ui/Badge.jsx';
import PhoneCell from '../components/PhoneCell.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import { formatDate, formatPhone } from '../lib/format.js';
import { options, label } from '../config/enums.js';
import api, { apiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

const TIPO_LABEL = { INDIVIDUAL: 'Individual', DOBRADINHA: 'Dobradinha estadual' };

export default function MaterialRequests() {
  const { user } = useAuth();
  const toast = useToast();
  const canManage = ['LIDER', 'MEMBRO', 'MEMBRO'].includes(user?.role);
  const [historyFor, setHistoryFor] = useState(null);
  const [historyData, setHistoryData] = useState(null);

  async function openHistory(row) {
    setHistoryFor(row);
    setHistoryData(null);
    try {
      const { data } = await api.get(`/material-requests/history/${row.requesterId}`);
      setHistoryData(data);
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  async function changeStatus(row, status, reload) {
    try {
      await api.patch(`/material-requests/${row.id}/status`, { status });
      toast.success(`Status atualizado para ${status}.`);
      reload();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  const config = {
    endpoint: '/material-requests',
    singular: 'pedido',
    createLabel: 'Solicitar material',
    titleField: 'materialName',
    searchPlaceholder: 'Buscar por material, solicitante, cidade...',
    edit: false,
    delete: false,
    lookups: [{ key: 'materials', endpoint: '/materials', valueKey: 'name', labelKey: 'name' }],
    filters: [{ name: 'status', label: 'Status', enumGroup: 'MaterialRequestStatus' }],
    // Lista pensada para o envio do kit pelo correio: nome, endereço e telefone,
    // com ação de WhatsApp e exportação para gerar etiqueta.
    exportable: true,
    exportName: 'pedidos-material',
    exportColumns: [
      { key: 'nome', label: 'Nome', value: (r) => r.supporter?.name || r.requester?.name || '' },
      { key: 'telefone', label: 'Telefone', value: (r) => { const p = r.supporter?.phone || r.supporter?.whatsapp || ''; return p ? formatPhone(p) : ''; } },
      { key: 'cep', label: 'CEP', value: (r) => r.supporter?.cep || '' },
      { key: 'endereco', label: 'Endereço', value: (r) => (r.supporter ? [r.supporter.street, r.supporter.number].filter(Boolean).join(', ') : r.deliveryAddress) || '' },
      { key: 'complemento', label: 'Complemento', value: (r) => r.supporter?.complement || '' },
      { key: 'bairro', label: 'Bairro', value: (r) => r.supporter?.neighborhood || r.neighborhood || '' },
      { key: 'cidade', label: 'Cidade', value: (r) => r.supporter?.cityName || r.cityName || '' },
      { key: 'item', label: 'Item', value: (r) => (r.materials?.length ? r.materials.join(', ') : r.materialName) || '' },
      { key: 'status', label: 'Status', value: (r) => label('MaterialRequestStatus', r.status) },
    ],
    columns: [
      {
        key: 'name',
        label: 'Nome',
        render: (r) => (
          <div>
            <div className="cell-strong">{r.supporter?.name || r.requester?.name || '—'}</div>
            {r.supporter && <Badge tone="green">Voluntário</Badge>}
          </div>
        ),
      },
      {
        key: 'address',
        label: 'Endereço',
        render: (r) => {
          const s = r.supporter;
          const rua = s ? [s.street, s.number].filter(Boolean).join(', ') : r.deliveryAddress;
          const linha = [rua, s?.neighborhood || r.neighborhood, s?.cityName || r.cityName].filter(Boolean).join(' · ');
          return <span className="cell-muted">{linha || '—'}</span>;
        },
      },
      { key: 'status', label: 'Status', thStyle: { width: 130 }, render: (r) => <StatusBadge group="MaterialRequestStatus" value={r.status} /> },
      { key: 'phone', label: 'Telefone', thStyle: { width: 150 }, render: (r) => <PhoneCell person={r.supporter || { name: r.requester?.name }} /> },
    ],
    fields: [
      { name: 'materials', label: 'Materiais', type: 'checklist', optionsFrom: 'materials', required: true, full: true,
        hint: 'Marque um ou mais itens.' },
      { name: 'materialType', label: 'Tipo', type: 'select', options: [
        { value: 'INDIVIDUAL', label: 'Individual (só Márcio)' },
        { value: 'DOBRADINHA', label: 'Dobradinha com candidato a estadual' },
      ] },
      { name: 'quantity', label: 'Quantidade (de cada)', type: 'number', required: true },
      { name: 'justification', label: 'Justificativa', type: 'textarea', full: true },
      { name: 'cityName', label: 'Cidade' },
      { name: 'neighborhood', label: 'Bairro' },
      { name: 'deliveryAddress', label: 'Endereço de entrega', full: true },
    ],
    rowActionsExtra: (row, reload) => (
      <>
        {row.supporter && <WhatsAppButton person={row.supporter} />}
        {canManage && (
          <select
            className="select"
            style={{ width: 'auto', padding: '5px 8px', fontSize: 12 }}
            value={row.status}
            onChange={(e) => changeStatus(row, e.target.value, reload)}
          >
            {options('MaterialRequestStatus').map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        {row.requesterId && (
          <button className="btn btn-ghost btn-sm" title="Histórico do solicitante" onClick={() => openHistory(row)}>
            <History size={15} />
          </button>
        )}
      </>
    ),
  };

  return (
    <Layout title="Pedidos de material" subtitle="Kits e materiais pedidos pelos voluntários. Exporte para gerar etiqueta e enviar pelo correio.">
      <ResourcePage config={config} />

      {historyFor && (
        <Modal title={`Histórico de ${historyFor.requester?.name || 'solicitante'}`} onClose={() => setHistoryFor(null)}>
          {!historyData ? (
            <p className="muted">Carregando...</p>
          ) : (
            <>
              <h4 style={{ marginBottom: 10 }}>Já recebido (entregue)</h4>
              {historyData.deliveredTotals.length === 0 ? (
                <p className="muted">Nenhuma entrega registrada ainda.</p>
              ) : (
                <div className="chip-row" style={{ marginBottom: 18 }}>
                  {historyData.deliveredTotals.map((t) => (
                    <Badge key={t.material} tone="green">{t.quantity}× {t.material}</Badge>
                  ))}
                </div>
              )}
              <h4 style={{ margin: '10px 0' }}>Todos os pedidos</h4>
              <div className="rank-list">
                {historyData.history.map((h) => (
                  <div className="rank-row" key={h.id}>
                    <Package size={16} className="muted" />
                    <div className="rank-info">
                      <strong>{h.quantity}× {h.materialName}</strong>
                      <span>{formatDate(h.createdAt)}</span>
                    </div>
                    <StatusBadge group="MaterialRequestStatus" value={h.status} />
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </Layout>
  );
}

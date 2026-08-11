import { Ban } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import ResourcePage from '../components/ResourcePage.jsx';
import WhatsAppButton from '../components/WhatsAppButton.jsx';
import { supporters } from '../config/resources.jsx';
import api, { apiError } from '../api/client.js';

export default function Supporters() {
  const config = {
    ...supporters,
    rowActionsExtra: (row, reload, toast) => (
      <>
        {row.status !== 'BLACKLIST' && <WhatsAppButton person={row} />}
        {row.status !== 'BLACKLIST' && (
          <button
            className="btn btn-ghost btn-sm"
            title="Mover para blacklist"
            onClick={async () => {
              const reason = window.prompt('Motivo para mover à blacklist:');
              if (reason === null) return;
              try {
                await api.post(`/supporters/${row.id}/blacklist`, { reason });
                toast.success('Movido para a blacklist.');
                reload();
              } catch (e) {
                toast.error(apiError(e));
              }
            }}
          >
            <Ban size={15} />
          </button>
        )}
      </>
    ),
  };

  return (
    <Layout
      title="Apoiadores"
      subtitle="Base de apoiadores. Ao marcar o tipo de apoio (voluntário, faixa ou kit) e salvar, a pessoa vira voluntário e migra para a tela de Voluntários."
    >
      <ResourcePage config={config} />
    </Layout>
  );
}

import { CheckCircle2 } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import ResourcePage from '../components/ResourcePage.jsx';
import { banners } from '../config/resources.jsx';
import api, { apiError } from '../api/client.js';

export default function Banners() {
  const config = {
    ...banners,
    // Marcar como instalada é a ação mais frequente da equipe de rua —
    // fica a um clique, sem abrir o formulário de edição.
    rowActionsExtra: (row, reload, toast) =>
      row.status !== 'INSTALADO' && (
        <button
          className="btn btn-ghost btn-sm"
          title="Marcar faixa como instalada"
          onClick={async () => {
            try {
              await api.put(`/banners/${row.id}`, { status: 'INSTALADO' });
              toast.success('Faixa marcada como instalada!');
              reload();
            } catch (e) {
              toast.error(apiError(e));
            }
          }}
        >
          <CheckCircle2 size={15} />
        </button>
      ),
  };

  return (
    <Layout title="Faixas em casas" subtitle="Controle de autorizações e instalação de faixas">
      <ResourcePage config={config} />
    </Layout>
  );
}

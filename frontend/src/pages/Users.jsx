import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import ResourcePage from '../components/ResourcePage.jsx';
import AccessModal from '../components/AccessModal.jsx';
import { users as usersBase } from '../config/resources.jsx';

export default function Users() {
  const [accessUser, setAccessUser] = useState(null);

  const config = {
    ...usersBase,
    // Ação por linha: entregar o acesso pronto (copiar / WhatsApp).
    rowActionsExtra: (row) => (
      <button
        className="btn btn-ghost btn-sm"
        title="Copiar acesso para enviar"
        onClick={() => setAccessUser(row)}
      >
        <KeyRound size={15} />
      </button>
    ),
    // Ao CRIAR um usuário, já abre o envio de acesso com a senha definida.
    onCreated: (data, _toast, payload) => setAccessUser({ ...data, initialPassword: payload?.password }),
  };

  return (
    <Layout title="Usuários" subtitle="Equipe da campanha e seus perfis de acesso">
      <ResourcePage config={config} />
      {accessUser && <AccessModal user={accessUser} onClose={() => setAccessUser(null)} />}
    </Layout>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircle, AlertTriangle, Trash2 } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import Modal from '../components/ui/Modal.jsx';
import api, { apiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

// "Minha conta" — visível a qualquer usuário autenticado. Cumpre a Apple
// Guideline 5.1.1(v): quem cria conta precisa poder EXCLUÍ-LA de dentro do app.
export default function Account() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete('/auth/me');
      toast.success('Sua conta foi excluída permanentemente.');
      logout();
      navigate('/login', { replace: true });
    } catch (e) {
      toast.error(apiError(e, 'Não foi possível excluir a conta. Tente novamente.'));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <Layout title="Minha conta" subtitle="Seus dados e exclusão de conta">
      <Card title="Dados da conta" icon={UserCircle}>
        <div className="flex items-center gap-12">
          <UserCircle size={40} style={{ opacity: 0.7 }} />
          <div>
            <div className="cell-strong">{user?.name || '—'}</div>
            <div className="muted">{user?.email}</div>
            {user?.role && (
              <div style={{ marginTop: 6 }}>
                <Badge>{user.role}</Badge>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="Excluir minha conta" icon={AlertTriangle}>
        <p className="muted" style={{ marginBottom: 16 }}>
          Ao excluir sua conta, seus dados pessoais e seu acesso são removidos de forma
          permanente dos nossos servidores. Esta ação é irreversível e não pode ser desfeita.
        </p>
        <button className="btn btn-danger" onClick={() => setConfirming(true)}>
          <Trash2 size={16} /> Excluir minha conta
        </button>
      </Card>

      {confirming && (
        <Modal
          title="Excluir minha conta"
          onClose={() => !deleting && setConfirming(false)}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() => setConfirming(false)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Excluindo…' : 'Sim, excluir permanentemente'}
              </button>
            </>
          }
        >
          <p>
            Tem certeza que deseja excluir a conta <strong>{user?.email}</strong>?
          </p>
          <p className="muted">
            Todos os seus dados pessoais serão apagados de forma permanente. Não há como
            recuperar a conta depois.
          </p>
        </Modal>
      )}
    </Layout>
  );
}

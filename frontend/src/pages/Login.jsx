import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiError } from '../api/client.js';

export default function Login() {
  const { login, user, loading } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success('Bem-vindo à central da campanha!');
      nav('/');
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível entrar. Verifique suas credenciais.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth">
      {/* Painel visual — trabalhismo gaúcho: rosto do candidato + tricolor do RS */}
      <div className="auth-visual">
        <div className="auth-photo" />
        <div className="auth-duo" />
        <div className="auth-shade" />
        <div className="auth-grain" />
        <div className="auth-flag">
          <i className="g" />
          <i className="y" />
          <i className="r" />
        </div>
        <div className="auth-slash" />
        <div className="auth-content">
          <div className="auth-top">
            <div className="auth-party">PDT</div>
          </div>
          <div>
            <div className="auth-name">Márcio Bins Ely 1234 · Deputado Federal · PDT</div>
            <h1 className="auth-headline">
              O Rio Grande
              <br />
              <em>pode mais</em>
            </h1>
            <p className="auth-tagline">
              A central de comando da campanha. Mobilização, dados, atendimento e território — numa só
              plataforma.
            </p>
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="auth-form-side">
        <form className="auth-card" onSubmit={submit}>
          <h3>Acessar plataforma</h3>
          <p className="muted">Entre com suas credenciais da campanha.</p>

          <div className="field">
            <label>E-mail</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Senha</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button className="btn btn-primary btn-block btn-xl" disabled={submitting} type="submit">
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>

          <Link to="/criar-conta" className="btn btn-block" style={{ marginTop: 10 }}>
            Criar meu acesso
          </Link>

          <div className="auth-links">
            <Link to="/esqueci-senha" className="auth-back">Esqueci minha senha</Link>
            <Link to="/lp" className="auth-back">
              <ArrowLeft size={14} /> Conhecer a campanha
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { apiError } from '../api/client.js';

// (51) 99999-9999 — tira o 55 colado e limita a 11 dígitos.
function mascaraTelefone(v) {
  let d = v.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function Signup() {
  const { signup, user, loading } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === 'phone' ? mascaraTelefone(e.target.value) : e.target.value }));

  function avancar(e) {
    e.preventDefault();
    if (form.name.trim().length < 2) return toast.error('Informe o seu nome completo.');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast.error('Informe um e-mail válido.');
    setStep(2);
  }

  async function criar(e) {
    e.preventDefault();
    if (form.password.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.');
    if (form.password !== form.confirm) return toast.error('As senhas não conferem.');
    setSubmitting(true);
    try {
      await signup({ name: form.name.trim(), email: form.email.trim(), phone: form.phone || null, password: form.password });
      toast.success('Conta criada! Bem-vindo(a) à campanha.');
      nav('/');
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível criar a conta.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-visual">
        <div className="auth-photo" />
        <div className="auth-duo" />
        <div className="auth-shade" />
        <div className="auth-grain" />
        <div className="auth-flag"><i className="g" /><i className="y" /><i className="r" /></div>
        <div className="auth-slash" />
        <div className="auth-content">
          <div className="auth-top"><div className="auth-party">PDT</div></div>
          <div>
            <div className="auth-name">Márcio Bins Ely 1234 · Deputado Federal · PDT</div>
            <h1 className="auth-headline">Faça parte<br />do <em>movimento</em></h1>
            <p className="auth-tagline">Crie o seu acesso e caminhe com a gente. Leva menos de um minuto.</p>
          </div>
        </div>
      </div>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={step === 1 ? avancar : criar}>
          <div className="signup-steps">
            <span className={step >= 1 ? 'on' : ''}>1. Seus dados</span>
            <span className={step >= 2 ? 'on' : ''}>2. Senha</span>
          </div>

          {step === 1 ? (
            <>
              <h3>Criar meu acesso</h3>
              <p className="muted">Comece com o básico — depois é só criar uma senha.</p>
              <div className="field">
                <label>Nome completo</label>
                <input className="input" value={form.name} onChange={set('name')} autoFocus required />
              </div>
              <div className="field">
                <label>WhatsApp</label>
                <input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="(51) 99999-9999" />
              </div>
              <div className="field">
                <label>E-mail</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="seu@email.com" required />
              </div>
              <button className="btn btn-primary btn-block btn-xl" type="submit">
                Avançar <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <>
              <h3>Criar uma senha</h3>
              <p className="muted">Você vai usar o e-mail <b>{form.email}</b> e esta senha para entrar.</p>
              <div className="field">
                <label>Senha</label>
                <div className="access-pwd">
                  <input className="input" type={show ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder="Mín. 6 caracteres" autoFocus required />
                  <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} title={show ? 'Ocultar' : 'Mostrar'}>
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Confirmar senha</label>
                <input className="input" type={show ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')} required />
              </div>
              <button className="btn btn-primary btn-block btn-xl" disabled={submitting} type="submit">
                {submitting ? 'Criando...' : <>Criar conta e entrar <Check size={16} /></>}
              </button>
              <button type="button" className="auth-back" style={{ marginTop: 14, display: 'inline-flex' }} onClick={() => setStep(1)}>
                <ArrowLeft size={14} /> Voltar
              </button>
            </>
          )}

          <div className="auth-links" style={{ marginTop: 18 }}>
            <span className="muted" style={{ fontSize: 13 }}>Já tem acesso?</span>
            <Link to="/login" className="auth-back">Entrar</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

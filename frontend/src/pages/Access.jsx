import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import '../styles/gate.css';

// Token de acesso (pode ser sobrescrito por VITE_ACCESS_TOKEN no build).
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN || 'VAI2026';

export default function Access() {
  const nav = useNavigate();
  const [token, setToken] = useState('');
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (loading) return;
    setErr(false);
    setLoading(true);
    setTimeout(() => {
      if (token.trim() === ACCESS_TOKEN) {
        try { localStorage.setItem('vai_access', '1'); } catch {}
        nav('/lp', { replace: true });
      } else {
        setErr(true);
        setLoading(false);
      }
    }, 450);
  }

  return (
    <div className="gate">
      <form className={`gate-card ${err ? 'err' : ''}`} onSubmit={submit}>
        <div className="gate-logo"><img src="/vai-logo.png" alt="VAI" /></div>
        <h1>Área restrita</h1>
        <p className="sub">Insira seu token de acesso para entrar na plataforma da campanha.</p>

        <div className="gate-field">
          <Lock size={18} className="ic" />
          <input
            type="password"
            placeholder="Token de acesso"
            value={token}
            onChange={(e) => { setToken(e.target.value); setErr(false); }}
            autoFocus
          />
        </div>
        <div className="gate-err">{err ? 'Token inválido. Verifique e tente novamente.' : ''}</div>

        <button className="gate-btn" type="submit" disabled={loading}>
          {loading ? 'Validando...' : <>Acessar <ArrowRight size={18} /></>}
        </button>

        <div className="gate-foot">Powered by <b>VAI</b> · Sistemas Inteligentes</div>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiError } from '../api/client.js';
import '../styles/legal.css';

function RsFlag() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" width="100%" height="100%">
      <defs><clipPath id="rsclip-dd"><rect x="0" y="0" width="48" height="48" rx="13" /></clipPath></defs>
      <g clipPath="url(#rsclip-dd)">
        <polygon points="0,0 48,0 48,10 0,28" fill="#2bb153" />
        <polygon points="0,28 48,10 48,30 0,48" fill="#f3083e" />
        <polygon points="0,48 48,30 48,48" fill="#fec330" />
      </g>
    </svg>
  );
}

export default function DataDeletion() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', reason: '' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null); // { protocol, message }
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Informe seu nome completo.');
    if (!form.email.trim() && !form.phone.trim())
      return setError('Informe pelo menos um e-mail ou telefone para localizarmos seu cadastro.');

    setSending(true);
    try {
      const { data } = await api.post('/public/data-deletion', {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        reason: form.reason.trim() || null,
      });
      setDone(data);
    } catch (err) {
      setError(apiError(err, 'Não foi possível registrar sua solicitação. Tente novamente.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="legal">
      <header className="legal-top">
        <div className="wrap">
          <span className="legal-flag"><RsFlag /></span>
          <b>Márcio Bins Ely · Márcio Binsely Digital</b>
          <Link to="/lp">Voltar ao site</Link>
        </div>
      </header>

      <main className="legal-card">
        <h1>Excluir meus dados</h1>
        <p className="legal-sub">Solicitação de exclusão de dados pessoais · LGPD (Lei nº 13.709/2018)</p>

        <p>
          Você tem o direito de solicitar a exclusão dos seus dados pessoais da plataforma
          <strong> Márcio Binsely Digital</strong>. Preencha o formulário abaixo com os dados usados no seu
          cadastro (e-mail e/ou telefone) para que possamos localizar e remover suas informações.
        </p>

        <div className="legal-box">
          <h3 style={{ marginTop: 0 }}>O que é excluído</h3>
          <p style={{ margin: '4px 0' }}>
            Nome, telefone/WhatsApp, e-mail, endereço, e todo o histórico de participação vinculado ao seu
            cadastro. A exclusão é <strong>permanente</strong> e ocorre em até <strong>15 dias úteis</strong>,
            salvo dados que a lei nos obrigue a reter.
          </p>
        </div>

        {done ? (
          <div className="legal-alert ok" role="status">
            <p style={{ margin: '0 0 6px' }}><strong>✅ Solicitação registrada com sucesso!</strong></p>
            <p style={{ margin: '0 0 6px' }}>{done.message}</p>
            {done.protocol && (
              <p style={{ margin: 0 }}>Protocolo: <code>{done.protocol}</code></p>
            )}
          </div>
        ) : (
          <form className="legal-form" onSubmit={submit} noValidate>
            {error && <div className="legal-alert err" role="alert">{error}</div>}

            <div className="legal-field">
              <label htmlFor="dd-name">Nome completo *</label>
              <input id="dd-name" type="text" value={form.name} onChange={set('name')} autoComplete="name" required />
            </div>

            <div className="legal-field">
              <label htmlFor="dd-email">E-mail cadastrado</label>
              <input id="dd-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="voce@exemplo.com" />
            </div>

            <div className="legal-field">
              <label htmlFor="dd-phone">Telefone / WhatsApp cadastrado</label>
              <input id="dd-phone" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="(51) 99999-9999" />
              <span className="legal-hint">Informe e-mail e/ou telefone — pelo menos um é obrigatório.</span>
            </div>

            <div className="legal-field">
              <label htmlFor="dd-reason">Motivo (opcional)</label>
              <textarea id="dd-reason" rows={3} value={form.reason} onChange={set('reason')} />
            </div>

            <button className="legal-btn" type="submit" disabled={sending}>
              {sending ? 'Enviando…' : 'Solicitar exclusão dos meus dados'}
            </button>
          </form>
        )}

        <h2>Prefere falar direto com a gente?</h2>
        <div className="legal-box">
          <p style={{ margin: 0 }}>Você também pode solicitar a exclusão pelos nossos canais:</p>
          <div className="legal-contact">
            <a href="mailto:contato@marciobinsely.com.br?subject=Exclus%C3%A3o%20de%20dados%20(LGPD)">✉️ contato@marciobinsely.com.br</a>
            <a href="https://wa.me/5551993069837?text=Quero%20solicitar%20a%20exclus%C3%A3o%20dos%20meus%20dados" target="_blank" rel="noopener noreferrer">💬 WhatsApp (51) 99306-9837</a>
          </div>
        </div>

        <p style={{ fontSize: '.9rem' }}>
          Saiba mais sobre como tratamos seus dados na nossa{' '}
          <Link to="/privacidade">Política de Privacidade</Link>.
        </p>
      </main>

      <footer className="legal-foot">
        © {new Date().getFullYear()} Márcio Bins Ely · Porto Alegre/RS ·{' '}
        <Link to="/privacidade">Política de Privacidade</Link>
      </footer>
    </div>
  );
}

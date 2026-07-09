import { useMemo, useState } from 'react';
import { RefreshCw, Copy, Check, Eye, EyeOff, MessageCircle, KeyRound } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import api, { apiError } from '../api/client.js';
import { useToast } from '../context/ToastContext.jsx';

// Alfabeto sem caracteres ambíguos (0/O, 1/l/I) — senha forte e fácil de digitar.
const SAFE = { up: 'ABCDEFGHJKLMNPQRSTUVWXYZ', lo: 'abcdefghijkmnpqrstuvwxyz', dg: '23456789' };
function genPassword() {
  const all = SAFE.up + SAFE.lo + SAFE.dg;
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  const p = [pick(SAFE.up), pick(SAFE.lo), pick(SAFE.dg), pick(SAFE.dg)];
  for (let i = 0; i < 6; i++) p.push(pick(all));
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p.join('');
}

/**
 * Gera/define a senha de um usuário e entrega o acesso pronto para enviar
 * manualmente (copiar ou abrir no WhatsApp). Como a senha fica criptografada
 * no banco, "enviar o acesso" = definir uma senha nova naquele momento.
 */
export default function AccessModal({ user, onClose }) {
  const toast = useToast();
  const [pwd, setPwd] = useState(() => user.initialPassword || genPassword());
  const [show, setShow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const loginUrl = `${window.location.origin}/login`;
  const first = (user.name || '').split(' ')[0] || user.name || '';
  const phone = String(user.phone || '').replace(/\D/g, '');

  const message = useMemo(
    () =>
      `Olá, ${first}! Este é o seu acesso à plataforma da campanha do Márcio Bins Ely:\n\n` +
      `Link: ${loginUrl}\n` +
      `E-mail: ${user.email}\n` +
      `Senha: ${pwd}\n\n` +
      `Recomendamos trocar a senha no primeiro acesso.`,
    [first, loginUrl, user.email, pwd]
  );

  async function ensureSaved() {
    if (!pwd || pwd.length < 6) { toast.error('A senha precisa ter ao menos 6 caracteres.'); return false; }
    setSaving(true);
    try {
      await api.put(`/users/${user.id}`, { password: pwd });
      return true;
    } catch (e) {
      toast.error(apiError(e, 'Não foi possível ativar a senha.'));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function copyMessage() {
    if (!(await ensureSaved())) return;
    try { await navigator.clipboard.writeText(message); } catch { /* clipboard bloqueado */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
    toast.success('Acesso ativado e copiado! Cole no WhatsApp da pessoa.');
  }

  async function copyPassword() {
    try { await navigator.clipboard.writeText(pwd); toast.success('Senha copiada.'); } catch {}
  }

  async function sendWhatsApp() {
    if (!phone) { toast.error('Este usuário não tem WhatsApp cadastrado.'); return; }
    if (!(await ensureSaved())) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    toast.success('Acesso ativado! Abrindo o WhatsApp…');
  }

  return (
    <Modal
      title="Enviar acesso"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Fechar</button>
          <button className="btn" onClick={copyMessage} disabled={saving}>
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiado!' : 'Copiar mensagem'}
          </button>
          <button className="btn btn-green" onClick={sendWhatsApp} disabled={saving || !phone} title={!phone ? 'Sem WhatsApp cadastrado' : ''}>
            <MessageCircle size={15} /> Enviar no WhatsApp
          </button>
        </>
      }
    >
      <div className="access-head">
        <div className="access-ic"><KeyRound size={20} /></div>
        <div>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
      </div>
      <p className="access-note">
        Gere a senha, ative e envie o acesso para a pessoa. Como a senha fica criptografada,
        ao copiar ou enviar nós <b>definimos essa senha agora</b> na conta dela.
      </p>

      <div className="field">
        <label>Senha de acesso</label>
        <div className="access-pwd">
          <input className="input" type={show ? 'text' : 'password'} value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <button type="button" className="icon-btn" title={show ? 'Ocultar' : 'Mostrar'} onClick={() => setShow((s) => !s)}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button type="button" className="icon-btn" title="Gerar nova senha" onClick={() => setPwd(genPassword())}>
            <RefreshCw size={16} />
          </button>
          <button type="button" className="icon-btn" title="Copiar só a senha" onClick={copyPassword}>
            <Copy size={16} />
          </button>
        </div>
      </div>

      <div className="field">
        <label>Mensagem pronta para enviar</label>
        <div className="access-box">{message}</div>
      </div>
    </Modal>
  );
}

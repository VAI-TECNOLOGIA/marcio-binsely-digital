import { MessageCircle } from 'lucide-react';
import { waLink } from '../lib/format.js';

/**
 * Atalho para abrir a conversa do contato no WhatsApp.
 * Já leva uma saudação com o primeiro nome — o WhatsApp sempre mostra o texto
 * antes de enviar, então nada sai sem a pessoa revisar.
 * Não renderiza nada quando o contato não tem número válido.
 */
export default function WhatsAppButton({ person, size = 15 }) {
  const primeiro = (person?.name || '').trim().split(' ')[0] || '';
  const saudacao = primeiro
    ? `Olá, ${primeiro}! Aqui é da campanha do Márcio Bins Ely.`
    : 'Olá! Aqui é da campanha do Márcio Bins Ely.';

  const href = waLink(person?.whatsapp || person?.phone, saudacao);
  if (!href) return null;

  return (
    <a
      className="btn btn-ghost btn-sm btn-wa"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Chamar ${primeiro || 'contato'} no WhatsApp`}
      onClick={(e) => e.stopPropagation()}
    >
      <MessageCircle size={size} />
    </a>
  );
}

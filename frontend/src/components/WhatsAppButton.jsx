import WhatsAppIcon from './icons/WhatsAppIcon.jsx';
import { waLink, nomeProprio } from '../lib/format.js';

/**
 * Atalho para abrir a conversa do contato no WhatsApp.
 * Usa o glifo da marca em verde sólido: numa linha de tabela cheia de ícones
 * de traço, a forma + a cor são o que fazem a ação ser reconhecida de relance.
 * Já leva uma saudação com o primeiro nome — o WhatsApp sempre mostra o texto
 * antes de enviar, então nada sai sem a pessoa revisar.
 * Não renderiza nada quando o contato não tem número válido.
 */
export default function WhatsAppButton({ person, size = 15 }) {
  // A base veio em CAIXA ALTA — "Olá, ROBERTO!" parece disparo automático.
  const primeiro = nomeProprio(person?.name).split(' ')[0] || '';
  // Campanha oficial (candidatura registrada — site com número de urna 1234).
  // caracteriza propaganda eleitoral antecipada.
  const saudacao = primeiro
    ? `Olá, ${primeiro}! Aqui é da campanha do Márcio Bins Ely.`
    : 'Olá! Aqui é da campanha do Márcio Bins Ely.';

  const href = waLink(person?.whatsapp || person?.phone, saudacao);
  if (!href) return null;

  return (
    <a
      className="btn-wa"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Chamar ${primeiro || 'contato'} no WhatsApp`}
      aria-label={`Chamar ${primeiro || 'contato'} no WhatsApp`}
      onClick={(e) => e.stopPropagation()}
    >
      <WhatsAppIcon size={size} />
    </a>
  );
}

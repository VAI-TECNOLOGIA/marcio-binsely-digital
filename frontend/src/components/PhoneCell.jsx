import { formatPhone, waLink, nomeProprio } from '../lib/format.js';

/**
 * Célula de telefone das listagens de cadastro.
 * Quem tem número: aparece formatado e abre a conversa no WhatsApp.
 * Quem não tem: "Sem telefone" em vermelho — é uma lacuna que precisa ser
 * vista de longe, porque sem número a pessoa não entra em disparo nem em
 * confirmação por WhatsApp.
 */
export default function PhoneCell({ person }) {
  const numero = person?.whatsapp || person?.phone;
  const href = waLink(numero, `Olá, ${nomeProprio(person?.name).split(' ')[0]}! Aqui é da campanha do Márcio Bins Ely.`);

  if (!numero) return <span className="cell-sem-tel">Sem telefone</span>;

  // Número existe mas está incompleto (veio quebrado da importação):
  // mostra o que há, sem oferecer um link que abriria contato inválido.
  if (!href) return <span className="cell-tel-invalido" title="Número incompleto">{formatPhone(numero)}</span>;

  return (
    <a
      className="cell-tel"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir conversa no WhatsApp"
      onClick={(e) => e.stopPropagation()}
    >
      {formatPhone(numero)}
    </a>
  );
}

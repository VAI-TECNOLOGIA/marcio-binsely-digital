export function cls(...args) {
  return args.filter(Boolean).join(' ');
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
}

export function formatPhone(phone = '') {
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return phone || '—';
}

/**
 * Monta o link do WhatsApp (wa.me) a partir do telefone salvo.
 * A base guarda só DDD + número (ex.: 51999647944); o wa.me exige o país (55).
 * Devolve null quando não há número válido — aí o botão não deve aparecer.
 */
export function waLink(phone, message) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    // já veio com o país
  } else if (d.length === 10 || d.length === 11) {
    d = `55${d}`;
  } else {
    return null; // número incompleto: melhor não oferecer o atalho
  }
  const texto = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${d}${texto}`;
}

export function toInputDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function cls(...args) {
  return args.filter(Boolean).join(' ');
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Data-só (nascimento, evento, publicação): formata em UTC para não "voltar"
 * um dia no fuso do Brasil (UTC-3). Use para campos type:'date'. Para
 * timestamps (createdAt) continue no formatDate, que mostra a hora local.
 */
export function formatDateOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
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
  let d = String(phone).replace(/\D/g, '');
  // Remove o código do país para formatar igual ao resto.
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  // Fixo: a base do gabinete tem ~2.900 números de 10 dígitos, que antes
  // apareciam crus na tela por não cair em nenhum formato.
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone || '—';
}

// Partículas que ficam em minúscula no meio do nome.
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'la']);

/**
 * Normaliza nome próprio para exibição.
 * A base do gabinete veio em CAIXA ALTA ("ROBERTO PERES"), que grita na tela.
 * CSS não resolve: `text-transform: capitalize` não rebaixa maiúsculas.
 */
export function nomeProprio(nome) {
  if (!nome) return '';
  return String(nome)
    .trim()
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((p, i) => {
      if (i > 0 && PARTICULAS.has(p)) return p;
      // Mantém iniciais como "J." em maiúscula e trata hífen (Ana-Maria).
      return p.replace(/(^|-)(\p{L})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase('pt-BR'));
    })
    .join(' ');
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

// ============================================================
//  Bairro de Porto Alegre -> zona da campanha.
//
//  Sem isso, todos os cadastros de POA caem numa regiao so (a cidade tem
//  um unico registro em City), e o grafico "por regiao" fica inutil:
//  25 mil pessoas em "Centro" e as demais zonas zeradas.
//
//  Baseado na divisao geografica oficial de Porto Alegre. Se a campanha
//  usa um recorte proprio (por exemplo, zonas eleitorais), e aqui que se
//  ajusta — a funcao e a unica fonte da verdade para regiao de POA.
// ============================================================

const ZONAS = {
  Centro: [
    'centro', 'centro historico', 'cidade baixa', 'bom fim', 'independencia',
    'farroupilha', 'praia de belas', 'menino deus', 'azenha', 'santana',
    'rio branco', 'moinhos de vento', 'auxiliadora', 'floresta', 'navegantes',
    'sao geraldo', 'higienopolis', 'bela vista', 'mont serrat', 'montserrat',
    'santa cecilia', 'jardim botanico', 'petropolis', 'tres figueiras',
    'chacara das pedras', 'boa vista', 'vila ipiranga', 'praia belas',
  ],
  'Zona Norte': [
    'sarandi', 'rubem berta', 'mario quintana', 'passo das pedras',
    'costa e silva', 'jardim itu', 'jardim itu sabara', 'jardim lindoia',
    'cristo redentor', 'sao sebastiao', 'humaita', 'farrapos', 'iapi',
    'passo d areia', 'passo darea', 'passo da areia', 'sao joao',
    'anchieta', 'vila floresta', 'jardim sao pedro', 'parque santa fe',
    'jardim leopoldina', 'santa maria goretti', 'jardim floresta',
    // Ilhas do Guaíba: administrativamente próprias, geograficamente a
    // noroeste — ficam na Zona Norte por não haver zona própria cadastrada.
    'arquipelago', 'ilha da pintada', 'ilha grande dos marinheiros',
  ],
  'Zona Leste': [
    'partenon', 'lomba do pinheiro', 'agronomia', 'jardim carvalho',
    'bom jesus', 'morro santana', 'protasio alves', 'vila jardim',
    'santo antonio', 'sao jose', 'cascata', 'coronel aparicio borges',
    'vila joao pessoa', 'intercap', 'jardim do salso', 'jardim sabara',
    'mario quintana leste', 'vila sao jose', 'sao jose leste',
  ],
  'Zona Sul': [
    'tristeza', 'cavalhada', 'camaqua', 'cristal', 'nonoai', 'teresopolis',
    'vila nova', 'medianeira', 'gloria', 'vila assuncao', 'ipanema',
    'espirito santo', 'guaruja', 'pedra redonda', 'serraria', 'hipica',
    'aberta dos morros', 'jardim isabel', 'vila conceicao', 'santa tereza',
    'campo novo', 'vila do ies', 'jardim vila nova', 'coronel marcos',
  ],
  'Extremo Sul': [
    'restinga', 'belem novo', 'belem velho', 'lami', 'ponta grossa',
    'chapeu do sol', 'extrema', 'lageado', 'sao caetano', 'boa vista do sul',
    'santa rosa de lima', 'jardim mostardeiro',
  ],
};

/** Remove acentos e padroniza para comparar. */
function chave(txt) {
  return String(txt || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Índice invertido: bairro -> zona (montado uma vez).
const INDICE = new Map();
for (const [zona, bairros] of Object.entries(ZONAS)) {
  for (const b of bairros) INDICE.set(chave(b), zona.trim());
}

/**
 * Zona de Porto Alegre para um bairro. `null` quando o bairro é
 * desconhecido — melhor sem região do que numa região errada.
 */
export function zonaDoBairro(bairro) {
  const k = chave(bairro);
  if (!k) return null;
  if (INDICE.has(k)) return INDICE.get(k);
  // "vila nova" dentro de "jardim vila nova", etc.
  for (const [nome, zona] of INDICE) {
    if (k === nome || k.startsWith(nome + ' ') || k.endsWith(' ' + nome)) return zona;
  }
  return null;
}

/** Só Porto Alegre tem zonas; as demais cidades usam a região da cidade. */
export function ehPortoAlegre(cityName) {
  const k = chave(cityName);
  return k === 'porto alegre' || k === 'poa' || k === 'porto alegre rs';
}

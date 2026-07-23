// Fallback de geolocalização por cidade.
// Quando um cadastro chega sem lat/lng (landing pública, cadastro manual sem
// coordenada), posicionamos o ponto no centroide da cidade com um deslocamento
// determinístico (~±2km) derivado de bairro+telefone — assim os pontos da mesma
// cidade não empilham no mesmo pixel e o mapa político funciona desde o 1º dia.
// Precisão real (geocoding por endereço) pode substituir depois sem migração:
// basta sobrescrever lat/lng.

const CITY_CENTROIDS = {
  'porto alegre': [-30.0346, -51.2177],
  'canoas': [-29.9178, -51.1836],
  'gravataí': [-29.9444, -50.9919],
  'gravatai': [-29.9444, -50.9919],
  'viamão': [-30.0819, -51.0233],
  'viamao': [-30.0819, -51.0233],
  'alvorada': [-29.9897, -51.0808],
  'cachoeirinha': [-29.9472, -51.0936],
  'são leopoldo': [-29.7603, -51.1472],
  'sao leopoldo': [-29.7603, -51.1472],
  'novo hamburgo': [-29.6783, -51.1306],
  'esteio': [-29.8617, -51.1792],
  'sapucaia do sul': [-29.8276, -51.145],
  'guaíba': [-30.1136, -51.325],
  'guaiba': [-30.1136, -51.325],
  'eldorado do sul': [-30.0847, -51.6187],
  // Demais cidades presentes na base do gabinete. Sem elas, o backfill
  // empurraria (por exemplo) os 290 de Alegrete para dentro de Porto Alegre.
  'alegrete': [-29.7833, -55.7911],
  'santa maria': [-29.6842, -53.8069],
  'passo fundo': [-28.2624, -52.4067],
  'caxias do sul': [-29.1685, -51.1796],
  'pelotas': [-31.7654, -52.3376],
  'rio grande': [-32.035, -52.0986],
  'torres': [-29.335, -49.7267],
  'nonoai': [-27.3617, -52.7783],
  'uruguaiana': [-29.7547, -57.0883],
  'bagé': [-31.3314, -54.1069],
  'bage': [-31.3314, -54.1069],
  'santa cruz do sul': [-29.7175, -52.4258],
  'bento gonçalves': [-29.1706, -51.5192],
  'bento goncalves': [-29.1706, -51.5192],
  'erechim': [-27.6339, -52.2739],
  'ijuí': [-28.3878, -53.915],
  'ijui': [-28.3878, -53.915],
  'santo ângelo': [-28.2994, -54.2631],
  'santo angelo': [-28.2994, -54.2631],
  'lajeado': [-29.4669, -51.9614],
  'montenegro': [-29.6883, -51.4611],
  'taquara': [-29.6503, -50.7803],
  'osório': [-29.8869, -50.2697],
  'osorio': [-29.8869, -50.2697],
  'capão da canoa': [-29.7458, -50.0092],
  'capao da canoa': [-29.7458, -50.0092],
  'tramandaí': [-29.9847, -50.1336],
  'tramandai': [-29.9847, -50.1336],
  'imbé': [-29.9744, -50.1281],
  'imbe': [-29.9744, -50.1281],
  'gramado': [-29.3789, -50.8739],
  'canela': [-29.3628, -50.8117],
  'são paulo': [-23.5505, -46.6333],
  'sao paulo': [-23.5505, -46.6333],
  // Abreviações e grafias que aparecem na base digitada à mão.
  'poa': [-30.0346, -51.2177],
  'porto alegre - rs': [-30.0346, -51.2177],
  'são borja': [-28.6606, -56.0044],
  'sao borja': [-28.6606, -56.0044],
  'lagoa vermelha': [-28.2089, -51.5258],
  'sarandi': [-27.9439, -52.9236],
  'camaquã': [-30.8511, -51.8122],
  'camaqua': [-30.8511, -51.8122],
  'rosário do sul': [-30.2586, -54.9139],
  'rosario do sul': [-30.2586, -54.9139],
  'cruz alta': [-28.6386, -53.6064],
  'vacaria': [-28.5122, -50.9339],
  'carazinho': [-28.2836, -52.7864],
  'venâncio aires': [-29.6094, -52.1917],
  'venancio aires': [-29.6094, -52.1917],
  'são gabriel': [-30.3364, -54.32],
  'sao gabriel': [-30.3364, -54.32],
  'santana do livramento': [-30.8908, -55.5328],
  'são sebastião do caí': [-29.5872, -51.3761],
  'parobé': [-29.6283, -50.8342],
  'parobe': [-29.6283, -50.8342],
  'campo bom': [-29.6753, -51.0603],
  'sapiranga': [-29.6381, -51.0067],
  'charqueadas': [-29.9578, -51.6253],
  'triunfo': [-29.9447, -51.7086],
  'nova santa rita': [-29.8508, -51.2925],
  'portão': [-29.7014, -51.2436],
  'portao': [-29.7014, -51.2436],
  'brasília': [-15.7939, -47.8828],
  'brasilia': [-15.7939, -47.8828],
  'rio de janeiro': [-22.9068, -43.1729],
  'florianópolis': [-27.5954, -48.548],
  'florianopolis': [-27.5954, -48.548],
  'curitiba': [-25.4284, -49.2733],
};

/**
 * Centroide da cidade, ou null se desconhecida.
 * Usado no backfill em massa: colocar cidade desconhecida em Porto Alegre
 * mentiria no mapa político. Melhor deixar sem ponto.
 */
export function cityCentroid(cityName) {
  const key = String(cityName || '').trim().toLowerCase();
  return CITY_CENTROIDS[key] || null;
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Coordenada aproximada p/ (cidade, bairro, seed). Sempre retorna algo (default POA). */
export function fallbackLatLng({ cityName, neighborhood, seed = '' }) {
  const key = String(cityName || 'Porto Alegre').trim().toLowerCase();
  const base = CITY_CENTROIDS[key] || CITY_CENTROIDS['porto alegre'];
  const h = hashCode(`${key}|${(neighborhood || '').toLowerCase()}|${seed}`);
  const jLat = ((h % 1000) / 1000 - 0.5) * 0.036;      // ±0.018° ≈ 2 km
  const jLng = (((h >> 10) % 1000) / 1000 - 0.5) * 0.036;
  return { lat: +(base[0] + jLat).toFixed(6), lng: +(base[1] + jLng).toFixed(6) };
}

/** Resolve cityId/regionId a partir do nome da cidade (case-insensitive). */
export async function linkCityByName(prisma, cityName) {
  if (!cityName) return null;
  return prisma.city.findFirst({
    where: { name: { equals: String(cityName).trim(), mode: 'insensitive' } },
    select: { id: true, regionId: true },
  });
}

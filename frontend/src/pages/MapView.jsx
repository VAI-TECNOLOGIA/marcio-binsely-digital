import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { AlertTriangle, RotateCw } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import api, { apiError } from '../api/client.js';
import { label } from '../config/enums.js';
import { formatPhone } from '../lib/format.js';

const POA = [-30.0346, -51.2177];
const RS_CENTER = [-29.9, -53.2];

const LAYERS = [
  { key: 'supporters', label: 'Apoiadores', color: '#2563eb' },
  { key: 'banners', label: 'Faixas', color: '#C8102E' },
  { key: 'streetActions', label: 'Ações de rua', color: '#1B7A43' },
];

export default function MapView() {
  const [data, setData] = useState(null); // { supporters, banners, streetActions }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState({ supporters: true, banners: true, streetActions: true });

  async function load() {
    setLoading(true); setError(null);
    try {
      const { data } = await api.get('/dashboard/map');
      setData(data);
    } catch (e) {
      setError(apiError(e, 'Não foi possível carregar as camadas do mapa.'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // conta apenas quando carregou com sucesso; durante loading/erro não mostra "0".
  const count = (k) => (loading || error || !data ? '…' : (data[k]?.length || 0));

  return (
    <Layout title="Mapa político inteligente" subtitle="Apoiadores, faixas e ações georreferenciadas no Rio Grande do Sul">
      <div className="toolbar">
        {LAYERS.map((l) => (
          <label key={l.key} className="legend-item" style={{ cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
            <input type="checkbox" checked={visible[l.key]} disabled={loading || !!error}
              onChange={(e) => setVisible((v) => ({ ...v, [l.key]: e.target.checked }))} />
            <span className="legend-dot" style={{ background: l.color }} /> {l.label} ({count(l.key)})
          </label>
        ))}
        <div className="spacer" />
        <button className="btn btn-sm" onClick={load} disabled={loading}><RotateCw size={14} /> Recarregar</button>
      </div>

      {error ? (
        <div className="map-wrap" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="empty">
            <div className="empty-icon"><AlertTriangle size={26} /></div>
            <h4>{error}</h4>
            <button className="btn btn-primary btn-sm mt-16" onClick={load}><RotateCw size={14} /> Tentar novamente</button>
          </div>
        </div>
      ) : loading ? (
        <div className="map-wrap" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="center-box"><div className="spinner" /><span className="muted">Carregando camadas do mapa…</span></div>
        </div>
      ) : (
        <div className="map-wrap">
          <MapContainer center={RS_CENTER} zoom={7} scrollWheelZoom style={{ height: '100%' }}>
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {LAYERS.map((l) => visible[l.key] && (data[l.key] || []).map((p) => (
              <CircleMarker key={`${l.key}-${p.id}`} center={[p.lat, p.lng]} radius={l.key === 'supporters' ? 5 : 7}
                pathOptions={{ color: l.color, fillColor: l.color, fillOpacity: 0.7, weight: 1.5 }}>
                <Popup><Detail layer={l.key} p={p} /></Popup>
              </CircleMarker>
            )))}
          </MapContainer>
        </div>
      )}
    </Layout>
  );
}

function Detail({ layer, p }) {
  if (layer === 'supporters')
    return (<div><strong>{p.name}</strong><br />{label('SupportType', p.supportType)}<br />{formatPhone(p.phone)}<br /><span style={{ color: '#7a6f5e' }}>{[p.neighborhood, p.cityName].filter(Boolean).join(', ')}</span></div>);
  if (layer === 'banners')
    return (<div><strong>Faixa — {p.responsibleName || '—'}</strong><br />{p.address || [p.neighborhood, p.cityName].filter(Boolean).join(', ')}<br />{label('BannerStatus', p.status)}</div>);
  return (<div><strong>{p.title}</strong><br />{label('StreetActionType', p.type)}<br /><span style={{ color: '#7a6f5e' }}>{p.neighborhood}</span></div>);
}

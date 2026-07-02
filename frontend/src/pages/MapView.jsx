import { useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl } from 'react-leaflet';
import {
  AlertTriangle, RotateCw, Users, MapPin, Activity,
  Radio, Pause, Layers,
} from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import api, { apiError } from '../api/client.js';
import { label } from '../config/enums.js';
import { formatPhone } from '../lib/format.js';
import 'leaflet/dist/leaflet.css';

const RS_CENTER = [-29.6, -53.2];
const REFRESH_MS = 30_000;

// Tile CartoDB Voyager — aparência clean tipo Google Maps, gratuito, sem key.
// Retina-ready via {r}.
const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const LAYERS = [
  { key: 'supporters',    lbl: 'Apoiadores',     color: '#2563eb', icon: Users },
  { key: 'banners',       lbl: 'Faixas',         color: '#C8102E', icon: MapPin },
  { key: 'streetActions', lbl: 'Ações de rua',   color: '#1B7A43', icon: Activity },
];

function timeAgo(ts) {
  if (!ts) return null;
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return 'agora mesmo';
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  return `há ${Math.floor(m / 60)}h`;
}

export default function MapView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [live, setLive] = useState(true);
  const [visible, setVisible] = useState({
    supporters: true, banners: true, streetActions: true,
  });
  // força re-render pra atualizar timeAgo(...) sem outra fetch
  const [tick, setTick] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    if (!silent) setError(null);
    try {
      const { data } = await api.get('/dashboard/map');
      setData(data);
      setLastUpdate(Date.now());
    } catch (e) {
      if (!silent) setError(apiError(e, 'Não foi possível carregar as camadas do mapa.'));
    } finally {
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }, []);

  // primeira carga
  useEffect(() => { load(); }, [load]);

  // polling ao vivo
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [live, load]);

  // tick pra "há Ns" atualizar
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line no-unused-vars
  const _ = tick;

  const counts = useMemo(() => {
    const c = {};
    for (const l of LAYERS) c[l.key] = data?.[l.key]?.length || 0;
    c.total = c.supporters + c.banners + c.streetActions;
    return c;
  }, [data]);

  const anyContent = data && counts.total > 0;

  return (
    <Layout
      title="Mapa político"
      subtitle="Apoiadores, faixas e ações georreferenciadas em tempo real"
    >
      <div className="map-shell">
        {/* SIDEBAR */}
        <aside className="map-side">
          <div className="live-badge" data-live={live}>
            <span className="dot" />
            {live ? 'AO VIVO' : 'PAUSADO'}
            <button
              className="live-toggle"
              onClick={() => setLive((v) => !v)}
              aria-label={live ? 'Pausar atualização automática' : 'Ativar atualização automática'}
            >
              {live ? <><Pause size={11} /> pausar</> : <><Radio size={11} /> ativar</>}
            </button>
          </div>

          <div className="side-stat">
            <div className="side-stat-num">
              {loading ? '—' : counts.total.toLocaleString('pt-BR')}
            </div>
            <div className="side-stat-label">Pontos no mapa</div>
            {refreshing ? (
              <div className="side-stat-sub">
                <RotateCw size={11} className="spin" /> atualizando…
              </div>
            ) : lastUpdate ? (
              <div className="side-stat-sub">
                atualizado {timeAgo(lastUpdate)}
              </div>
            ) : null}
          </div>

          <div className="layer-list">
            <div className="layer-list-title">
              <Layers size={11} /> Camadas
            </div>
            {LAYERS.map((l) => (
              <label
                key={l.key}
                className={`layer-item ${visible[l.key] ? '' : 'off'}`}
                style={{ '--c': l.color }}
              >
                <input
                  type="checkbox"
                  checked={visible[l.key]}
                  disabled={loading || !!error}
                  onChange={(e) =>
                    setVisible((v) => ({ ...v, [l.key]: e.target.checked }))
                  }
                />
                <div className="layer-dot"><l.icon size={12} /></div>
                <div className="layer-name">{l.lbl}</div>
                <div className="layer-count">
                  {loading ? '…' : counts[l.key].toLocaleString('pt-BR')}
                </div>
              </label>
            ))}
          </div>

          <button
            className="btn-refresh"
            onClick={() => load(false)}
            disabled={loading || refreshing}
          >
            <RotateCw size={13} className={loading || refreshing ? 'spin' : ''} />
            Recarregar
          </button>
        </aside>

        {/* MAP */}
        {error ? (
          <div className="map-wrap map-center">
            <div className="empty">
              <div className="empty-icon"><AlertTriangle size={26} /></div>
              <h4>{error}</h4>
              <button className="btn btn-primary btn-sm mt-16" onClick={() => load(false)}>
                <RotateCw size={14} /> Tentar novamente
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="map-wrap map-center">
            <div className="center-box">
              <div className="spinner" />
              <span className="muted">Carregando camadas do mapa…</span>
            </div>
          </div>
        ) : (
          <div className="map-wrap map-container-wrap">
            <MapContainer
              center={RS_CENTER}
              zoom={7}
              scrollWheelZoom
              zoomControl={false}
              style={{ height: '100%', background: '#eaf1f7' }}
            >
              <TileLayer attribution={TILE_ATTR} url={TILE_URL} />
              <ZoomControl position="topright" />
              {LAYERS.map(
                (l) =>
                  visible[l.key] &&
                  (data[l.key] || []).map((p) => (
                    <CircleMarker
                      key={`${l.key}-${p.id}`}
                      center={[p.lat, p.lng]}
                      radius={l.key === 'supporters' ? 6 : 8}
                      pathOptions={{
                        color: '#ffffff',
                        fillColor: l.color,
                        fillOpacity: 0.92,
                        weight: 2,
                      }}
                    >
                      <Popup>
                        <Detail layer={l.key} p={p} />
                      </Popup>
                    </CircleMarker>
                  ))
              )}
            </MapContainer>

            {refreshing && (
              <div className="map-refresh-indicator">
                <RotateCw size={11} className="spin" />
                Atualizando
              </div>
            )}

            {!anyContent && (
              <div className="map-empty-overlay">
                <div className="map-empty-card">
                  <div className="empty-icon"><MapPin size={26} /></div>
                  <h4>Nenhum ponto ainda no mapa</h4>
                  <p className="muted">
                    Cadastros de apoiadores, faixas e ações vão aparecer aqui automaticamente.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function Detail({ layer, p }) {
  if (layer === 'supporters') {
    return (
      <div className="map-popup">
        <div className="map-popup-title">{p.name}</div>
        <div className="map-popup-badge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
          {label('SupportType', p.supportType)}
        </div>
        <div className="map-popup-line">{formatPhone(p.phone)}</div>
        <div className="map-popup-sub">
          {[p.neighborhood, p.cityName].filter(Boolean).join(' · ')}
        </div>
      </div>
    );
  }
  if (layer === 'banners') {
    return (
      <div className="map-popup">
        <div className="map-popup-title">Faixa — {p.responsibleName || '—'}</div>
        <div className="map-popup-badge" style={{ background: '#fde8ec', color: '#c8102e' }}>
          {label('BannerStatus', p.status)}
        </div>
        <div className="map-popup-sub">
          {p.address || [p.neighborhood, p.cityName].filter(Boolean).join(' · ')}
        </div>
      </div>
    );
  }
  return (
    <div className="map-popup">
      <div className="map-popup-title">{p.title}</div>
      <div className="map-popup-badge" style={{ background: '#dcfce7', color: '#166534' }}>
        {label('StreetActionType', p.type)}
      </div>
      <div className="map-popup-sub">{p.neighborhood}</div>
    </div>
  );
}

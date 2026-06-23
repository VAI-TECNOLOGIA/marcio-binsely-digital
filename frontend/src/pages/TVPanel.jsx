import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import { Trophy, CalendarDays, Target, ArrowLeft, MapPin, Users, UserPlus, Flag, Footprints } from 'lucide-react';
import api from '../api/client.js';
import { formatDate } from '../lib/format.js';

// Coordenadas reais das cidades do RS (os totais vêm do banco).
const RS_COORDS = {
  'Porto Alegre': [-30.0346, -51.2177], 'Caxias do Sul': [-29.1678, -51.1794],
  'Pelotas': [-31.7654, -52.3376], 'Canoas': [-29.9177, -51.1844],
  'Santa Maria': [-29.6842, -53.8069], 'Gravataí': [-29.9444, -50.9919],
  'Viamão': [-30.0811, -51.0233], 'Novo Hamburgo': [-29.6783, -51.1306],
  'São Leopoldo': [-29.7603, -51.1472], 'Rio Grande': [-32.035, -52.0986],
  'Alvorada': [-29.9897, -51.0809], 'Passo Fundo': [-28.2576, -52.4091],
  'Sapucaia do Sul': [-29.8378, -51.1469], 'Santa Cruz do Sul': [-29.7175, -52.4258],
  'Cachoeirinha': [-29.9511, -51.0939], 'Bento Gonçalves': [-29.1662, -51.5165],
  'Bagé': [-31.3314, -54.1069], 'Uruguaiana': [-29.7547, -57.0883],
  'Erechim': [-27.6339, -52.2747], 'Ijuí': [-28.3878, -53.9148],
  'Santo Ângelo': [-28.2992, -54.263], 'Lajeado': [-29.4669, -51.9614],
  'Alegrete': [-29.7831, -55.7919], 'Farroupilha': [-29.225, -51.3478],
  'Gramado': [-29.3787, -50.8744],
};

function RSMap({ byCity }) {
  const cities = (byCity || [])
    .map((c) => ({ name: c.name, total: c.value, coord: RS_COORDS[c.name] }))
    .filter((c) => c.coord && c.total > 0);
  if (!cities.length) return <p style={{ color: '#cbd5e1', padding: 12 }}>Sem dados de localização ainda.</p>;
  const max = Math.max(...cities.map((c) => c.total));
  return (
    <div className="tv-map">
      <MapContainer
        center={[-29.9, -53.2]}
        zoom={6}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%', background: '#0a1f15' }}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {cities.map((c) => {
          const r = 8 + (c.total / max) * 28;
          const big = c.total / max >= 0.25;
          return (
            <CircleMarker
              key={c.name}
              center={c.coord}
              radius={r}
              pathOptions={{ color: '#f2b705', fillColor: '#f2b705', fillOpacity: 0.5, weight: 2 }}
            >
              <LeafletTooltip permanent={big} direction="top" className="tv-tip" offset={[0, -2]}>
                <b>{c.name}</b> · {c.total.toLocaleString('pt-BR')}
              </LeafletTooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="tv-map-legend">● Apoiadores por cidade · <span>dados reais</span></div>
    </div>
  );
}

export default function TVPanel() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [now, setNow] = useState(new Date());

  async function load() {
    try {
      const [stats, rankings, events, settings, charts] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/rankings'),
        api.get('/events', { params: { status: 'AGENDADO' } }),
        api.get('/settings'),
        api.get('/dashboard/charts'),
      ]);
      setData({
        stats: stats.data,
        rankings: rankings.data,
        events: (events.data.data || []).slice(0, 5),
        goals: settings.data?.goals || {},
        campaign: settings.data?.campaign || {},
        byCity: charts.data?.byCity || [],
      });
    } catch {
      setData({ error: true });
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <div className="tv"><h1>Carregando painel...</h1></div>;
  const { stats, rankings, events, goals, campaign, byCity } = data;
  const goal = (current, target) => (target ? Math.min(100, Math.round((current / target) * 100)) : 0);

  return (
    <div className="tv">
      <div className="tv-flag-banner"><i className="g" /><i className="y" /><i className="r" /></div>

      <div className="tv-head">
        <div className="flex items-center gap-12">
          <RSFlag size={64} />
          <div>
            <h1>{campaign.name || 'Márcio Bins Ely · 12345'}</h1>
            <div style={{ color: '#f2b705', fontWeight: 600 }}>{campaign.slogan || 'Juntos por ti, juntos por Porto Alegre'}</div>
          </div>
        </div>
        <div className="flex items-center gap-12">
          <div className="tv-live"><span className="dot" /> AO VIVO · {now.toLocaleTimeString('pt-BR')}</div>
          <button className="btn btn-dark" onClick={() => nav('/')}><ArrowLeft size={16} /> Voltar</button>
        </div>
      </div>

      <div className="tv-grid">
        <TvStat icon={UserPlus} value={stats.totalSupporters} label="Apoiadores" />
        <TvStat icon={Users} value={stats.totalVolunteers} label="Voluntários" />
        <TvStat icon={Flag} value={stats.authorizedBanners} label="Faixas nas casas" />
        <TvStat icon={Footprints} value={stats.doneActions} label="Ações realizadas" />
      </div>

      <div className="tv-card" style={{ marginBottom: 20 }}>
        <h3><MapPin size={20} style={{ verticalAlign: '-3px', color: '#f2b705' }} /> Apoio pelo Rio Grande do Sul</h3>
        <RSMap byCity={byCity} />
      </div>

      <div className="tv-cols">
        <div className="tv-card">
          <h3><Trophy size={20} style={{ verticalAlign: '-3px', color: '#f2b705' }} /> Top voluntários</h3>
          {(rankings.volunteers || []).slice(0, 6).map((v) => (
            <div className="tv-rank-row" key={v.id}>
              <strong style={{ color: '#f2b705', width: 32 }}>{v.rank}º</strong>
              <span style={{ flex: 1 }}>{v.name}</span>
              <strong>{v.score} pts</strong>
            </div>
          ))}
        </div>

        <div className="tv-card">
          <h3><Target size={20} style={{ verticalAlign: '-3px', color: '#f2b705' }} /> Metas da campanha</h3>
          <GoalBar label="Apoiadores" current={stats.totalSupporters} target={goals.supporters} pct={goal(stats.totalSupporters, goals.supporters)} />
          <GoalBar label="Voluntários" current={stats.totalVolunteers} target={goals.volunteers} pct={goal(stats.totalVolunteers, goals.volunteers)} />
          <GoalBar label="Faixas" current={stats.authorizedBanners} target={goals.banners} pct={goal(stats.authorizedBanners, goals.banners)} />
          <GoalBar label="Ações" current={stats.doneActions} target={goals.actions} pct={goal(stats.doneActions, goals.actions)} />
        </div>
      </div>

      <div className="tv-card" style={{ marginTop: 20 }}>
        <h3><CalendarDays size={20} style={{ verticalAlign: '-3px', color: '#f2b705' }} /> Próximos eventos</h3>
        {events.length === 0 && <p style={{ color: '#cbd5e1' }}>Sem eventos agendados.</p>}
        {events.map((e) => (
          <div className="tv-rank-row" key={e.id}>
            <span style={{ flex: 1 }}>{e.title}</span>
            <strong>{formatDate(e.date)} {e.time || ''}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function RSFlag({ size = 60 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Bandeira do RS">
      <defs><clipPath id="tvflag"><rect width="64" height="64" rx="13" /></clipPath></defs>
      <g clipPath="url(#tvflag)">
        <rect width="64" height="64" fill="#1b7a43" />
        <polygon points="64,0 64,64 0,64" fill="#c8102e" />
        <line x1="-3" y1="67" x2="67" y2="-3" stroke="#f2b705" strokeWidth="15" />
      </g>
    </svg>
  );
}

function TvStat({ icon: Icon, value, label }) {
  return (
    <div className="tv-stat">
      <div className="tv-stat-ico"><Icon size={22} /></div>
      <div className="v">{value ?? '—'}</div>
      <div className="l">{label}</div>
    </div>
  );
}

function GoalBar({ label, current, target, pct }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="flex justify-between" style={{ marginBottom: 6 }}>
        <span>{label}</span>
        <strong>{current} / {target || '—'}</strong>
      </div>
      <div style={{ height: 12, background: 'rgba(255,255,255,0.12)', borderRadius: 999 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#1B7A43,#f2b705)', borderRadius: 999, transition: 'width .6s ease' }} />
      </div>
    </div>
  );
}

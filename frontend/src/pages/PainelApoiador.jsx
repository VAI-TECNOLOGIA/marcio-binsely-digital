import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Megaphone, Image, Trophy, Package, ArrowRight } from 'lucide-react';
import Layout from '../components/layout/Layout.jsx';
import { Card } from '../components/ui/Card.jsx';
import api from '../api/client.js';
import { formatDateOnly } from '../lib/format.js';

const ATALHOS = [
  { to: '/agenda', icon: CalendarDays, label: 'Agenda', desc: 'Próximos eventos e ações' },
  { to: '/midia-kit', icon: Image, label: 'Mídia Kit', desc: 'Artes para compartilhar' },
  { to: '/tarefas', icon: Trophy, label: 'Engajamento', desc: 'Tarefas que valem pontos' },
  { to: '/materiais', icon: Package, label: 'Pedir material', desc: 'Solicite adesivos e faixas' },
];

export default function PainelApoiador({ user }) {
  const [eventos, setEventos] = useState([]);
  const [avisos, setAvisos] = useState([]);

  useEffect(() => {
    api.get('/events').then((r) => {
      const hoje = new Date().setHours(0, 0, 0, 0);
      const futuros = (r.data.data || [])
        .filter((e) => new Date(e.date).getTime() >= hoje)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 4);
      setEventos(futuros);
    }).catch(() => {});
    api.get('/notices').then((r) => setAvisos((r.data.data || []).slice(0, 4))).catch(() => {});
  }, []);

  const primeiro = (user?.name || '').split(' ')[0] || 'apoiador(a)';

  return (
    <Layout title={`Olá, ${primeiro}!`} subtitle="Que bom ter você na campanha. Veja como ajudar.">
      <div className="ap-grid">
        {ATALHOS.map((a) => (
          <Link key={a.to} to={a.to} className="ap-atalho">
            <div className="ap-atalho-ic"><a.icon size={20} /></div>
            <div className="ap-atalho-tx">
              <strong>{a.label}</strong>
              <span>{a.desc}</span>
            </div>
            <ArrowRight size={16} className="ap-atalho-seta" />
          </Link>
        ))}
      </div>

      <div className="ap-cols">
        <Card title="Próximos eventos" icon={CalendarDays}>
          {eventos.length === 0 ? (
            <p className="cell-muted">Nenhum evento marcado por enquanto.</p>
          ) : (
            <ul className="ap-lista">
              {eventos.map((e) => (
                <li key={e.id}>
                  <div className="ap-data">{formatDateOnly(e.date)}{e.time ? ` · ${e.time}` : ''}</div>
                  <div className="ap-evt"><strong>{e.title}</strong>{e.location ? <span> — {e.location}</span> : null}</div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/agenda" className="ap-vermais">Ver agenda completa <ArrowRight size={14} /></Link>
        </Card>

        <Card title="Mural de avisos" icon={Megaphone}>
          {avisos.length === 0 ? (
            <p className="cell-muted">Nenhum aviso publicado ainda.</p>
          ) : (
            <ul className="ap-lista">
              {avisos.map((n) => (
                <li key={n.id}>
                  <div className="ap-evt"><strong>{n.title}</strong></div>
                  {n.body ? <div className="cell-muted ap-corte">{n.body}</div> : null}
                </li>
              ))}
            </ul>
          )}
          <Link to="/mural" className="ap-vermais">Ver mural completo <ArrowRight size={14} /></Link>
        </Card>
      </div>
    </Layout>
  );
}

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute.jsx';

import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Supporters from './pages/Supporters.jsx';
import Volunteers from './pages/Volunteers.jsx';
import Suspects from './pages/Suspects.jsx';
import Blacklist from './pages/Blacklist.jsx';
import Notices from './pages/Notices.jsx';
import MediaKit from './pages/MediaKit.jsx';
import Engagement from './pages/Engagement.jsx';
import StreetActions from './pages/StreetActions.jsx';
import Agenda from './pages/Agenda.jsx';
import MaterialRequests from './pages/MaterialRequests.jsx';
import Banners from './pages/Banners.jsx';
import Conversations from './pages/Conversations.jsx';
import Demands from './pages/Demands.jsx';
import Broadcasts from './pages/Broadcasts.jsx';
import Automations from './pages/Automations.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';

// Páginas pesadas saem do bundle principal (Leaflet/Google Maps, Recharts,
// landing com CSS próprio) e carregam sob demanda na primeira visita.
const Landing = lazy(() => import('./pages/Landing.jsx'));
// Formulário público de captação — carrega sob demanda (CSS próprio).
const Cadastro = lazy(() => import('./pages/Cadastro.jsx'));
const MapView = lazy(() => import('./pages/MapView.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const TVPanel = lazy(() => import('./pages/TVPanel.jsx'));
// Páginas legais públicas (LGPD / Google Play) — CSS próprio, carregam sob demanda.
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const Terms = lazy(() => import('./pages/Terms.jsx'));
const DataDeletion = lazy(() => import('./pages/DataDeletion.jsx'));
const DataDeletionRequests = lazy(() => import('./pages/DataDeletionRequests.jsx'));

const P = (roles, element) => <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;

// O mesmo build atende todos os domínios; o host decide o que a raiz mostra.
//   app.*                     -> sistema (dashboard)
//   cadastro.*                -> formulário de captação (link curto)
//   marciobinsely.site, www.,
//   lp.*                      -> site público (landing)
//
// O padrão é a landing: qualquer domínio novo apontado para cá mostra o site,
// nunca o sistema interno.
const host = typeof window !== 'undefined' ? window.location.hostname : '';
const isSistema = host.startsWith('app.');
const isCadastroHost = host.startsWith('cadastro.');

/** Página que responde por "/" neste domínio. */
function raiz() {
  if (isCadastroHost) return <Cadastro />;
  if (isSistema) return P(null, <Dashboard />);
  return <Landing />;
}

const lazyFallback = (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
    <div className="spinner" />
  </div>
);

export default function App() {
  return (
    <Suspense fallback={lazyFallback}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/esqueci-senha" element={<ForgotPassword />} />
      <Route path="/redefinir-senha" element={<ResetPassword />} />
      <Route path="/lp" element={<Landing />} />
      <Route path="/cadastro" element={<Cadastro />} />
      {/* Páginas legais públicas (LGPD / requisito Google Play) */}
      <Route path="/privacidade" element={<Privacy />} />
      <Route path="/termos" element={<Terms />} />
      <Route path="/excluir-dados" element={<DataDeletion />} />
      <Route path="/painel-tv" element={P(['LIDER', 'MEMBRO'], <TVPanel />)} />

      <Route path="/" element={raiz()} />
      <Route path="/mapa" element={P(['LIDER', 'MEMBRO'], <MapView />)} />
      <Route path="/relatorios" element={P(['LIDER', 'MEMBRO'], <Reports />)} />

      <Route path="/apoiadores" element={P(['LIDER', 'MEMBRO'], <Supporters />)} />
      <Route path="/voluntarios" element={P(['LIDER', 'MEMBRO'], <Volunteers />)} />
      <Route path="/suspeitos" element={P(['LIDER'], <Suspects />)} />
      <Route path="/blacklist" element={P(['LIDER'], <Blacklist />)} />

      <Route path="/mural" element={P(null, <Notices />)} />
      <Route path="/midia-kit" element={P(null, <MediaKit />)} />
      <Route path="/tarefas" element={P(null, <Engagement />)} />
      <Route path="/acoes" element={P(['LIDER', 'MEMBRO'], <StreetActions />)} />
      <Route path="/agenda" element={P(null, <Agenda />)} />

      <Route path="/materiais" element={P(null, <MaterialRequests />)} />
      <Route path="/faixas" element={P(['LIDER', 'MEMBRO'], <Banners />)} />

      <Route path="/conversas" element={P(['LIDER', 'MEMBRO'], <Conversations />)} />
      <Route path="/demandas" element={P(['LIDER', 'MEMBRO'], <Demands />)} />
      <Route path="/disparos" element={P(['LIDER', 'MEMBRO'], <Broadcasts />)} />
      <Route path="/automacoes" element={P(['LIDER'], <Automations />)} />

      <Route path="/usuarios" element={P(['LIDER'], <Users />)} />
      <Route path="/configuracoes" element={P(['LIDER'], <Settings />)} />
      <Route path="/solicitacoes-exclusao" element={P(['LIDER'], <DataDeletionRequests />)} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

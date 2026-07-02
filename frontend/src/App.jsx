import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './routes/ProtectedRoute.jsx';

import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Landing from './pages/Landing.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Supporters from './pages/Supporters.jsx';
import Volunteers from './pages/Volunteers.jsx';
import Suspects from './pages/Suspects.jsx';
import Blacklist from './pages/Blacklist.jsx';
import MapView from './pages/MapView.jsx';
import Reports from './pages/Reports.jsx';
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
import TVPanel from './pages/TVPanel.jsx';

const P = (roles, element) => <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/esqueci-senha" element={<ForgotPassword />} />
      <Route path="/redefinir-senha" element={<ResetPassword />} />
      <Route path="/lp" element={<Landing />} />
      <Route path="/painel-tv" element={P(['LIDER', 'MEMBRO'], <TVPanel />)} />

      <Route path="/" element={P(null, <Dashboard />)} />
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

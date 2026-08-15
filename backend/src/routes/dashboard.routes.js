import { Router } from 'express';
import * as dash from '../controllers/dashboard.controller.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

// Números gerais + mapa georreferenciado: só equipe (apoiador tem painel próprio).
r.use(authorize('LIDER', 'MEMBRO'));

r.get('/stats', dash.getStats);
r.get('/charts', dash.getCharts);
r.get('/cadastros-por-dia', dash.getDailySignups);
r.get('/rankings', dash.getRankings);
r.get('/map', dash.getMap);
r.get('/map/clusters', dash.getMapClusters);

export default r;

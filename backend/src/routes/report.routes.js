import { Router } from 'express';
import * as report from '../controllers/report.controller.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

// Relatórios (indicações, aniversariantes, crescimento): só equipe.
r.use(authorize('LIDER', 'MEMBRO'));

r.get('/summary', report.summary);
r.get('/growth', report.growth);
r.get('/indicacoes', report.indicacoes);
r.get('/indicacoes/:nome', report.indicadosDe);
r.get('/aniversariantes', report.aniversariantes);

export default r;

import { Router } from 'express';
import * as volunteer from '../controllers/volunteer.controller.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

r.get('/ranking', volunteer.ranking);
r.get('/', volunteer.list);
r.get('/:id', volunteer.get);
r.put('/:id', authorize('LIDER', 'MEMBRO', 'MEMBRO'), volunteer.update);

export default r;

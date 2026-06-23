import { Router } from 'express';
import * as supporter from '../controllers/supporter.controller.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

r.get('/suspects', supporter.listSuspects);
r.get('/', supporter.list);
r.get('/:id', supporter.get);
r.post('/', supporter.create);
r.post('/:id/confirm', supporter.confirmVolunteer);
r.post('/:id/blacklist', authorize('LIDER', 'MEMBRO'), supporter.toBlacklist);
r.put('/:id', supporter.update);
r.delete('/:id', authorize('LIDER', 'MEMBRO'), supporter.remove);

export default r;

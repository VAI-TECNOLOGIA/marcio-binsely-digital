import { Router } from 'express';
import * as volunteer from '../controllers/volunteer.controller.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

r.get('/ranking', authorize('LIDER', 'MEMBRO', 'PARCEIRO'), volunteer.ranking);
r.get('/', authorize('LIDER', 'MEMBRO'), volunteer.list);
r.get('/:id', authorize('LIDER', 'MEMBRO'), volunteer.get);
r.patch('/:id/confirmation', authorize('LIDER', 'MEMBRO'), volunteer.setConfirmation);
r.put('/:id', authorize('LIDER', 'MEMBRO'), volunteer.update);
r.delete('/:id', authorize('LIDER'), volunteer.remove);

export default r;

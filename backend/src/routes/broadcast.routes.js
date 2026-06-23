import { Router } from 'express';
import * as bc from '../controllers/broadcast.controller.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

r.get('/', bc.list);
r.get('/:id', bc.get);
r.post('/', authorize('LIDER', 'MEMBRO', 'MEMBRO', 'MEMBRO'), bc.create);
r.post('/:id/contacts', bc.importContacts);
r.post('/:id/send', bc.send);
r.post('/:id/pause', bc.pause);
r.delete('/:id', bc.remove);

export default r;

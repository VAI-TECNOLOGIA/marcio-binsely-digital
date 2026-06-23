import { Router } from 'express';
import * as engagement from '../controllers/engagement.controller.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

r.get('/', engagement.list);
r.post('/', engagement.create);
r.post('/:id/validate', authorize('LIDER', 'MEMBRO', 'MEMBRO'), engagement.validate);

export default r;

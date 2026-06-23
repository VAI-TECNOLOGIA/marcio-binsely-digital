import { Router } from 'express';
import * as mr from '../controllers/materialRequest.controller.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

r.get('/', mr.list);
r.get('/history/:userId', mr.requesterHistory);
r.post('/', mr.create);
r.patch('/:id/status', authorize('LIDER', 'MEMBRO', 'MEMBRO'), mr.updateStatus);
r.put('/:id', mr.update);
r.delete('/:id', mr.remove);

export default r;

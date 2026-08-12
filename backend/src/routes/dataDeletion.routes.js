import { Router } from 'express';
import { authorize } from '../middlewares/rbac.js';
import {
  listDataDeletionRequests,
  resolveDataDeletionRequest,
} from '../controllers/dataDeletion.controller.js';

// Montado APÓS o authenticate (só o líder trata as solicitações de exclusão).
const r = Router();

r.get('/', authorize('LIDER'), listDataDeletionRequests);
r.patch('/:id', authorize('LIDER'), resolveDataDeletionRequest);

export default r;

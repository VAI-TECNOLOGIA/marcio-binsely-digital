import { Router } from 'express';
import { authorize } from '../middlewares/rbac.js';
import { subscribe, unsubscribe, send } from '../controllers/notification.controller.js';

// Montado APÓS o authenticate. Qualquer usuário logado registra o próprio token;
// só o líder dispara notificações.
const r = Router();

r.post('/subscribe', subscribe);
r.delete('/subscribe', unsubscribe);
r.post('/send', authorize('LIDER'), send);

export default r;

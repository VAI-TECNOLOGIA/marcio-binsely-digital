import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

r.post('/login', auth.login);
r.post('/signup', auth.signup); // auto-cadastro público (apoiador)
r.post('/forgot-password', auth.forgotPassword);
r.post('/reset-password', auth.resetPassword);

r.get('/me', authenticate, auth.me);
r.delete('/me', authenticate, auth.deleteAccount); // excluir a própria conta (Apple 5.1.1(v))
r.post('/change-password', authenticate, auth.changePassword);
r.post('/register', authenticate, authorize('LIDER'), auth.register);

export default r;

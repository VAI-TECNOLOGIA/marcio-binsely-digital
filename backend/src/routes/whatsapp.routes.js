import { Router } from 'express';
import * as wa from '../controllers/whatsapp.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

// Públicos — chamados pela Meta Cloud API (sem nosso JWT).
r.get('/webhook', wa.verifyWebhook);
r.post('/webhook', wa.receiveWebhook);

// Protegido — simula uma mensagem recebida para testar o fluxo de confirmação.
r.post('/simulate', authenticate, wa.simulateInbound);
// Templates aprovados (para o seletor do módulo de Disparos).
r.get('/templates', authenticate, wa.listTemplates);
// Criador de modelos — envia template para análise da Meta (só líder).
r.post('/templates', authenticate, authorize('LIDER'), wa.createTemplate);

export default r;

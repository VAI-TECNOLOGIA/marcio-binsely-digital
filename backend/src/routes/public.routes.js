import { Router } from 'express';
import * as pub from '../controllers/public.controller.js';
import { rateLimit } from '../middlewares/rateLimit.js';

const r = Router();

r.get('/stats', pub.stats);
r.get('/campaign', pub.campaign);
// Cadastro público: 5 envios/min por IP (por instância) — corta rajada de bot.
r.post('/join', rateLimit({ windowMs: 60_000, max: 5 }), pub.join);
// Formulário do site WordPress (Fluent Forms). Limite maior porque o webhook
// chega todo do MESMO IP (o servidor do WordPress), não do IP de cada visitante.
r.post('/site', rateLimit({ windowMs: 60_000, max: 40 }), pub.siteJoin);

export default r;

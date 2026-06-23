import { Router } from 'express';
import * as pub from '../controllers/public.controller.js';

const r = Router();

r.get('/stats', pub.stats);
r.get('/campaign', pub.campaign);
r.post('/join', pub.join);

export default r;

import { Router } from 'express';
import * as conv from '../controllers/conversation.controller.js';

const r = Router();

r.get('/', conv.list);
r.get('/:id', conv.get);
r.post('/:id/reply', conv.reply);
r.post('/:id/assign', conv.assignMe);
r.put('/:id', conv.update);

export default r;

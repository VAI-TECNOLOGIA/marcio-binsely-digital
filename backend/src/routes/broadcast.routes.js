import { Router } from 'express';
import * as bc from '../controllers/broadcast.controller.js';
import { authorize } from '../middlewares/rbac.js';

const r = Router();

// Consulta (equipe interna).
r.get('/', authorize('LIDER', 'MEMBRO'), bc.list);
r.get('/creditos/status', authorize('LIDER', 'MEMBRO'), bc.creditosStatus);
r.get('/pool/status', authorize('LIDER', 'MEMBRO'), bc.poolStatus);
r.patch('/pool/:numeroId', authorize('LIDER'), bc.poolUpdate);
r.get('/declaracao/texto', authorize('LIDER', 'MEMBRO'), bc.declaracaoTexto);
r.get('/audiencia/opcoes', authorize('LIDER', 'MEMBRO'), bc.audienciaOpcoes);
r.post('/audiencia/preview', authorize('LIDER', 'MEMBRO'), bc.audienciaPreview);
r.get('/:id', authorize('LIDER', 'MEMBRO'), bc.get);
r.get('/:id/contacts', authorize('LIDER', 'MEMBRO'), bc.contacts);
r.post('/:id/audiencia/preview', authorize('LIDER', 'MEMBRO'), bc.audienciaPreview);

// Montagem da campanha.
r.post('/', authorize('LIDER', 'MEMBRO'), bc.create);
r.patch('/:id', authorize('LIDER', 'MEMBRO'), bc.update);
r.post('/:id/audiencia', authorize('LIDER', 'MEMBRO'), bc.aplicarAudiencia);
r.post('/:id/contacts', authorize('LIDER', 'MEMBRO'), bc.importContacts);
r.post('/:id/duplicar', authorize('LIDER', 'MEMBRO'), bc.duplicate);

// Ações sensíveis — somente LIDER: declaração, créditos, envio e exclusão.
r.post('/:id/declaracao', authorize('LIDER'), bc.aceitarDeclaracao);
r.post('/creditos/ativar', authorize('LIDER'), bc.creditosAtivar);
r.post('/:id/send', authorize('LIDER'), bc.send);
r.post('/:id/teste', authorize('LIDER'), bc.teste);
r.post('/:id/pause', authorize('LIDER', 'MEMBRO'), bc.pause);
r.post('/:id/resume', authorize('LIDER'), bc.resume);
r.delete('/:id', authorize('LIDER'), bc.remove);

export default r;

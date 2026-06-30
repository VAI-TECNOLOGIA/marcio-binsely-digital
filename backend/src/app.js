import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import env from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middlewares/error.js';
import { PrismaClient } from './generated/prisma/index.js';

const app = express();

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv === 'development') app.use(morgan('dev'));

// Arquivos enviados (driver de upload local)
app.use(`/${env.uploadDir}`, express.static(path.resolve(process.cwd(), env.uploadDir)));

app.get('/health', (req, res) =>
  res.json({ status: 'ok', name: 'Márcio Binsely Digital API', ts: new Date().toISOString() })
);

// ⚠️ ROTA ONE-SHOT — REMOVER APOS PRIMEIRO USO EM PRODUCAO
app.post('/api/_init-admin', async (req, res) => {
  try {
    if (req.body?.secret !== process.env.INIT_SECRET) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const email = req.body?.email || 'admin@marciobinsely.com';
    const password = req.body?.password || 'Admin@123';
    const prisma = new PrismaClient();
    const hash = bcrypt.hashSync(password, 10);
    const user = await prisma.user.upsert({
      where: { email },
      update: { password: hash, active: true, role: 'LIDER' },
      create: {
        name: 'Administrador',
        email,
        password: hash,
        role: 'LIDER',
        phone: '5551999999999',
        active: true,
      },
    });
    await prisma.$disconnect();
    res.json({ ok: true, email: user.email, id: user.id, action: 'admin upserted' });
  } catch (e) {
    console.error('init-admin error', e);
    res.status(500).json({ error: e.message });
  }
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;

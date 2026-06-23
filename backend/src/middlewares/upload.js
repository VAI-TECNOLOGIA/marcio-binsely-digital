import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import env from '../config/env.js';

let uploadRoot = path.resolve(process.cwd(), env.uploadDir);
try {
  if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });
} catch {
  // Filesystem somente-leitura (serverless/Vercel) — usa /tmp (efêmero).
  uploadRoot = path.join('/tmp', 'uploads');
  try { fs.mkdirSync(uploadRoot, { recursive: true }); } catch {}
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, name);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

/** Monta a URL pública de um arquivo enviado (driver local). */
export function fileUrl(filename) {
  return `${env.publicUrl}/${env.uploadDir}/${filename}`;
}

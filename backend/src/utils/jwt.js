import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function signResetToken(payload) {
  return jwt.sign({ ...payload, type: 'reset' }, env.jwtSecret, {
    expiresIn: env.jwtResetExpiresIn,
  });
}

// Token do primeiro acesso (link para a pessoa criar a própria senha). Validade
// mais folgada que o reset — quem acabou de ser aprovado pode demorar a abrir.
export function signSetupToken(payload) {
  return jwt.sign({ ...payload, type: 'reset' }, env.jwtSecret, { expiresIn: '3d' });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

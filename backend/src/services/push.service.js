/**
 * Push service — Firebase Cloud Messaging (app mobile Capacitor: Android + iOS).
 *
 * Inicialização preguiçosa do firebase-admin a partir de uma service account.
 * Fontes da credencial (primeira que existir):
 *   1. FIREBASE_SERVICE_ACCOUNT_PATH  → caminho para o JSON da service account
 *   2. GOOGLE_APPLICATION_CREDENTIALS → idem (convenção do Google)
 *   3. FIREBASE_SERVICE_ACCOUNT       → o JSON inteiro em uma env var
 *
 * Enquanto a credencial NÃO estiver configurada, `isPushConfigured()` retorna
 * false e `sendPush()` vira no-op (sem quebrar): o registro de tokens continua
 * funcionando; só o ENVIO fica inativo até dropar a chave no servidor.
 */
import fs from 'node:fs';

let admin = null; // módulo firebase-admin (import dinâmico)
let app = null; // app inicializado
let initTried = false;
let initError = null;

function loadServiceAccount() {
  const path =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && fs.existsSync(path)) {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  return null;
}

async function ensureInit() {
  if (app) return app;
  if (initTried) return null; // já falhou uma vez — não repete a cada request
  initTried = true;
  try {
    const sa = loadServiceAccount();
    if (!sa) {
      initError = 'service account não configurada (FIREBASE_SERVICE_ACCOUNT_PATH ausente)';
      return null;
    }
    const mod = await import('firebase-admin');
    admin = mod.default || mod;
    app = admin.apps?.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(sa) });
    return app;
  } catch (err) {
    initError = err?.message || String(err);
    return null;
  }
}

export function getPushStatus() {
  return { configured: Boolean(app), initTried, error: initError };
}

export async function isPushConfigured() {
  return Boolean(await ensureInit());
}

/**
 * Envia uma notificação para uma lista de tokens FCM.
 * Retorna { sent, failed, invalidTokens[] } — tokens inválidos devem ser
 * removidos pelo chamador. No-op seguro se o push não estiver configurado.
 */
export async function sendPush(tokens, { title, body, data = {}, url } = {}) {
  const list = [...new Set((tokens || []).filter(Boolean))];
  if (!list.length) return { sent: 0, failed: 0, invalidTokens: [], skipped: 'sem tokens' };

  const ready = await ensureInit();
  if (!ready) {
    return { sent: 0, failed: 0, invalidTokens: [], skipped: initError || 'push não configurado' };
  }

  // data precisa ser string→string no FCM.
  const strData = {};
  for (const [k, v] of Object.entries({ ...data, ...(url ? { url } : {}) })) {
    strData[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }

  const message = {
    tokens: list,
    notification: { title, body },
    data: strData,
    android: { priority: 'high', notification: { channelId: 'default' } },
    apns: { payload: { aps: { sound: 'default' } } },
  };

  const res = await admin.messaging().sendEachForMulticast(message);
  const invalidTokens = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-argument') ||
        code.includes('invalid-registration-token')
      ) {
        invalidTokens.push(list[i]);
      }
    }
  });

  return { sent: res.successCount, failed: res.failureCount, invalidTokens };
}

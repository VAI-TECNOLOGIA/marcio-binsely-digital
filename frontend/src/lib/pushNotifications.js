/**
 * Push Notifications (Capacitor + Firebase Cloud Messaging) — Márcio Bins Ely.
 *
 * Só roda em plataforma nativa (Android/iOS via Capacitor). Na web é no-op.
 *
 * Fluxo:
 *  1. Pede permissão de notificação.
 *  2. Anexa listeners ANTES de register() (evento 'registration' pode emitir
 *     antes do listener se a ordem for invertida — token perdido).
 *  3. Ao receber o token FCM, faz POST /notifications/subscribe { token, platform }
 *     com o JWT atual (lido fresh do localStorage, não capturado em closure).
 *
 * IMPORTANTE (backend): o endpoint POST /notifications/subscribe ainda NÃO existe
 * no backend deste projeto (não há modelo PushToken nem firebase-admin). Enquanto
 * não existir, o token é registrado em log (state.registeredToken) e o POST retorna
 * 404 — o app não quebra. Ver seções 7/7B do MOBILE_README para implementar o
 * backend. O token é exposto via getPushState() para diagnóstico.
 */

const state = {
  supported: false,
  setupStarted: false,
  setupCompleted: false,
  permission: 'unknown',
  registeredToken: null,
  lastSubscribeStatus: null,
  lastError: null,
};

export function getPushState() {
  return { ...state };
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getJwt() {
  try {
    return localStorage.getItem('mbd_token');
  } catch {
    return null;
  }
}

async function isNative() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function subscribe(token, platform) {
  state.registeredToken = token;
  const jwt = getJwt();
  if (!jwt) {
    state.lastError = 'sem JWT no momento do registro do token';
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/notifications/subscribe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, platform }),
    });
    state.lastSubscribeStatus = res.status;
    if (!res.ok) {
      state.lastError = `subscribe HTTP ${res.status} (endpoint de backend provavelmente ainda não implementado)`;
    } else {
      state.lastError = null;
    }
  } catch (err) {
    state.lastError = `subscribe network: ${err?.message || err}`;
  }
}

/** Idempotente. Chamar após login e no boot (se já autenticado). */
export async function setupPushNotifications() {
  if (state.setupStarted) return;
  if (!(await isNative())) return;
  state.setupStarted = true;
  state.supported = true;

  try {
    const { Capacitor } = await import('@capacitor/core');
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.requestPermissions();
    state.permission = perm.receive;
    if (perm.receive !== 'granted') {
      state.lastError = `permissão: ${perm.receive}`;
      return;
    }

    // Ordem correta: listeners ANTES de register().
    await PushNotifications.addListener('registration', async (token) => {
      let actualToken = token.value;

      // iOS: o @capacitor/push-notifications emite o APNs token (hex, 64 chars),
      // mas o backend (Firebase Admin SDK) só aceita FCM token. O AppDelegate salva
      // o FCM token em UserDefaults (chave CapacitorStorage.fcmToken) alguns ms depois
      // do registration. Poll via Preferences por até ~5s e usa o FCM token.
      if (Capacitor.getPlatform() === 'ios') {
        try {
          const { Preferences } = await import('@capacitor/preferences');
          for (let attempt = 0; attempt < 10; attempt++) {
            const { value: fcm } = await Preferences.get({ key: 'fcmToken' });
            if (fcm && fcm.length > 80) {
              actualToken = fcm;
              break;
            }
            await new Promise((r) => setTimeout(r, 500));
          }
        } catch (err) {
          state.lastError = `ios fcm poll: ${err?.message || err}`;
        }
      }

      await subscribe(actualToken, Capacitor.getPlatform());
    });
    await PushNotifications.addListener('registrationError', (err) => {
      state.lastError = `registrationError: ${JSON.stringify(err)}`;
    });
    await PushNotifications.addListener('pushNotificationReceived', () => {
      // foreground — Capacitor mostra automaticamente (presentationOptions).
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action?.notification?.data?.url;
      if (url && typeof url === 'string') {
        window.location.href = url;
      }
    });

    await PushNotifications.register();
    state.setupCompleted = true;
  } catch (err) {
    state.lastError = `setup: ${err?.message || err}`;
  }
}

/** Configura StatusBar nativa com a cor de marca (best-effort). */
export async function setupNativeChrome() {
  if (!(await isNative())) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setBackgroundColor({ color: '#003E9D' });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // plugin ausente na web — ignora
  }
}

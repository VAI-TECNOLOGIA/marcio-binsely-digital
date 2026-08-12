import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Márcio Bins Ely — Capacitor config (MODO SERVIDOR).
 *
 * O app NÃO empacota o dist estático. Ele carrega diretamente a URL de
 * produção (server.url), reaproveitando auth, updates automáticos e evitando
 * rebuild por mudança de conteúdo. O `webDir: 'dist'` existe apenas como
 * fallback exigido pelo CLI (não é servido em runtime enquanto server.url
 * estiver setado).
 *
 * iOS será adicionado depois por outro agente reaproveitando este mesmo setup:
 * basta `npx cap add ios` e plugar o GoogleService-Info.plist.
 */
const config: CapacitorConfig = {
  appId: 'site.marciobinsely.app',
  appName: 'Márcio Bins Ely',
  webDir: 'dist',
  server: {
    // Carrega o app web de produção diretamente.
    url: 'https://app.marciobinsely.site',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#003E9D',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#003E9D',
      style: 'DARK', // 'DARK' = ícones claros sobre fundo azul escuro
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

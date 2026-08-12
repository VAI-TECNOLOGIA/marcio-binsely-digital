import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Dispara o registro de push (Capacitor/FCM) de forma best-effort.
// No-op na web; só age em plataforma nativa (Android/iOS).
function triggerPushSetup() {
  import('../lib/pushNotifications.js')
    .then((m) => {
      m.setupNativeChrome();
      return m.setupPushNotifications();
    })
    .catch(() => {});
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('mbd_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((r) => {
        setUser(r.data);
        // Usuário já logado que reabre o app: registra push no boot.
        triggerPushSetup();
      })
      .catch(() => localStorage.removeItem('mbd_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('mbd_token', data.token);
    setUser(data.user);
    // Registra push logo após login bem-sucedido (nativo).
    triggerPushSetup();
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('mbd_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

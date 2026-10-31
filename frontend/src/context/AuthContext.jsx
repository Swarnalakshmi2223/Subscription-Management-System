import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => !!localStorage.getItem('token'));

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => {
    const finish = (data) => {
      localStorage.setItem('token', data.token);
      setUser(data.user);
      return data.user;
    };
    return {
      user,
      loading,
      updateUser: (nextUser) => setUser(nextUser),
      login: async (email, password) => finish((await api.post('/auth/login', { email, password })).data),
      register: async (payload) => finish((await api.post('/auth/register', payload)).data),
      logout: () => {
        localStorage.removeItem('token');
        setUser(null);
      },
    };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

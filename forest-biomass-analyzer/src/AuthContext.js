import React, { createContext, useContext, useState, useEffect } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/auth/me')
      .then((data) => {
        setUser(data.user || data);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function login(email, password) {
    const data = await api.post('/api/auth/login', { email, password });
    const loggedInUser = data.user || data;
    setUser(loggedInUser);
    return loggedInUser;
  }

  async function register(email, password, name) {
    const data = await api.post('/api/auth/register', { email, password, name });
    const newUser = data.user || data;
    setUser(newUser);
    return newUser;
  }

  async function logout() {
    await api.post('/api/auth/logout', {});
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

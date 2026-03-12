import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import api from './api';

let cachedConfig = null;

async function fetchConfig() {
  if (cachedConfig) return cachedConfig;
  cachedConfig = await api.get('/api/stripe/config');
  return cachedConfig;
}

export function useCheckout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const startCheckout = useCallback(async (planName) => {
    if (!user) {
      navigate('/login?plan=' + planName);
      return;
    }

    setLoading(true);
    try {
      const config = await fetchConfig();
      const priceId = planName === 'business' ? config.businessPriceId : config.proPriceId;
      const data = await api.post('/api/stripe/create-checkout-session', { priceId });
      window.location.href = data.url;
    } catch (err) {
      alert('Failed to start checkout: ' + err.message);
      setLoading(false);
    }
  }, [user, navigate]);

  return { startCheckout, loading };
}

// Standalone function for use outside of React components (e.g., after login)
export async function redirectToCheckout(planName) {
  const config = await fetchConfig();
  const priceId = planName === 'business' ? config.businessPriceId : config.proPriceId;
  const data = await api.post('/api/stripe/create-checkout-session', { priceId });
  window.location.href = data.url;
}

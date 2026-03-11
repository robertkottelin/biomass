import React, { useState } from 'react';
import { useAuth } from './AuthContext';

const styles = {
  banner: {
    background: 'linear-gradient(90deg, #1a472a 0%, #2d6a4f 60%, #40916c 100%)',
    color: '#fff',
    padding: '10px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    position: 'relative',
    zIndex: 1000,
  },
  text: {
    margin: 0,
  },
  upgradeButton: {
    background: '#fff',
    color: '#1a472a',
    border: 'none',
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
  },
};

export default function UpgradeBanner({ plan }) {
  const [dismissed, setDismissed] = useState(false);
  const { user } = useAuth();

  if (dismissed) return null;
  if (plan && plan !== 'free') return null;

  const href = user ? '/#pricing' : '/login';

  return (
    <div style={styles.banner}>
      <span style={styles.text}>
        You're using the free demo with sample data. Upgrade to Pro for real satellite analysis.
      </span>
      <a href={href} style={styles.upgradeButton}>
        Upgrade
      </a>
      <button
        style={styles.closeButton}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        type="button"
      >
        ×
      </button>
    </div>
  );
}

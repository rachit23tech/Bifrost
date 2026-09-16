import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const googleButtonRef = useRef(null);

  const handleGoogleCredential = async (response) => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Google sign-in failed');
      }

      localStorage.setItem('bifrost_token', data.token);
      onAuthSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !GOOGLE_CLIENT_ID || !window.google || !googleButtonRef.current) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential
    });

    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'filled_black',
      size: 'large',
      shape: 'rectangular',
      width: 320
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      localStorage.setItem('bifrost_token', data.token);
      onAuthSuccess(data.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="panel auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{isLogin ? 'Sign In' : 'Create Account'}</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        {GOOGLE_CLIENT_ID && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '0.75rem 0 1rem' }}>
            <div ref={googleButtonRef} />
          </div>
        )}

        {GOOGLE_CLIENT_ID && (
          <div className="auth-divider">
            <span>or</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <div>
              <label className="form-label">Email</label>
              <input type="email" className="field-input" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input type="password" className="field-input" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <div className="error-banner">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading} style={{ justifyContent: 'center', padding: '12px', marginTop: '0.5rem' }}>
              {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </div>
        </form>
        <div className="auth-toggle">
          {isLogin ? "Don't have an account? " : 'Already registered? '}
          <button onClick={() => { setIsLogin(!isLogin); setError(''); }}>{isLogin ? 'Sign Up' : 'Log In'}</button>
        </div>
      </div>
    </div>
  );
}

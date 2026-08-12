import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import logo from '../assets/logo.svg';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function AuthPage({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim() || (!isLogin && !username.trim())) {
      setError('Please fill in all required fields.');
      return;
    }

    setIsLoading(true);
    const endpoint = isLogin ? `${API_URL}/auth/login` : `${API_URL}/auth/register`;
    const payload = isLogin ? { email, password } : { username, email, password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        onAuthSuccess(data.token, data.user);
      } else {
        setError(data.error || 'Authentication failed. Please try again.');
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError('Network error. Is the server running?');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });

      const data = await response.json();

      if (response.ok) {
        onAuthSuccess(data.token, data.user);
      } else {
        setError(data.error || 'Google Sign-In failed.');
      }
    } catch (err) {
      console.error('Google Auth Error:', err);
      setError('Failed to connect to Google authentication server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-card">
        {/* Header / Logo */}
        <div className="auth-header">
          <img src={logo} alt="Stash Vault" className="auth-logo" />
          <h1 className="auth-title">Stash</h1>
          <p className="auth-subtitle">
            {isLogin ? 'Welcome back! Sign in to access your cloud vault.' : 'Create an account to stash and manage your files securely.'}
          </p>
        </div>

        {/* Google OAuth Section */}
        <div className="google-auth-wrapper" style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Google Sign-In was cancelled or failed.')}
            shape="pill"
            theme="filled_black"
            text="continue_with"
            width="340"
          />

          <div style={{ display: 'flex', alignItems: 'center', width: '100%', margin: '18px 0 6px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
            <span style={{ padding: '0 12px', fontWeight: 500, letterSpacing: '0.5px' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tabs">
          <button 
            type="button" 
            className={`auth-tab ${isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(true); setError(''); }}
          >
            Sign In
          </button>
          <button 
            type="button" 
            className={`auth-tab ${!isLogin ? 'active' : ''}`}
            onClick={() => { setIsLogin(false); setError(''); }}
          >
            Create Account
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="auth-error-banner">
            ⚠️ {error}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="auth-field">
              <label>Username</label>
              <input 
                type="text" 
                placeholder="e.g. Alex" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="modal-text-input"
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label>Email Address</label>
            <input 
              type="email" 
              placeholder="e.g. alex@example.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="modal-text-input"
              required
            />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="modal-text-input"
              required
            />
          </div>

          <button 
            type="submit" 
            className="auth-submit-btn" 
            disabled={isLoading}
            title={isLogin ? "Sign In to Vault" : "Register Account"}
          >
            {isLoading ? (isLogin ? 'Signing In...' : 'Creating Account...') : (isLogin ? 'Sign In to Vault' : 'Create Account')}
          </button>
        </form>
      </div>
    </div>
  );
}

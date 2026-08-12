import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import logo from '../assets/logo.svg';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function AuthPage({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // OTP Verification state
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Theme toggle state (Sun ☀️ / Moon 🌙 icons)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('stash-settings');
    const parsed = saved ? JSON.parse(saved) : {};
    const initialTheme = parsed.theme || 'dark';
    document.documentElement.setAttribute('data-theme', initialTheme);
    return initialTheme;
  });

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    const saved = localStorage.getItem('stash-settings');
    const parsed = saved ? JSON.parse(saved) : {};
    localStorage.setItem('stash-settings', JSON.stringify({ ...parsed, theme: newTheme }));
  };

  // Handle Form Submission (Sign In or Send OTP)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim() || !password.trim() || (!isLogin && !username.trim())) {
      setError('Please fill in all required fields.');
      return;
    }

    setIsLoading(true);

    if (isLogin) {
      // Standard Login Flow
      try {
        const response = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();
        if (response.ok) {
          onAuthSuccess(data.token, data.user);
        } else {
          setError(data.error || 'Authentication failed. Please try again.');
        }
      } catch (err) {
        console.error('Login error:', err);
        setError('Network error. Is the backend server running?');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Signup Flow Step 1: Generate & Send OTP Code
      try {
        const response = await fetch(`${API_URL}/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        const data = await response.json();
        if (response.ok) {
          setIsOtpSent(true);
          setSuccessMsg(`Verification code sent to ${email}. Please check your inbox.`);
        } else {
          setError(data.error || 'Failed to send OTP code.');
        }
      } catch (err) {
        console.error('Send OTP error:', err);
        setError('Network error. Failed to dispatch OTP email.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Signup Flow Step 2: Verify 6-digit OTP Code
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setError('Please enter the 6-digit OTP code sent to your email.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          otp: otpCode.trim(),
          username,
          password
        }),
      });

      const data = await response.json();
      if (response.ok) {
        onAuthSuccess(data.token, data.user);
      } else {
        setError(data.error || 'Invalid or expired OTP code.');
      }
    } catch (err) {
      console.error('Verify OTP error:', err);
      setError('Network error. Failed to verify OTP.');
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
        {/* Top Right Corner Theme Toggle Button (Sun ☀️ / Moon 🌙 Icons) */}
        <button 
          type="button"
          className="auth-theme-toggle-btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        {/* Header / Logo */}
        <div className="auth-header">
          <img src={logo} alt="Stash Vault" className="auth-logo" />
          <h1 className="auth-title">Stash</h1>
          <p className="auth-subtitle">
            {isOtpSent 
              ? `Enter the 6-digit security code sent to ${email}`
              : isLogin 
                ? 'Welcome back! Sign in to access your cloud vault.' 
                : 'Create an account to stash and manage your files securely.'}
          </p>
        </div>

        {/* Google OAuth Option (Shown on main auth screen) */}
        {!isOtpSent && (
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
        )}

        {/* Tab Switcher (Shown when not verifying OTP) */}
        {!isOtpSent && (
          <div className="auth-tabs">
            <button 
              type="button" 
              className={`auth-tab ${isLogin ? 'active' : ''}`}
              onClick={() => { setIsLogin(true); setError(''); setSuccessMsg(''); setIsOtpSent(false); }}
            >
              Sign In
            </button>
            <button 
              type="button" 
              className={`auth-tab ${!isLogin ? 'active' : ''}`}
              onClick={() => { setIsLogin(false); setError(''); setSuccessMsg(''); setIsOtpSent(false); }}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="auth-error-banner">
            ⚠️ {error}
          </div>
        )}

        {/* Success Banner */}
        {successMsg && (
          <div className="auth-success-banner" style={{ background: 'rgba(25, 167, 255, 0.12)', border: '1px solid var(--accent-cyan)', color: 'var(--accent-cyan)', padding: '10px 14px', borderRadius: '10px', fontSize: '0.85rem', marginBottom: '16px' }}>
            ✉️ {successMsg}
          </div>
        )}

        {/* OTP Input Form (Step 2 of Signup) */}
        {isOtpSent ? (
          <form onSubmit={handleVerifyOtp} className="auth-form">
            <div className="auth-field">
              <label style={{ textAlign: 'center', fontSize: '0.9rem' }}>6-Digit Verification Code</label>
              <input 
                type="text" 
                placeholder="123456" 
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="modal-text-input"
                maxLength={6}
                style={{ textAlign: 'center', fontSize: '1.4rem', letterSpacing: '8px', fontWeight: 'bold' }}
                autoFocus
                required
              />
            </div>

            <button 
              type="submit" 
              className="auth-submit-btn" 
              disabled={isLoading}
              title="Verify Code & Finish Account Creation"
            >
              {isLoading ? 'Verifying Code...' : 'Verify Code & Create Account'}
            </button>

            <button 
              type="button" 
              className="cancel-btn" 
              onClick={() => { setIsOtpSent(false); setOtpCode(''); setError(''); }}
              style={{ marginTop: '10px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
            >
              ← Back to Registration
            </button>
          </form>
        ) : (
          /* Credentials Form (Step 1) */
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
              title={isLogin ? "Sign In to Vault" : "Send Email Verification OTP"}
            >
              {isLoading ? (isLogin ? 'Signing In...' : 'Sending Code...') : (isLogin ? 'Sign In to Vault' : 'Get Verification Code')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

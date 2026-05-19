import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, Input, Card, Spinner } from '../components/ui';
import { Wallet, Mail, Lock, User, Eye, EyeOff, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register, googleAuth, continueAsGuest, user, loading } = useAuth();
  
  const [mode, setMode] = useState('main'); // 'main', 'login', 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      navigate('/');
    }
  }, [user, loading, navigate]);

  // Initialize Google Identity Services
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        // response.credential is the signed Google ID token
        try {
          setIsSubmitting(true);
          setError('');
          await googleAuth(response.credential);
          navigate('/');
        } catch {
          setError('Google sign-in failed. Please try again.');
        } finally {
          setIsSubmitting(false);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
  }, []);

  const handleGoogleSignIn = () => {
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      setError('Google sign-in is not configured.');
      return;
    }
    if (window.google) {
      window.google.accounts.id.prompt();
    } else {
      setError('Google Sign-In failed to load. Please refresh the page.');
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim() || !password) {
      setError('Please enter email and password');
      return;
    }

    try {
      setIsSubmitting(true);
      await login(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailRegister = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError('Please fill all fields (password min 6 characters)');
      return;
    }

    try {
      setIsSubmitting(true);
      await register(email.trim(), password, name.trim());
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuestMode = () => {
    continueAsGuest();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-primary to-brand-hover p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Wallet className="w-8 h-8 text-white" />
            </div>
            <span className="text-2xl font-bold font-heading text-white">
              SAVIQ
            </span>
          </div>
        </div>
        
        <div className="space-y-6">
          <h1 className="text-4xl font-bold font-heading text-white leading-tight">
            Smart spending,<br />clearer decisions.
          </h1>
          <p className="text-lg text-white/80">
            Manage expenses, income, and transfers all in one place with beautiful analytics and AI-powered insights.
          </p>
          
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { title: 'Smart Tracking', desc: 'Expenses, income & transfers' },
              { title: 'AI Receipt Scan', desc: 'Scan receipts with AI' },
              { title: 'Analytics', desc: 'Beautiful charts & insights' },
              { title: 'Multi-Profile', desc: 'Personal & business' },
            ].map((feature) => (
              <div key={feature.title} className="p-4 bg-white/10 rounded-xl backdrop-blur-sm">
                <h3 className="font-semibold text-white">{feature.title}</h3>
                <p className="text-sm text-white/70">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-white/60">
          Share data seamlessly with the mobile app
        </p>
      </div>

      {/* Right side - Auth forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="p-3 bg-brand-primary/10 rounded-xl">
              <Wallet className="w-8 h-8 text-brand-primary" />
            </div>
            <span className="text-2xl font-bold font-heading text-text-primary">
              SAVIQ
            </span>
          </div>

          {mode === 'main' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center lg:text-left">
                <h2 className="text-3xl font-bold font-heading text-text-primary">
                  Welcome
                </h2>
                <p className="mt-2 text-text-secondary">
                  Sign in to access your SAVIQ data
                </p>
              </div>

              {error && (
                <div className="p-4 bg-expense-bg text-expense rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-3">
                <Button
                  onClick={() => setMode('login')}
                  className="w-full"
                  size="lg"
                  data-testid="email-signin-button"
                >
                  <Mail className="w-5 h-5 mr-2" />
                  Sign in with Email
                </Button>

                <Button
                  onClick={() => setMode('register')}
                  variant="secondary"
                  className="w-full"
                  size="lg"
                  data-testid="create-account-button"
                >
                  <User className="w-5 h-5 mr-2" />
                  Create Account
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border-color" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-page text-text-secondary">or</span>
                </div>
              </div>

              <div className="flex justify-center gap-4">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={isSubmitting}
                  className="flex items-center justify-center w-14 h-14 bg-white border border-border-color rounded-xl hover:shadow-md transition-all duration-200"
                  data-testid="google-signin-button"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </button>
              </div>

              <button
                onClick={handleGuestMode}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 text-text-secondary hover:text-text-primary transition-colors"
                data-testid="guest-mode-button"
              >
                Continue as Guest
              </button>
              <p className="text-xs text-center text-text-secondary/70">
                Guest data is stored locally in your browser
              </p>
            </div>
          )}

          {mode === 'login' && (
            <div className="space-y-6 animate-fade-in">
              <button
                onClick={() => { setMode('main'); setError(''); }}
                className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>

              <div>
                <h2 className="text-3xl font-bold font-heading text-text-primary">
                  Welcome Back
                </h2>
                <p className="mt-2 text-text-secondary">
                  Sign in to continue
                </p>
              </div>

              {error && (
                <div className="p-4 bg-expense-bg text-expense rounded-xl text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full pl-12 pr-4 py-3 bg-white border border-border-color rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
                    data-testid="email-input"
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full pl-12 pr-12 py-3 bg-white border border-border-color rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
                    data-testid="password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                  size="lg"
                  data-testid="login-submit-button"
                >
                  {isSubmitting ? <Spinner size="sm" className="text-white" /> : 'Sign In'}
                </Button>
              </form>

              <p className="text-center text-text-secondary">
                Don't have an account?{' '}
                <button
                  onClick={() => { setMode('register'); setError(''); }}
                  className="text-brand-primary font-semibold hover:underline"
                >
                  Create one
                </button>
              </p>
            </div>
          )}

          {mode === 'register' && (
            <div className="space-y-6 animate-fade-in">
              <button
                onClick={() => { setMode('main'); setError(''); }}
                className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back
              </button>

              <div>
                <h2 className="text-3xl font-bold font-heading text-text-primary">
                  Create Account
                </h2>
                <p className="mt-2 text-text-secondary">
                  Start tracking your finances
                </p>
              </div>

              {error && (
                <div className="p-4 bg-expense-bg text-expense rounded-xl text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleEmailRegister} className="space-y-4">
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full pl-12 pr-4 py-3 bg-white border border-border-color rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
                    data-testid="name-input"
                  />
                </div>

                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full pl-12 pr-4 py-3 bg-white border border-border-color rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
                    data-testid="register-email-input"
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 6 characters)"
                    className="w-full pl-12 pr-12 py-3 bg-white border border-border-color rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all"
                    data-testid="register-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  variant="income"
                  className="w-full"
                  size="lg"
                  data-testid="register-submit-button"
                >
                  {isSubmitting ? <Spinner size="sm" className="text-white" /> : 'Create Account'}
                </Button>
              </form>

              <p className="text-center text-text-secondary">
                Already have an account?{' '}
                <button
                  onClick={() => { setMode('login'); setError(''); }}
                  className="text-brand-primary font-semibold hover:underline"
                >
                  Sign in
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

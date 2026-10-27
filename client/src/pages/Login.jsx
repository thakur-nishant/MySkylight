import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Demo credentials are only useful in local development.
const DEMO_EMAIL = import.meta.env.DEV ? 'demo@myskylight.app' : '';
const DEMO_PASSWORD = import.meta.env.DEV ? 'demo123' : '';

export default function Login() {
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [name, setName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [error, setError] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const { user, loading, login, register } = useAuth();
  const navigate = useNavigate();

  // If user is already logged in, redirect immediately
  useEffect(() => {
    if (!loading && user) {
      navigate('/calendar', { replace: true });
    }
  }, [user, loading, navigate]);

  const toggleMode = () => {
    const nextIsRegister = !isRegister;
    setIsRegister(nextIsRegister);
    setError('');
    if (nextIsRegister) {
      setEmail('');
      setPassword('');
    } else {
      setEmail(DEMO_EMAIL);
      setPassword(DEMO_PASSWORD);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (isRegister) {
        await register({ name, email, password, color, household_name: householdName });
      } else {
        await login(email, password);
      }
      // navigate after AuthProvider updates the user
      navigate('/calendar', { replace: true });
    } catch (err) {
      setError(err.message || 'Something went wrong');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display font-bold text-3xl text-sky-600">MySkylight</h1>
          <p className="text-slate-500 mt-2">Calendar & task management for your household</p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl shadow-sky-100/50 border border-slate-200 p-8">
          <h2 className="font-display font-semibold text-xl text-slate-800 mb-6">
            {isRegister ? 'Create household' : 'Sign in'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Household name</label>
                  <input
                    type="text"
                    value={householdName}
                    onChange={(e) => setHouseholdName(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    required
                    placeholder="e.g. The Sharma Family"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    required
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer border border-slate-300"
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="flex-1 px-4 py-2 rounded-lg border border-slate-300"
                    />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                required
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                required
                placeholder="••••••••"
              />
              {!isRegister && import.meta.env.DEV && (
                <p className="text-xs text-slate-500 mt-1">Demo: demo@myskylight.app / demo123</p>
              )}
            </div>
            {error && (
              <div className="text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</div>
            )}
            <button
              type="submit"
              className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg transition-colors"
              disabled={loading} // prevent submitting while auth loading
            >
              {isRegister ? 'Create household' : 'Sign in'}
            </button>
          </form>
          <p className="mt-6 text-center text-slate-600">
            {isRegister ? 'Already have a household?' : 'New to MySkylight?'}{' '}
            <button
              type="button"
              onClick={toggleMode}
              className="text-sky-600 font-medium hover:underline"
            >
              {isRegister ? 'Sign in' : 'Create household'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

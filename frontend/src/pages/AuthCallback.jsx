import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMe } from '../services/api';

const API_BASE = 'http://localhost:8000';

/**
 * AuthCallback — mounted at the virtual route /auth/callback
 *
 * The backend redirects here after Google OAuth with:
 *   ?access_token=<jwt>       on success
 *   ?error=<message>          on failure
 *
 * This component:
 *  1. Reads access_token from the URL
 *  2. Stores it in AuthContext / localStorage
 *  3. Calls GET /auth/me to fetch the user profile
 *  4. Navigates to "/" (the chat UI)
 */
export default function AuthCallback({ onDone }) {
  const { login } = useAuth();
  const [status, setStatus] = useState('Processing your sign-in…');
  const [error,  setError]  = useState(null);

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get('access_token');
      const oauthError  = params.get('error');

      if (oauthError) {
        setError(`Google sign-in failed: ${oauthError}`);
        return;
      }

      if (!accessToken) {
        setError('No access token received. Please try signing in again.');
        return;
      }

      try {
        setStatus('Fetching your profile…');
        // Call /auth/me with the token to get user profile
        const profile = await getMe(accessToken);
        login(accessToken, profile);
        setStatus('Signed in! Redirecting…');
        // Small delay so the user sees success feedback
        setTimeout(() => onDone(), 500);
      } catch (err) {
        setError('Could not fetch your profile. Please try again.');
        console.error('AuthCallback error:', err);
      }
    }

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#040711]">
      <div className="text-center space-y-5">
        {/* Animated logo */}
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-emerald-600 to-cyan-500 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.35)] animate-pulse">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
          </svg>
        </div>

        {error ? (
          <>
            <p className="text-rose-400 font-medium">{error}</p>
            <button
              onClick={() => onDone('login')}
              className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition-colors"
            >
              ← Back to Login
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 animate-spin text-emerald-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-slate-300 text-sm">{status}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

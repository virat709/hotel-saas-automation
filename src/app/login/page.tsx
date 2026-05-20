'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import styles from '../auth.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState<any>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendSuccess, setResendSuccess] = useState('');

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleResendVerification = async () => {
    if (!unverifiedUser || resendCooldown > 0) return;
    setResendLoading(true);
    try {
      const { sendEmailVerification } = await import('firebase/auth');
      await sendEmailVerification(unverifiedUser);
      setResendCooldown(60);
      setResendSuccess('✅ Verification email resent! Check your Spam/Junk folder too.');
    } catch {
      setResendSuccess('Could not resend. Please try again shortly.');
    } finally {
      setResendLoading(false);
    }
  };

  useEffect(() => {
    let unsub = () => {};
    if (auth) {
      unsub = onAuthStateChanged(auth, async (user) => {
        if (user && user.emailVerified) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            // Redirect based on whether hotel setup is done
            router.push(userDoc.data()?.hotelId ? '/dashboard' : '/onboarding');
          }
        }
      });
    }
    return () => unsub();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setError('Please fill all fields.');

    setLoading(true);
    setError('');

    try {
      if (!auth) {
        throw new Error('Firebase configuration is missing. Please ensure your environment variables are correctly set on your deployment platform.');
      }
      const cred = await signInWithEmailAndPassword(auth, email, password);

      if (!cred.user.emailVerified) {
        setUnverifiedUser(cred.user);
        setResendCooldown(60);
        await auth.signOut();
        return setError('EMAIL_NOT_VERIFIED');
      }

      // Check if hotel onboarding is complete
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      const userData = userDoc.data();

      if (userData?.hotelId) {
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('Invalid email or password. Please check and try again.');
      } else if (msg.includes('too-many-requests')) {
        setError('Too many failed attempts. Please wait a few minutes before trying again.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      if (!auth) throw new Error('Firebase configuration is missing.');
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      const userData = userDoc.data();

      if (userData?.hotelId) {
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    } catch (err: any) {
      console.error('Google Login Error:', err);
      setError('Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link href="/" className={styles.logo}>
          <img src="/v4-logo.png" alt="V4Stay Logo" style={{ height: '32px', width: 'auto', objectFit: 'contain', marginRight: '8px' }} />
          V4<span className="gradient-text">Stay</span>
        </Link>
        <h2 className={styles.title}>Welcome Back</h2>
        <p className={styles.sub}>Sign in to your hotel dashboard</p>

        {error && error !== 'EMAIL_NOT_VERIFIED' && (
          <div className="toast toast-error" style={{ position: 'static', marginBottom: '16px' }}>{error}</div>
        )}

        {/* Email not verified warning with resend button */}
        {error === 'EMAIL_NOT_VERIFIED' && (
          <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.4)', borderRadius: 'var(--r)', padding: '16px', marginBottom: '16px' }}>
            <p style={{ color: '#f59e0b', fontWeight: 600, marginBottom: '6px' }}>⚠️ Email Not Verified</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text)', marginBottom: '12px', lineHeight: 1.6 }}>
              Please verify your email before logging in.<br />
              <b>Check your Spam / Junk folder</b>{' '}if you can&apos;t find it.
            </p>
            {resendSuccess && <p style={{ fontSize: '0.8rem', color: '#22c55e', marginBottom: '8px' }}>{resendSuccess}</p>}
            <button
              onClick={handleResendVerification}
              disabled={resendLoading || resendCooldown > 0}
              style={{ fontSize: '0.8rem', padding: '8px 16px', background: 'transparent', border: '1px solid rgba(245,158,11,.5)', color: '#f59e0b', borderRadius: 'var(--r)', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer' }}
            >
              {resendLoading ? 'Sending...' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : '🔄 Resend Verification Email'}
            </button>
          </div>
        )}

        <form onSubmit={handleLogin} className={styles.form}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" placeholder="you@hotel.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Password</label>
              <Link href="/login/forgot-password" style={{ fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none' }}>
                Forgot Password?
              </Link>
            </div>
            <input className="form-input" type="password" placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Sign In →'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--glass-b)' }}></div>
          <div style={{ padding: '0 12px', color: 'var(--muted)', fontSize: '0.85rem' }}>or</div>
          <div style={{ flex: 1, height: '1px', background: 'var(--glass-b)' }}></div>
        </div>

        <button 
          className="btn btn-ghost" 
          style={{ width: '100%', justifyContent: 'center', border: '1px solid var(--glass-b)', marginBottom: '24px' }} 
          onClick={handleGoogleLogin} 
          disabled={loading}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <p className={styles.switchText}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className={styles.switchLink}>Create one</Link>
        </p>
      </div>
    </div>
  );
}

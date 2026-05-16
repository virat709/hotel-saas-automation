'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import styles from '../auth.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    if (auth) {
      unsub = onAuthStateChanged(auth, async (user) => {
        if (user) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data()?.hotelId) {
            router.push('/dashboard');
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
      const cred = await signInWithEmailAndPassword(auth, email, password);

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
        setError('Invalid email or password.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link href="/" className={styles.logo}>
          🏨 Hotel<span className="gradient-text">QR</span>
        </Link>
        <h2 className={styles.title}>Welcome Back</h2>
        <p className={styles.sub}>Sign in to your hotel dashboard</p>

        {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: '16px' }}>{error}</div>}

        <form onSubmit={handleLogin} className={styles.form}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" placeholder="you@hotel.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Sign In →'}
          </button>
        </form>

        <p className={styles.switchText}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className={styles.switchLink}>Create one</Link>
        </p>
      </div>
    </div>
  );
}

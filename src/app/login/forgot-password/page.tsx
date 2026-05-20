'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import styles from '../../auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return setError('Please enter your email address.');

    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (!auth) {
        throw new Error('Firebase configuration is missing.');
      }
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset link sent! Please check your email inbox.');
      setEmail('');
    } catch (err: any) {
      console.error('Reset Error:', err);
      const msg = err.message || 'Failed to send reset link.';
      if (msg.includes('user-not-found')) {
        setError('No account found with this email address.');
      } else if (msg.includes('invalid-email')) {
        setError('Please enter a valid email address.');
      } else {
        setError(`Error: ${msg}`);
      }
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
        <h2 className={styles.title}>Reset Password</h2>
        <p className={styles.sub}>Enter your email to receive a reset link</p>

        {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: '16px' }}>{error}</div>}
        {message && <div className="toast toast-success" style={{ position: 'static', marginBottom: '16px', background: 'var(--success)', color: 'white', padding: '12px', borderRadius: 'var(--r)' }}>{message}</div>}

        <form onSubmit={handleReset} className={styles.form}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              className="form-input" 
              type="email" 
              placeholder="you@hotel.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Send Reset Link →'}
          </button>
        </form>

        <p className={styles.switchText}>
          Remember your password?{' '}
          <Link href="/login" className={styles.switchLink}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

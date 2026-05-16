'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import styles from '../auth.module.css';

function SignupContent() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const inviteHotelId = searchParams.get('hotelId');
  const inviteRole = searchParams.get('role') || 'owner';

  useEffect(() => {
    let unsub = () => {};
    if (auth) {
      unsub = onAuthStateChanged(auth, async (user) => {
        if (user) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists() && userDoc.data().hotelId) {
            router.push('/dashboard');
          } else {
            router.push('/onboarding');
          }
        }
      });
    }
    return () => unsub();
  }, [router]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return setError('Please fill all fields.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');

    setLoading(true);
    setError('');

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });

      // Create a user record in Firestore
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name,
        email,
        createdAt: new Date().toISOString(),
        hotelId: inviteHotelId || null,
        role: inviteRole,
      });

      if (inviteHotelId) {
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    } catch (err: any) {
      console.error('Signup Error:', err);
      const msg = err.message || 'Signup failed.';
      if (msg.includes('email-already-in-use')) setError('This email is already registered.');
      else if (msg.includes('invalid-email')) setError('Invalid email address.');
      else if (msg.includes('operation-not-allowed')) setError('Email/Password auth is not enabled in Firebase console.');
      else setError(`Error: ${msg}`);
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
        <h2 className={styles.title}>Create Your Account</h2>
        <p className={styles.sub}>Start automating your hotel in minutes</p>

        {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: '16px' }}>{error}</div>}

        <form onSubmit={handleSignup} className={styles.form}>
          <div className="form-group">
            <label className="form-label">Your Name</label>
            <input className="form-input" type="text" placeholder="Ramesh Kumar" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" placeholder="you@hotel.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Min. 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Create Account →'}
          </button>
        </form>

        <p className={styles.switchText}>
          Already have an account?{' '}
          <Link href="/login" className={styles.switchLink}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <React.Suspense fallback={<div className={styles.page}><div className="spinner" /></div>}>
      <SignupContent />
    </React.Suspense>
  );
}

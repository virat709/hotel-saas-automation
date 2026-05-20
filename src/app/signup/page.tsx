'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  updateProfile, 
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import styles from '../auth.module.css';

function SignupContent() {
  const router = useRouter();
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  
  // UI State
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pendingUser, setPendingUser] = useState<any>(null);
  
  const searchParams = useSearchParams();
  const inviteHotelId = searchParams.get('hotelId');
  const inviteRole = searchParams.get('role') || 'owner';

  useEffect(() => {
    let unsub = () => {};
    if (auth) {
      unsub = onAuthStateChanged(auth, async (user) => {
        // Redirect if user is logged in and email is verified
        if (user && user.emailVerified) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            if (userDoc.data().hotelId) {
              router.push('/dashboard');
            } else {
              router.push('/onboarding');
            }
          }
        }
      });
    }
    return () => unsub();
  }, [router]);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleResendVerification = async () => {
    if (!pendingUser || resendCooldown > 0) return;
    setResendLoading(true);
    try {
      await sendEmailVerification(pendingUser);
      setResendCooldown(60);
      setMessage('Verification email resent! Also check your Spam / Junk folder.');
    } catch {
      setMessage('Could not resend. Please wait a moment and try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !phone) return setError('Please fill all fields.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');

    setLoading(true);
    setError('');

    try {
      if (!auth) throw new Error('Firebase config missing.');
      
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await sendEmailVerification(cred.user);

      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name,
        email,
        phone,
        createdAt: new Date().toISOString(),
        hotelId: inviteHotelId || null,
        role: inviteRole,
      });

      // Store reference for resend button
      setPendingUser(cred.user);
      setResendCooldown(60);
      setMessage('✅ Account created! A verification link was sent to your email.\n\n📧 Check your Inbox AND Spam/Junk folder — emails sometimes get filtered.\n\nOnce verified, come back and log in.');
    } catch (err: any) {
      console.error('Signup Error:', err);
      const msg = err.message || 'Signup failed.';
      if (msg.includes('email-already-in-use')) setError('This email is already registered. Try logging in instead.');
      else if (msg.includes('invalid-email')) setError('Invalid email address.');
      else setError(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError('');
    try {
      if (!auth) throw new Error('Firebase config missing.');
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      
      const userDocRef = doc(db, 'users', cred.user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // New Google User
        await setDoc(userDocRef, {
          uid: cred.user.uid,
          name: cred.user.displayName || 'Google User',
          email: cred.user.email,
          phone: null, // Phone is optional/skipped now
          createdAt: new Date().toISOString(),
          hotelId: inviteHotelId || null,
          role: inviteRole,
        });
        
        if (inviteHotelId) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding');
        }
      } else {
        // Existing user
        if (userDoc.data().hotelId) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding');
        }
      }
    } catch (err: any) {
      console.error('Google Signup Error:', err);
      setError('Google sign-up failed. Please try again.');
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

        <h2 className={styles.title}>Create Your Account</h2>
        <p className={styles.sub}>Start automating your hotel in minutes</p>

        {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: '16px' }}>{error}</div>}
        {message && (
          <div style={{ background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 'var(--r)', padding: '16px', marginBottom: '16px' }}>
            <p style={{ color: '#22c55e', fontWeight: 600, marginBottom: '8px' }}>✅ Account Created!</p>
            <p style={{ color: 'var(--text)', fontSize: '0.85rem', marginBottom: '12px', lineHeight: 1.6 }}>
              A verification email was sent to <b>{email}</b>.<br />
              📧 <b>Check your Spam / Junk folder</b>{' '}if you don&apos;t see it in your inbox.
            </p>
            <button
              onClick={handleResendVerification}
              disabled={resendLoading || resendCooldown > 0}
              style={{ fontSize: '0.8rem', padding: '8px 16px', background: 'transparent', border: '1px solid rgba(34,197,94,.4)', color: '#22c55e', borderRadius: 'var(--r)', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer' }}
            >
              {resendLoading ? 'Sending...' : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : '🔄 Resend Verification Email'}
            </button>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '12px' }}>
              Already verified? <Link href="/login" style={{ color: 'var(--primary)' }}>Click here to log in →</Link>
            </p>
          </div>
        )}

        <button 
          className="btn btn-ghost" 
          style={{ width: '100%', justifyContent: 'center', border: '1px solid var(--glass-b)', marginBottom: '24px' }} 
          onClick={handleGoogleSignup} 
          disabled={loading}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px' }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign up with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--glass-b)' }}></div>
          <div style={{ padding: '0 12px', color: 'var(--muted)', fontSize: '0.85rem' }}>or sign up with email</div>
          <div style={{ flex: 1, height: '1px', background: 'var(--glass-b)' }}></div>
        </div>

        <form onSubmit={handleEmailSignup} className={styles.form}>
          <div className="form-group">
            <label className="form-label">Your Name</label>
            <input className="form-input" type="text" placeholder="Ramesh Kumar" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" placeholder="you@hotel.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number (optional)</label>
            <input className="form-input" type="tel" placeholder="+91 9876543210" value={phone} onChange={e => setPhone(e.target.value)} />
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

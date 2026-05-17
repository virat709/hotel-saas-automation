'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import styles from './landing.module.css';

const features = [
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    title: 'Register Your Hotel',
    desc: 'Add your hotel name, address, and reception number in minutes. No technical knowledge needed.',
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    title: 'Room Management',
    desc: 'Track check-ins, guest occupancy, and room status (clean/dirty) directly from your dashboard.',
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 15h2a2 2 0 1 0 0-4h-2a2 2 0 1 1 0-4h2"/><path d="M12 5v14"/><circle cx="12" cy="12" r="10"/></svg>,
    title: 'Build Your Menu',
    desc: 'Create categories, add food items with prices and descriptions. Update anytime from your dashboard.',
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18h12"/><path d="M12 2v2"/><path d="M2 18a10 10 0 0 1 20 0"/><path d="m12 4 7 14H5l7-14Z"/></svg>,
    title: '5-Star Concierge',
    desc: 'Enable Room Service, Housekeeping, Spa, Valet, and more. Guests request services with one tap.',
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><rect x="7" y="7" width="3" height="3"/><rect x="14" y="7" width="3" height="3"/><rect x="7" y="14" width="3" height="3"/><rect x="14" y="14" width="3" height="3"/></svg>,
    title: 'Instant QR Portal',
    desc: 'Auto-generate a custom QR card for every room. Guests scan to see your digital world instantly.',
  },
  {
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    title: 'Live Manager Dashboard',
    desc: 'All orders and room requests flow in real-time with audio alerts. Never miss a guest request.',
  },
];

const steps = [
  { num: '01', label: 'Create Account', desc: 'Sign up with email & password in 30 seconds.' },
  { num: '02', label: 'Setup Hotel', desc: 'Add hotel details, rooms, services, and menu.' },
  { num: '03', label: 'Get QR Code', desc: 'Receive your auto-generated QR card instantly.' },
  { num: '04', label: 'Go Live', desc: 'Print and place QR codes. Start receiving orders!' },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [hasHotel, setHasHotel] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handler);
    
    let unsub: () => void;
    if (auth) {
      unsub = onAuthStateChanged(auth, async (u) => {
        setUser(u);
        if (u) {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists() && userDoc.data()?.hotelId) setHasHotel(true);
        }
      });
    }

    return () => {
      window.removeEventListener('scroll', handler);
      if (unsub) unsub();
    };
  }, []);

  if (!isMounted) return null;

  return (
    <div className={styles.page}>
      {/* Navbar */}
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-inner">
          <div className="nav-logo">
            <span>🏨</span>
            <span>Hotel<span className="gradient-text">QR</span></span>
          </div>
          <ul className="nav-links">
            <li><a href="#features" className="nav-link">Features</a></li>
            <li><a href="#how" className="nav-link">How It Works</a></li>
            <li><a href="#pricing" className="nav-link">Pricing</a></li>
          </ul>
          <div className="nav-cta">
            <Link href={user ? '/dashboard' : '/login'} className="btn btn-ghost btn-sm">
              {user ? 'Dashboard' : 'Login'}
            </Link>
            <Link href={user ? (hasHotel ? '/dashboard' : '/onboarding') : '/signup'} className="btn btn-primary btn-sm">
              {user ? (hasHotel ? 'Open Portal →' : 'Finish Setup →') : 'Get Started →'}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <div className="badge">🚀 Smart Hotel Automation — India&apos;s #1 QR Platform</div>
            <h1>
              Automate Your Hotel.<br />
              <span className="gradient-text">Go Digital in Minutes.</span>
            </h1>
            <p className={styles.heroSub}>
              Register your hotel, manage rooms &amp; occupancy, add your menu, and get a live 5-star dashboard with auto-generated QR cards for your guests.
            </p>
            <div className={styles.heroCtas}>
              <Link href={user ? (hasHotel ? '/dashboard' : '/onboarding') : '/signup'} className="btn btn-primary btn-lg">
                {user ? (hasHotel ? 'Go to Dashboard →' : 'Complete Setup →') : 'Start for Free →'}
              </Link>
              {!user && <a href="#how" className="btn btn-ghost btn-lg">See How It Works</a>}
            </div>
            <div className={styles.heroStats}>
              <div className={styles.hstat}><span>500+</span><small>Hotels Onboarded</small></div>
              <div className={styles.hstatDiv} />
              <div className={styles.hstat}><span>50K+</span><small>Orders Processed</small></div>
              <div className={styles.hstatDiv} />
              <div className={styles.hstat}><span>4.9★</span><small>Average Rating</small></div>
            </div>
          </div>
        </div>
        <div className={styles.scrollHint}>
          <span>Scroll</span>
          <div className={styles.scrollLine} />
        </div>
      </section>

      {/* Features */}
      <section className="section" id="features">
        <div className="container">
          <div className="sec-head">
            <div className="sec-badge">⚡ Features</div>
            <h2 className="sec-title">Everything You Need to <span className="gradient-text">Run Smarter</span></h2>
            <p className="sec-sub">Built for hotel owners who want to modernize without the complexity.</p>
          </div>
          <div className={styles.featGrid}>
            {features.map((f) => (
              <div key={f.title} className={styles.featCard}>
                <div className={styles.featIcon}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className={`section ${styles.howSection}`} id="how">
        <div className="container">
          <div className="sec-head">
            <div className="sec-badge">🔄 Process</div>
            <h2 className="sec-title">Setup in <span className="gradient-text">4 Easy Steps</span></h2>
            <p className="sec-sub">From zero to fully automated hotel — in under 15 minutes.</p>
          </div>
          <div className={styles.stepsGrid}>
            {steps.map((s) => (
              <div key={s.num} className={styles.stepCard}>
                <div className={styles.stepNum}>{s.num}</div>
                <h3>{s.label}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="section" id="pricing">
        <div className="container">
          <div className="sec-head">
            <div className="sec-badge">💎 Pricing</div>
            <h2 className="sec-title">Simple, <span className="gradient-text">Transparent</span> Pricing</h2>
            <p className="sec-sub">Start for free, upgrade when you need more power.</p>
          </div>
          <div className={styles.pricingGrid}>
            {/* Standard */}
            <div className={styles.pricingCard}>
              <div className={styles.planName}>Standard</div>
              <div className={styles.planPrice}>Free</div>
              <div className={styles.planPriceSub}>Forever</div>
              <ul className={styles.planFeatures}>
                <li>Guest QR Portal</li>
                <li>Digital Service Menu</li>
                <li>Basic Service Requests</li>
                <li>Real-time Notifications</li>
              </ul>
              <Link href="/signup" className="btn btn-ghost" style={{ marginTop: 'auto', justifyContent: 'center' }}>Get Started</Link>
            </div>

            {/* Premium */}
            <div className={`${styles.pricingCard} ${styles.pricingCardActive}`}>
              <div className={styles.planName}>Premium</div>
              <div className={styles.planPrice}>₹7,999</div>
              <div className={styles.planPriceSub}>per year</div>
              <ul className={styles.planFeatures}>
                <li style={{ borderBottom: '1px solid var(--glass-b)', paddingBottom: '8px', marginBottom: '12px' }}><b>✅ Everything in Standard +</b></li>
                <li>Unlimited Food Orders</li>
                <li>Analytics Dashboard</li>
                <li>Room Check-in System</li>
                <li>Team Management</li>
                <li>Export Reports</li>
              </ul>
              <Link href="/signup" className="btn btn-primary" style={{ marginTop: 'auto', justifyContent: 'center' }}>Start Premium</Link>
            </div>

            {/* Enterprise */}
            <div className={styles.pricingCard}>
              <div className={styles.planName}>Enterprise</div>
              <div className={styles.planPrice}>₹9,999</div>
              <div className={styles.planPriceSub}>per year</div>
              <ul className={styles.planFeatures}>
                <li style={{ borderBottom: '1px solid var(--glass-b)', paddingBottom: '8px', marginBottom: '12px' }}><b>✅ Everything in Premium +</b></li>
                <li>100% Customizable UI</li>
                <li>White-label Branding</li>
                <li>Custom Domain</li>
                <li>Priority Support</li>
              </ul>
              <Link href="/signup" className="btn btn-ghost" style={{ marginTop: 'auto', justifyContent: 'center' }}>Contact Sales</Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={`section ${styles.ctaSection}`}>
        <div className="container">
          <div className={styles.ctaBox}>
            <div className="sec-badge">🎯 Get Started</div>
            <h2>Ready to Transform<br /><span className="gradient-text">Your Hotel?</span></h2>
            <p>Join hundreds of hotels already running on HotelQR. Free to start — no credit card required.</p>
            <Link href="/signup" className="btn btn-primary btn-lg" style={{ marginTop: '32px' }}>
              Create Your Hotel Account →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className="container">
          <div className={styles.footerInner}>
            <Link href="/admin" className="nav-logo" style={{ textDecoration: 'none', cursor: 'default' }}>
              <span>🏨</span>
              <span>Hotel<span className="gradient-text">QR</span></span>
            </Link>
            <p style={{ fontSize: '.85rem' }}>Powered by V4 Virtual Services, Ahmedabad</p>
            <div className={styles.footerLinks}>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/login">Login</Link>
              <Link href="/signup">Sign Up</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

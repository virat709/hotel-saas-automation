'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import QRCode from 'react-qr-code';
import styles from './onboarding.module.css';

// ── Types ──────────────────────────────────────────────
interface MenuItem {
  id: string;
  name: string;
  price: string;
  category: string;
  description: string;
}

interface HotelData {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
}

const ALL_SERVICES = [
  { id: 'room_service', label: 'Room Service', icon: '🛎️' },
  { id: 'housekeeping', label: 'Housekeeping', icon: '🧹' },
  { id: 'laundry', label: 'Laundry', icon: '👕' },
  { id: 'spa', label: 'Spa & Wellness', icon: '💆' },
  { id: 'restaurant', label: 'Restaurant / Dining', icon: '🍽️' },
  { id: 'cab', label: 'Cab Booking', icon: '🚕' },
  { id: 'wakeup', label: 'Wake-up Call', icon: '⏰' },
  { id: 'checkin', label: 'Early Check-in', icon: '🏨' },
  { id: 'luggage', label: 'Luggage Assistance', icon: '🧳' },
  { id: 'wifi', label: 'WiFi Support', icon: '📶' },
  { id: 'valet', label: 'Valet Parking', icon: '🚗' },
  { id: 'gym', label: 'Gym Access', icon: '🏋️' },
  { id: 'pillow', label: 'Pillow Menu', icon: '🛌' },
  { id: 'concierge', label: 'Concierge', icon: '🤵' },
];

const MENU_CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverages', 'Desserts', 'Specials', 'Appetizers', 'Main Course', 'Sides', 'Drinks'];

function generateHotelId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 24) + '-' + Date.now().toString(36);
}

// ── Onboarding ─────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Pricing
  const [plan, setPlan] = useState<'standard'|'premium'|'enterprise'>('standard');

  // Step 2: Hotel Details
  const [hotel, setHotel] = useState<HotelData>({ name: '', address: '', city: '', phone: '', email: '' });

  // Step 2: Services
  const [services, setServices] = useState<string[]>([]);
  const [customSvc, setCustomSvc] = useState('');
  const [customServices, setCustomServices] = useState<{ id: string, label: string, icon: string }[]>([]);

  // Step 3: Menu
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [newItem, setNewItem] = useState<MenuItem>({ id: '', name: '', price: '', category: 'Breakfast', description: '' });

  // Step 5: Rooms
  const [roomList, setRoomList] = useState<string>('');
  
  // WiFi
  const [wifiName, setWifiName] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  
  // Payment
  const [utr, setUtr] = useState('');

  useEffect(() => {
    let unsub = () => {};
    if (auth) {
      unsub = onAuthStateChanged(auth, (user) => {
        if (!user) { router.push('/login'); return; }
        setUserId(user.uid);
      });
    }
    return () => unsub();
  }, [router]);

  const toggleService = (id: string) => {
    setServices(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const addCustomService = () => {
    if (!customSvc) return;
    const id = 'custom_' + Date.now();
    const newSvc = { id, label: customSvc, icon: '✨' };
    setCustomServices(prev => [...prev, newSvc]);
    setServices(prev => [...prev, id]);
    setCustomSvc('');
  };

  const addMenuItem = () => {
    if (!newItem.name || !newItem.price) return setError('Item name and price are required.');
    const item: MenuItem = { ...newItem, id: Date.now().toString() };
    setMenuItems(prev => [...prev, item]);
    setNewItem({ id: '', name: '', price: '', category: newItem.category, description: '' });
    setError('');
  };

  const removeMenuItem = (id: string) => {
    setMenuItems(prev => prev.filter(i => i.id !== id));
  };

  const handleFinish = async () => {
    if (!userId) return setError('Auth error. Please login again.');
    if (services.includes('restaurant') && menuItems.length === 0) return setError('Add at least one menu item to continue.');

    setLoading(true);
    setError('');
    try {
      const hotelId = generateHotelId(hotel.name);

      // Save hotel to Firestore
      const hotelDoc = {
        id: hotelId,
        ownerId: userId,
        name: hotel.name,
        address: hotel.address,
        city: hotel.city,
        phone: hotel.phone,
        email: hotel.email,
        services: [...services],
        customServiceLabels: customServices.reduce((acc, s) => ({ ...acc, [s.id]: s.label }), {}),
        menu: menuItems,
        rooms: roomList.split(',').map(r => r.trim()).filter(r => r).map(r => ({ id: r, status: 'empty' })),
        wifiName,
        wifiPassword,
        plan, // Store the selected plan
        paymentUtr: utr || null, // Store UTR if paid
        createdAt: new Date().toISOString(),
        planStartDate: new Date().toISOString(),
        planDurationMonths: plan === 'standard' ? 1 : 12,
        active: true,
      };

      console.log('Attempting to save hotel:', hotelDoc);
      await setDoc(doc(db, 'hotels', hotelId), hotelDoc);

      console.log('Linking hotel to user:', userId);
      await setDoc(doc(db, 'users', userId), { hotelId }, { merge: true });

      router.push('/dashboard');
    } catch (err: any) {
      console.error('Save Error:', err);
      setError(`Failed to save: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const stepLabels = plan === 'standard'
    ? ['Plan', 'Hotel', 'Services', 'Menu', 'Rooms']
    : ['Plan', 'Hotel', 'Services', 'Menu', 'Rooms', 'Payment'];

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className="nav-logo" style={{ justifyContent: 'center', marginBottom: '32px' }}>
            <span>🏨</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: '1.3rem' }}>
              Hotel<span className="gradient-text">QR</span>
            </span>
          </div>
          <h2 className={styles.title}>Setup Your Hotel</h2>
          <p style={{ color: 'var(--muted)', textAlign: 'center', marginBottom: '40px' }}>
            Complete the 3-step setup to get your dashboard &amp; QR code
          </p>

          {/* Step Indicator */}
          <div className="steps">
            {stepLabels.map((label, i) => (
              <div key={label} className={`step-item ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}>
                <div className="step-num">{step > i + 1 ? '✓' : i + 1}</div>
                <div className="step-label">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: '16px', borderRadius: 'var(--r)' }}>{error}</div>}

        {/* ── STEP 1: Select Plan ── */}
        {step === 1 && (
          <div className={styles.card}>
            <h3 className={styles.stepTitle}>💎 Choose Your Plan</h3>
            <div className={styles.pricingGrid}>
              
              {/* Standard */}
              <div 
                className={`${styles.pricingCard} ${plan === 'standard' ? styles.pricingCardActive : ''}`}
                onClick={() => setPlan('standard')}
              >
                <div className={styles.planName}>Standard</div>
                <div className={styles.planPrice}>Free</div>
                <div className={styles.planPriceSub}>Forever</div>
                <ul className={styles.planFeatures}>
                  <li>Guest QR Portal</li>
                  <li>Digital Service Menu</li>
                  <li>Basic Service Requests</li>
                  <li>Real-time Notifications</li>
                </ul>
              </div>

              {/* Premium */}
              <div 
                className={`${styles.pricingCard} ${plan === 'premium' ? styles.pricingCardActive : ''}`}
                onClick={() => setPlan('premium')}
              >
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
              </div>

              {/* Enterprise */}
              <div 
                className={`${styles.pricingCard} ${plan === 'enterprise' ? styles.pricingCardActive : ''}`}
                onClick={() => setPlan('enterprise')}
              >
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
              </div>

            </div>
            <div className={styles.actions}>
              <button className="btn btn-primary" onClick={() => setStep(2)}>
                Continue with {plan.charAt(0).toUpperCase() + plan.slice(1)} →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Hotel Details ── */}
        {step === 2 && (
          <div className={styles.card}>
            <h3 className={styles.stepTitle}>🏨 Hotel Information</h3>
            <div className={styles.formGrid}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Hotel Name *</label>
                <input className="form-input" placeholder="e.g. Hotel Mansarovar Grand" value={hotel.name} onChange={e => setHotel(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Full Address *</label>
                <input className="form-input" placeholder="Street, Area" value={hotel.address} onChange={e => setHotel(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">City *</label>
                <input className="form-input" placeholder="Ahmedabad" value={hotel.city} onChange={e => setHotel(p => ({ ...p, city: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Reception Number *</label>
                <input className="form-input" type="tel" placeholder="+91 98765 43210" value={hotel.phone} onChange={e => setHotel(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Hotel Email</label>
                <input className="form-input" type="email" placeholder="info@yourhotel.com" value={hotel.email} onChange={e => setHotel(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            <div className={styles.actions}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (!hotel.name || !hotel.address || !hotel.city || !hotel.phone) {
                    setError('Please fill all required fields.'); return;
                  }
                  setError(''); setStep(3);
                }}
              >
                Continue to Services →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Services ── */}
        {step === 3 && (
          <div className={styles.card}>
            <h3 className={styles.stepTitle}>⚙️ Select Your Services</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>Choose the services your hotel offers. Guests will see these options when they scan the QR.</p>
            <div className={styles.servicesGrid}>
              {[...ALL_SERVICES, ...customServices].map(svc => (
                <button
                  key={svc.id}
                  className={`${styles.svcBtn} ${services.includes(svc.id) ? styles.svcActive : ''}`}
                  onClick={() => toggleService(svc.id)}
                >
                  <span className={styles.svcIcon}>{svc.icon}</span>
                  <span className={styles.svcLabel}>{svc.label}</span>
                  {services.includes(svc.id) && <span className={styles.svcCheck}>✓</span>}
                </button>
              ))}
            </div>

            {/* WiFi Setup (Only if WiFi service is selected) */}
            {services.includes('wifi') && (
              <div style={{ marginTop: '24px', padding: '20px', background: 'rgba(14,165,233,.05)', borderRadius: 'var(--r)', border: '1px solid rgba(14,165,233,.1)' }}>
                <h4 style={{ fontSize: '.9rem', marginBottom: '12px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📶 Guest WiFi Details
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '.75rem' }}>WiFi Name (SSID)</label>
                    <input className="form-input" placeholder="e.g. Hotel_Guest" value={wifiName} onChange={e => setWifiName(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '.75rem' }}>WiFi Password</label>
                    <input className="form-input" placeholder="e.g. guest123" value={wifiPassword} onChange={e => setWifiPassword(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Custom Service Input */}
            <div className={styles.addItemForm} style={{ marginTop: '24px', borderTop: '1px solid var(--glass-b)', paddingTop: '20px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <input className="form-input" placeholder="Add custom service (e.g. Pool Access)" value={customSvc} onChange={e => setCustomSvc(e.target.value)} />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={addCustomService}>+ Add Custom</button>
            </div>

            <div className={styles.actions}>
              <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (services.length === 0) { setError('Select at least one service.'); return; }
                  setError('');
                  if (services.includes('restaurant')) {
                    setStep(4);
                  } else {
                    setStep(5);
                  }
                }}
              >
                {services.includes('restaurant') ? 'Continue to Menu →' : 'Continue to Rooms →'}
              </button>
            </div>
          </div>
        )}


        {/* ── STEP 4: Menu ── */}
        {step === 4 && (
          <div className={styles.card}>
            <h3 className={styles.stepTitle}>🍽️ Build Your Menu</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>Add food items guests can order. You can edit this anytime from your dashboard.</p>

            {/* Add Item Form */}
            <div className={styles.addItemForm}>
              <div className="form-group">
                <label className="form-label">Item Name *</label>
                <input className="form-input" placeholder="e.g. Paneer Butter Masala" value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Price (₹) *</label>
                <input className="form-input" type="number" placeholder="250" value={newItem.price} onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-input" value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))}>
                  {MENU_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Description (optional)</label>
                <input className="form-input" placeholder="Brief description..." value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} />
              </div>
              <button className="btn btn-ghost btn-sm" style={{ gridColumn: '1/-1', width: 'fit-content' }} onClick={addMenuItem}>
                + Add Item
              </button>
            </div>

            {/* Menu List */}
            {menuItems.length > 0 && (
              <div className={styles.menuList}>
                {menuItems.map(item => (
                  <div key={item.id} className={styles.menuItem}>
                    <div className={styles.menuItemInfo}>
                      <span className={styles.menuItemName}>{item.name}</span>
                      <span className={styles.menuItemCat}>{item.category}</span>
                    </div>
                    <div className={styles.menuItemRight}>
                      <span className={styles.menuItemPrice}>₹{item.price}</span>
                      <button className={styles.removeBtn} onClick={() => removeMenuItem(item.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.actions}>
              <button className="btn btn-ghost" onClick={() => setStep(3)}>← Back</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (menuItems.length === 0) { setError('Add at least one menu item.'); return; }
                  setError(''); setStep(5);
                }}
              >
                Continue to Rooms →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Rooms ── */}
        {step === 5 && (
          <div className={styles.card}>
            <h3 className={styles.stepTitle}>🔑 Room Configuration</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>Enter your room numbers separated by commas. You can manage them later in the dashboard.</p>

            <div className="form-group">
              <label className="form-label">Room Numbers</label>
              <textarea
                className="form-input form-textarea"
                placeholder="e.g. 101, 102, 103, 104, 201, 202..."
                value={roomList}
                onChange={e => setRoomList(e.target.value)}
              />
              <p style={{ fontSize: '.75rem', marginTop: '8px' }}>
                Tip: Enter as many as you have. This helps verify guest orders.
              </p>
            </div>

            <div className={styles.actions}>
              <button className="btn btn-ghost" onClick={() => services.includes('restaurant') ? setStep(4) : setStep(3)}>← Back</button>
              <button className="btn btn-primary" onClick={async () => {
                if (plan !== 'standard') {
                  setStep(6);
                } else {
                  handleFinish();
                }
              }} disabled={loading}>
                {plan === 'standard' ? '🚀 Launch My Hotel →' : 'Continue to Payment →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 6: Payment ── */}
        {step === 6 && (
          <div className={styles.card}>
            <h3 className={styles.stepTitle}>💳 Complete Your Payment</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>Scan the QR code below using any UPI app (GPay, PhonePe, Paytm) to pay for your {plan} plan.</p>
            
            {/* Payment UI */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--glass)', padding: '32px', borderRadius: 'var(--r-lg)', border: '1px solid var(--glass-b)', marginBottom: '24px' }}>
              <div style={{ background: 'white', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                <QRCode value={`upi://pay?pa=9652172595@axl&pn=Hotel%20SaaS&am=${plan === 'premium' ? '7999' : '9999'}&cu=INR`} size={180} />
              </div>
              <h4 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>₹{plan === 'premium' ? '7,999' : '9,999'}</h4>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '16px' }}>UPI ID: <b>9652172595@axl</b></p>
              
              <div style={{ width: '100%', maxWidth: '300px' }}>
                <label className="form-label">Transaction ID (UTR) *</label>
                <input 
                  className="form-input" 
                  placeholder="Enter 12-digit UTR number" 
                  value={utr}
                  onChange={e => setUtr(e.target.value)}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '8px' }}>After paying, enter the reference number here so we can verify your payment.</p>
              </div>
            </div>

            {error && <div className="toast toast-error" style={{position: 'static', marginBottom: '20px', borderRadius: 'var(--r)'}}>{error}</div>}

            <div className={styles.actions}>
              <button className="btn btn-ghost" onClick={() => setStep(5)}>← Back</button>
              <button className="btn btn-primary" onClick={async () => {
                if (!utr || utr.length < 8) {
                  setError('Please enter a valid Transaction ID / UTR.');
                  return;
                }
                setLoading(true);
                handleFinish();
              }} disabled={loading}>
                {loading ? <span className="spinner" /> : '✅ Verify & Launch Hotel'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import styles from './admin.module.css';

// ─── Types ───────────────────────────────────────────────
interface Hotel {
  id: string;
  name: string;
  city: string;
  address?: string;
  phone?: string;
  email?: string;
  plan?: 'standard' | 'premium' | 'enterprise';
  active?: boolean;
  services?: string[];
  menu?: { id: string }[];
  rooms?: { id: string; status: string }[];
  createdAt?: string;
  planStartDate?: string;
  planDurationMonths?: number;
  paymentUtr?: string;
  telegramChatId?: string;
}

// ─── Constants ───────────────────────────────────────────
const ADMIN_PASSWORD = 'hotelqr@admin2024';

const PLAN_DURATION: Record<string, number> = {
  standard: 1,   // 1 month free trial
  premium: 12,   // 1 year
  enterprise: 12,
};

// ─── Helpers ─────────────────────────────────────────────
function getMonthsRemaining(hotel: Hotel): { months: number; percent: number; expired: boolean } {
  const startDate = hotel.planStartDate || hotel.createdAt;
  if (!startDate) return { months: 0, percent: 0, expired: true };

  const start = new Date(startDate);
  const durationMonths = hotel.planDurationMonths ?? PLAN_DURATION[hotel.plan || 'standard'] ?? 1;
  const expiryDate = new Date(start);
  expiryDate.setMonth(expiryDate.getMonth() + durationMonths);

  const now = new Date();
  const msLeft = expiryDate.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24)));
  const monthsLeft = Math.max(0, msLeft / (1000 * 60 * 60 * 24 * 30.44));
  const totalMs = expiryDate.getTime() - start.getTime();
  const percent = totalMs > 0 ? Math.min(100, Math.max(0, (msLeft / totalMs) * 100)) : 0;

  return { months: parseFloat(monthsLeft.toFixed(1)), percent, expired: daysLeft === 0 };
}

function getExpiryColor(percent: number): string {
  if (percent > 50) return '#22c55e';
  if (percent > 20) return '#f59e0b';
  return '#ef4444';
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getPlanLabel(plan?: string) {
  switch (plan) {
    case 'premium': return { label: '👑 Premium', cls: styles.premium };
    case 'enterprise': return { label: '🚀 Enterprise', cls: styles.enterprise };
    default: return { label: '🆓 Standard', cls: styles.standard };
  }
}

const SERVICE_LABELS: Record<string, string> = {
  room_service: 'Room Service', housekeeping: 'Housekeeping', laundry: 'Laundry',
  spa: 'Spa', restaurant: 'Restaurant', cab: 'Cab', wakeup: 'Wake-up', checkin: 'Check-in',
  luggage: 'Luggage', wifi: 'WiFi',
};

// ─── Component ───────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState('');

  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState<'all' | 'standard' | 'premium' | 'enterprise'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'plan' | 'date' | 'expiry'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null);
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [newPlan, setNewPlan] = useState<'standard' | 'premium' | 'enterprise'>('premium');
  const [toast, setToast] = useState('');
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── Real-time listener ──
  useEffect(() => {
    if (!authed || !db) return;
    const unsub = onSnapshot(collection(db, 'hotels'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Hotel));
      setHotels(data);
      setLoading(false);
      setLastUpdated(new Date());
    }, (err) => {
      console.error('Admin snapshot error:', err);
      setLoading(false);
    });
    return unsub;
  }, [authed]);

  // ── Login ──
  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setAuthed(true);
      setPwError('');
    } else {
      setPwError('Incorrect password. Try again.');
    }
  };

  // ── Upgrade plan ──
  const handlePlanUpgrade = async () => {
    if (!selectedHotel) return;
    setUpdatingPlan(true);
    try {
      await updateDoc(doc(db, 'hotels', selectedHotel.id), {
        plan: newPlan,
        planStartDate: new Date().toISOString(),
        planDurationMonths: PLAN_DURATION[newPlan],
      });
      setSelectedHotel({ ...selectedHotel, plan: newPlan, planStartDate: new Date().toISOString() });
      showToast(`✅ ${selectedHotel.name} upgraded to ${newPlan}!`);
    } catch (e) {
      showToast('❌ Failed to update plan.');
    } finally {
      setUpdatingPlan(false);
    }
  };

  // ── Filtering & Sorting ──
  const filtered = hotels
    .filter(h => {
      const q = search.toLowerCase();
      const matchSearch = !q || h.name?.toLowerCase().includes(q) || h.city?.toLowerCase().includes(q) || h.email?.toLowerCase().includes(q);
      const matchPlan = planFilter === 'all' || (h.plan || 'standard') === planFilter;
      return matchSearch && matchPlan;
    })
    .sort((a, b) => {
      let valA: any, valB: any;
      if (sortBy === 'name') { valA = a.name?.toLowerCase(); valB = b.name?.toLowerCase(); }
      else if (sortBy === 'plan') { valA = a.plan; valB = b.plan; }
      else if (sortBy === 'expiry') { valA = getMonthsRemaining(a).months; valB = getMonthsRemaining(b).months; }
      else { valA = a.createdAt || ''; valB = b.createdAt || ''; }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  // ── KPIs ──
  const totalRevenue = hotels.filter(h => h.plan === 'premium').length * 7999 +
                       hotels.filter(h => h.plan === 'enterprise').length * 19999;
  const expiredCount = hotels.filter(h => getMonthsRemaining(h).expired).length;
  const premiumCount = hotels.filter(h => h.plan === 'premium').length;
  const enterpriseCount = hotels.filter(h => h.plan === 'enterprise').length;

  // ── Login Gate ──
  if (!authed) {
    return (
      <div className={styles.loginGate}>
        <div className={styles.loginCard}>
          <div className={styles.loginLogo}>🏨 Hotel<span className="gradient-text">QR</span></div>
          <div className={styles.loginSub}>Admin Access — CRM Dashboard</div>
          <div className={styles.loginForm}>
            <input
              className="form-input"
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
            {pwError && <div className={styles.loginError}>{pwError}</div>}
            <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={handleLogin}>
              Unlock Dashboard →
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
        <span>Loading CRM data…</span>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>🏨 Hotel<span className="gradient-text">QR</span></div>
          <div className={styles.adminBadge}>CRM Dashboard</div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.livePulse}>
            <span className={styles.dot} />
            <span>Live · Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setAuthed(false)}>🔒 Lock</button>
        </div>
      </header>

      {toast && <div className="toast toast-success">{toast}</div>}

      <div className={styles.body}>

        {/* ── KPI Cards ── */}
        <div className={styles.kpiRow}>
          <div className={`${styles.kpiCard} ${styles.blue}`}>
            <div className={styles.kpiIcon}>🏨</div>
            <div className={styles.kpiValue}>{hotels.length}</div>
            <div className={styles.kpiLabel}>Total Hotels</div>
            <div className={styles.kpiSub}>↑ All registered</div>
          </div>
          <div className={`${styles.kpiCard} ${styles.gold}`}>
            <div className={styles.kpiIcon}>👑</div>
            <div className={styles.kpiValue}>{premiumCount + enterpriseCount}</div>
            <div className={styles.kpiLabel}>Paying Customers</div>
            <div className={styles.kpiSub}>{premiumCount} Premium · {enterpriseCount} Enterprise</div>
          </div>
          <div className={`${styles.kpiCard} ${styles.green}`}>
            <div className={styles.kpiIcon}>💰</div>
            <div className={styles.kpiValue}>₹{totalRevenue.toLocaleString('en-IN')}</div>
            <div className={styles.kpiLabel}>Total Revenue</div>
            <div className={styles.kpiSub}>Annual estimate</div>
          </div>
          <div className={`${styles.kpiCard} ${styles.red}`}>
            <div className={styles.kpiIcon}>⏰</div>
            <div className={styles.kpiValue}>{expiredCount}</div>
            <div className={styles.kpiLabel}>Expired Plans</div>
            <div className={styles.kpiSub}>Needs follow-up</div>
          </div>
          <div className={`${styles.kpiCard} ${styles.purple}`}>
            <div className={styles.kpiIcon}>📊</div>
            <div className={styles.kpiValue}>{hotels.filter(h => (h.plan || 'standard') === 'standard').length}</div>
            <div className={styles.kpiLabel}>Free Users</div>
            <div className={styles.kpiSub}>Upgrade potential</div>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className={styles.controls}>
          <input
            className={styles.searchBox}
            placeholder="🔍 Search by hotel name, city, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {(['all', 'standard', 'premium', 'enterprise'] as const).map(p => (
            <button
              key={p}
              className={`${styles.filterBtn} ${planFilter === p ? styles.active : ''}`}
              onClick={() => setPlanFilter(p)}
            >
              {p === 'all' ? 'All Plans' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          <div className={styles.controlsSpacer} />
          <div className={styles.refreshBtn}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
            {filtered.length} of {hotels.length} hotels
          </div>
        </div>

        {/* ── Table ── */}
        <div className={styles.tableWrapper}>
          {filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <span>🔍</span>
              <p>No hotels match your search.</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th onClick={() => toggleSort('name')}>Hotel {sortBy === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                  <th onClick={() => toggleSort('plan')}>Plan {sortBy === 'plan' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                  <th onClick={() => toggleSort('date')}>Registered {sortBy === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                  <th onClick={() => toggleSort('expiry')}>Subscription {sortBy === 'expiry' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
                  <th>Services</th>
                  <th>Rooms</th>
                  <th>Menu Items</th>
                  <th>Contact</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(hotel => {
                  const planInfo = getPlanLabel(hotel.plan);
                  const expiry = getMonthsRemaining(hotel);
                  const expiryColor = getExpiryColor(expiry.percent);
                  const expiryLabel = expiry.expired
                    ? '❌ Expired'
                    : expiry.months < 1
                    ? `${Math.round(expiry.months * 30)} days left`
                    : `${expiry.months.toFixed(1)} mo left`;

                  return (
                    <tr key={hotel.id}>
                      {/* Hotel */}
                      <td>
                        <div className={styles.hotelCell}>
                          <div className={styles.hotelAvatar}>{hotel.name?.charAt(0).toUpperCase() || '?'}</div>
                          <div>
                            <div className={styles.hotelName}>{hotel.name}</div>
                            <div className={styles.hotelCity}>📍 {hotel.city || '—'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Plan */}
                      <td>
                        <span className={`${styles.planBadge} ${planInfo.cls}`}>{planInfo.label}</span>
                      </td>

                      {/* Registered */}
                      <td>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{formatDate(hotel.createdAt)}</div>
                        {hotel.paymentUtr && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>UTR: {hotel.paymentUtr}</div>
                        )}
                      </td>

                      {/* Subscription / Expiry */}
                      <td>
                        <div className={styles.expiryCell}>
                          <div className={styles.expiryText}>
                            <span style={{ color: expiry.expired ? '#ef4444' : 'var(--text)' }}>{expiryLabel}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{Math.round(expiry.percent)}%</span>
                          </div>
                          <div className={styles.expiryBar}>
                            <div
                              className={styles.expiryFill}
                              style={{ width: `${expiry.percent}%`, background: expiryColor }}
                            />
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
                            Since {formatDate(hotel.planStartDate || hotel.createdAt)}
                          </div>
                        </div>
                      </td>

                      {/* Services */}
                      <td>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600 }}>
                          {hotel.services?.length || 0} services
                        </span>
                      </td>

                      {/* Rooms */}
                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                          {hotel.rooms?.length || 0}
                        </div>
                        {(hotel.rooms?.length || 0) > 0 && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--success)' }}>
                            {hotel.rooms?.filter(r => r.status === 'occupied').length || 0} occupied
                          </div>
                        )}
                      </td>

                      {/* Menu */}
                      <td>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{hotel.menu?.length || 0} items</span>
                      </td>

                      {/* Contact */}
                      <td>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text)' }}>{hotel.phone || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>{hotel.email || '—'}</div>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={`${styles.actionBtn} ${styles.view}`}
                            onClick={() => { setSelectedHotel(hotel); setNewPlan(hotel.plan || 'premium'); }}
                          >
                            👁 View
                          </button>
                          {(hotel.plan || 'standard') !== 'premium' && (
                            <button
                              className={`${styles.actionBtn} ${styles.upgrade}`}
                              onClick={() => { setSelectedHotel(hotel); setNewPlan('premium'); }}
                            >
                              ↑ Upgrade
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Detail Modal ── */}
      {selectedHotel && (
        <div className={styles.modalOverlay} onClick={() => setSelectedHotel(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>{selectedHotel.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 4 }}>
                  📍 {selectedHotel.city} · ID: <code style={{ color: 'var(--mid)', fontSize: '0.75rem' }}>{selectedHotel.id}</code>
                </div>
              </div>
              <button className={styles.modalClose} onClick={() => setSelectedHotel(null)}>✕</button>
            </div>

            {/* Details Grid */}
            <div className={styles.detailGrid}>
              {[
                { label: 'Plan', value: getPlanLabel(selectedHotel.plan).label },
                { label: 'Registered', value: formatDate(selectedHotel.createdAt) },
                { label: 'Plan Start', value: formatDate(selectedHotel.planStartDate || selectedHotel.createdAt) },
                { label: 'Months Left', value: (() => { const e = getMonthsRemaining(selectedHotel); return e.expired ? '❌ Expired' : `${e.months} months`; })() },
                { label: 'Phone', value: selectedHotel.phone || '—' },
                { label: 'Email', value: selectedHotel.email || '—' },
                { label: 'Rooms', value: `${selectedHotel.rooms?.length || 0} rooms` },
                { label: 'Menu Items', value: `${selectedHotel.menu?.length || 0} items` },
                { label: 'Payment UTR', value: selectedHotel.paymentUtr || 'Not paid' },
                { label: 'Telegram', value: selectedHotel.telegramChatId ? '✅ Linked' : '❌ Not linked' },
              ].map(({ label, value }) => (
                <div key={label} className={styles.detailItem}>
                  <div className={styles.detailLabel}>{label}</div>
                  <div className={styles.detailValue} style={{ wordBreak: 'break-all', fontSize: value.length > 20 ? '0.78rem' : '0.98rem' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Services */}
            {(selectedHotel.services?.length || 0) > 0 && (
              <div className={styles.modalSection}>
                <div className={styles.modalSectionTitle}>Active Services</div>
                <div className={styles.servicesList}>
                  {selectedHotel.services!.map(s => (
                    <span key={s} className={styles.serviceTag}>{SERVICE_LABELS[s] || s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Plan Update */}
            <div className={styles.modalSection}>
              <div className={styles.modalSectionTitle}>Update Subscription Plan</div>
              <select
                className={styles.planSelect}
                value={newPlan}
                onChange={e => setNewPlan(e.target.value as any)}
              >
                <option value="standard">🆓 Standard (Free Trial — 1 month)</option>
                <option value="premium">👑 Premium (₹7,999/year — 12 months)</option>
                <option value="enterprise">🚀 Enterprise (₹19,999/year — 12 months)</option>
              </select>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handlePlanUpgrade}
                disabled={updatingPlan}
              >
                {updatingPlan ? <span className="spinner" /> : '✅ Save & Activate Plan'}
              </button>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
              <a
                href={`/hotel/${selectedHotel.id}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-sm"
              >
                🔗 View Guest Portal
              </a>
              <a
                href={`mailto:${selectedHotel.email}?subject=HotelQR%20-%20Your%20Plan%20Update`}
                className="btn btn-ghost btn-sm"
              >
                📧 Email Hotel
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

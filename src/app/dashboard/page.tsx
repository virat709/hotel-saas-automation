'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, onSnapshot, updateDoc, orderBy, setDoc } from 'firebase/firestore';
import { auth, db, requestNotificationPermission } from '@/lib/firebase';
import QRCode from 'react-qr-code';
import styles from './dashboard.module.css';

interface HotelData {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  services: string[];
  customServiceLabels?: Record<string, string>;
  menu: { id: string; name: string; price: string; category: string; description: string }[];
  active: boolean;
  rooms?: { id: string; status: 'empty' | 'occupied'; guestName?: string; checkInTime?: string }[];
  telegramChatId?: string;
  wifiName?: string;
  wifiPassword?: string;
  fcmTokens?: string[];
  plan?: 'standard' | 'premium' | 'enterprise';
}

interface Order {
  id: string;
  roomNumber: string;
  guestName: string;
  type: 'food' | 'service';
  items?: string[];
  service?: string;
  status: 'pending' | 'in-progress' | 'done';
  createdAt: string;
  total?: string;
}

type TabType = 'overview' | 'analytics' | 'orders' | 'menu' | 'rooms' | 'qr' | 'settings' | 'team';

export default function DashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'owner' | 'staff'>('owner');
  const [hotel, setHotel] = useState<HotelData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [toast, setToast] = useState('');

  // Sound ref
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Menu management states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', price: '', category: 'Breakfast', description: '' });

  // Check-in modal state
  const [checkInModal, setCheckInModal] = useState<{ roomId: string } | null>(null);
  const [checkInForm, setCheckInForm] = useState({ guestName: '', phone: '', otp: '' });
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [devOtp, setDevOtp] = useState(''); // shown in dev mode when no SMS key

  // Services editor state
  const [editingServices, setEditingServices] = useState(false);
  const [servicesDraft, setServicesDraft] = useState<string[]>([]);
  const [telegramInput, setTelegramInput] = useState('');
  const [staffMembers, setStaffMembers] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [tempStaffName, setTempStaffName] = useState('');
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'staff' });
  const [createdStaffCreds, setCreatedStaffCreds] = useState<{email: string, pass: string} | null>(null);

  // Upgrade state
  const [upgradeUtr, setUpgradeUtr] = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadHotel = useCallback(async (uid: string) => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    const userData = userDoc.data();
    if (!userData?.hotelId) { router.push('/onboarding'); return; }

    const hotelDoc = await getDoc(doc(db, 'hotels', userData.hotelId));
    if (hotelDoc.exists()) {
      setHotel({ id: hotelDoc.id, ...hotelDoc.data() } as HotelData);
      setUserRole(userData.role || 'owner');
    }
    setLoading(false);
  }, [router]);

  // Menu functions
  const saveMenuItem = async () => {
    if (!hotel || !newItem.name || !newItem.price) return;
    const item = { ...newItem, id: Date.now().toString() };
    const updatedMenu = [...hotel.menu, item];
    await updateDoc(doc(db, 'hotels', hotel.id), { menu: updatedMenu });
    setHotel({ ...hotel, menu: updatedMenu });
    setShowAddModal(false);
    setNewItem({ name: '', price: '', category: 'Breakfast', description: '' });
    showToast('Menu item added!');
  };

  const deleteMenuItem = async (id: string) => {
    if (!hotel) return;
    const updatedMenu = hotel.menu.filter(i => i.id !== id);
    await updateDoc(doc(db, 'hotels', hotel.id), { menu: updatedMenu });
    setHotel({ ...hotel, menu: updatedMenu });
    showToast('Item removed.');
  };

  const updateRoomStatus = async (roomId: string, status: 'empty' | 'occupied', guestName?: string, phone?: string) => {
    if (!hotel) return;
    const updatedRooms = (hotel.rooms || []).map(r => 
      r.id === roomId ? { ...r, status, guestName, phone, checkInTime: status === 'occupied' ? new Date().toISOString() : undefined } : r
    );
    await updateDoc(doc(db, 'hotels', hotel.id), { rooms: updatedRooms });
    setHotel({ ...hotel, rooms: updatedRooms });
    showToast(`Room ${roomId} updated.`);
  };

  const sendOtp = async () => {
    if (!checkInForm.phone) return;
    setOtpLoading(true);
    setOtpError('');
    setDevOtp('');
    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: checkInForm.phone }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setOtpError(data.details ? `${data.error}: ${data.details}` : (data.error || 'Failed to send OTP'));
      } else {
        setOtpSent(true);
        if (data.dev) {
          setDevOtp(data.otp); // Show OTP in dev mode
          showToast(`DEV MODE: OTP is ${data.otp}`);
        } else {
          showToast(`OTP sent to ${checkInForm.phone}`);
        }
      }
    } catch {
      setOtpError('Network error. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!checkInForm.otp || !checkInForm.phone) return;
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await fetch('/api/send-otp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: checkInForm.phone, otp: checkInForm.otp }),
      });
      const data = await res.json();
      if (data.valid) {
        setOtpVerified(true);
        showToast('OTP verified! ✓');
      } else {
        setOtpError(data.error || 'Incorrect OTP');
      }
    } catch {
      setOtpError('Network error. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  const confirmCheckIn = async () => {
    if (!checkInModal || !checkInForm.guestName || !checkInForm.phone) return;
    await updateRoomStatus(checkInModal.roomId, 'occupied', checkInForm.guestName, checkInForm.phone);
    setCheckInModal(null);
    setCheckInForm({ guestName: '', phone: '', otp: '' });
    setOtpSent(false);
    setOtpVerified(false);
  };

  const saveServices = async () => {
    if (!hotel) return;
    await updateDoc(doc(db, 'hotels', hotel.id), { services: servicesDraft });
    setHotel({ ...hotel, services: servicesDraft });
    setEditingServices(false);
    showToast('Services updated!');
  };

  const handleUpgrade = async () => {
    if (!upgradeUtr || upgradeUtr.length < 8) {
      setUpgradeError('Please enter a valid Transaction ID / UTR.');
      return;
    }
    if (!hotel) return;

    setUpgradeLoading(true);
    setUpgradeError('');
    try {
      await updateDoc(doc(db, 'hotels', hotel.id), { 
        plan: 'premium',
        paymentUtr: upgradeUtr
      });
      setHotel({ ...hotel, plan: 'premium' });
      showToast('Successfully upgraded to Premium! 🎉');
      setUpgradeUtr('');
    } catch (err: any) {
      setUpgradeError('Failed to upgrade. Please try again.');
    } finally {
      setUpgradeLoading(false);
    }
  };

  const updateTelegramId = async (id: string) => {
    if (!hotel) return;
    await updateDoc(doc(db, 'hotels', hotel.id), { telegramChatId: id });
    setHotel({ ...hotel, telegramChatId: id });
    showToast('Telegram linked! 🚀');
  };

  const downloadQR = () => {
    const svg = document.getElementById('hotel-qr');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, 512, 512);
      const link = document.createElement('a');
      link.download = `${hotel?.name}-QR.png`;
      link.href = canvas.toDataURL();
      link.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  const printTableCard = () => {
    if (!hotel) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const qrSvg = document.getElementById('hotel-qr')?.outerHTML || '';

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Table Card - ${hotel.name}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Outfit:wght@400;600&display=swap" rel="stylesheet">
          <style>
            body { 
              margin: 0; display: flex; align-items: center; justify-content: center; 
              min-height: 100vh; background: #e5e5e5; font-family: 'Outfit', sans-serif; 
            }
            .card { 
              width: 105mm; height: 148mm; /* A6 size */
              background: #F4F1EA; 
              position: relative;
              display: flex; flex-direction: column; align-items: center; 
              box-shadow: 0 10px 30px rgba(0,0,0,0.15); 
              overflow: hidden;
            }
            .top-logo-container {
              margin-top: 25px;
              display: flex; flex-direction: column; align-items: center;
              z-index: 2;
            }
            .circle-logo {
              width: 45px; height: 45px;
              background: #0B162C;
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              color: #C5A059; font-weight: bold; font-family: 'Cinzel', serif; font-size: 20px;
              margin-bottom: 8px;
              box-shadow: 0 4px 10px rgba(0,0,0,0.1);
            }
            .hotel-name-top {
              font-family: 'Cinzel', serif;
              color: #0B162C; font-weight: 700; font-size: 14px;
              text-transform: uppercase; letter-spacing: 1px;
            }
            
            .divider {
              display: flex; align-items: center; justify-content: center;
              width: 80%; margin: 15px 0;
            }
            .divider::before, .divider::after {
              content: ''; flex: 1; height: 1px; background: #C5A059; opacity: 0.5;
            }
            .divider span {
              color: #C5A059; font-size: 8px; letter-spacing: 2px; text-transform: uppercase;
              margin: 0 10px; font-weight: 600;
            }
            
            .heading-primary {
              font-family: 'Cinzel', serif;
              color: #0B162C; font-size: 20px; font-weight: 700;
              margin-bottom: 4px; text-align: center;
            }
            .heading-secondary {
              font-family: 'Cinzel', serif;
              color: #C5A059; font-size: 22px; font-weight: 700;
              margin-bottom: 20px; text-align: center;
            }
            
            .icons-row {
              display: flex; justify-content: center; gap: 12px; margin-bottom: 25px;
              z-index: 2;
            }
            .icon-item {
              display: flex; flex-direction: column; align-items: center; gap: 6px;
            }
            .icon-circle {
              width: 32px; height: 32px;
              border: 1px solid #C5A059; border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              color: #0B162C;
            }
            .icon-label {
              font-size: 7px; color: #0B162C; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;
            }
            
            .middle-band {
              position: absolute; top: 38%; left: 0; right: 0; height: 26%;
              background: #0B162C; z-index: 1;
            }
            
            .qr-container {
              background: #fff;
              border: 4px solid #C5A059;
              border-radius: 12px;
              padding: 12px;
              width: 150px; height: 150px;
              z-index: 2;
              display: flex; align-items: center; justify-content: center;
              box-shadow: 0 10px 20px rgba(0,0,0,0.1);
            }
            .qr-container svg { width: 100%; height: 100%; }
            
            .scan-btn {
              background: #C5A059;
              color: #fff;
              padding: 8px 16px;
              border-radius: 20px;
              font-size: 9px; font-weight: 600; letter-spacing: 1px;
              margin-top: 20px; z-index: 2;
              display: flex; align-items: center; gap: 6px;
              box-shadow: 0 4px 10px rgba(197,160,89,0.3);
            }
            
            .footer-section {
              margin-top: auto; margin-bottom: 20px; width: 100%;
              display: flex; flex-direction: column; align-items: center; z-index: 2;
            }
            
            .footer-heading {
              font-family: 'Cinzel', serif; color: #0B162C; font-size: 14px; font-weight: 700;
              margin-bottom: 8px; position: relative;
            }
            .footer-heading::before, .footer-heading::after {
              content: ''; position: absolute; top: 50%; width: 40px; height: 1px; background: #0B162C; opacity: 0.2;
            }
            .footer-heading::before { right: 100%; margin-right: 15px; }
            .footer-heading::after { left: 100%; margin-left: 15px; }
            
            .footer-sub {
              font-size: 8px; color: #C5A059; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 18px; font-weight: 600;
            }
            
            .bottom-features {
              display: flex; justify-content: center; gap: 20px; width: 100%;
            }
            .feature {
              display: flex; align-items: center; gap: 6px;
            }
            .feature-icon {
              color: #C5A059;
            }
            .feature-text {
              font-size: 7px; color: #0B162C; line-height: 1.3; font-weight: 600; text-align: left;
            }
            
            @media print { 
              body { background: none; } 
              .card { box-shadow: none; border: 1px solid #eee; } 
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="middle-band"></div>
            
            <div class="top-logo-container">
              <img src="/v4-logo.png" alt="Logo" class="circle-logo" style="background: none; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
              <div class="circle-logo fallback-logo" style="display: none;">${hotel.name.charAt(0)}</div>
              <div class="hotel-name-top">${hotel.name}</div>
            </div>
            
            <div class="divider">
              <span>HOSPITALITY REDEFINED</span>
            </div>
            
            <div class="heading-primary">SCAN TO EXPERIENCE</div>
            <div class="heading-secondary">PREMIUM COMFORT</div>
            
            <div class="icons-row">
              <div class="icon-item">
                <div class="icon-circle">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h12"/><path d="M12 2v2"/><path d="M2 18a10 10 0 0 1 20 0"/><path d="m12 4 7 14H5l7-14Z"/></svg>
                </div>
                <div class="icon-label">ROOM SERVICE</div>
              </div>
              <div class="icon-item">
                <div class="icon-circle">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 19a6 6 0 0 0-12 0"/><circle cx="8" cy="9" r="4"/><path d="M22 19a6 6 0 0 0-6-6 4 4 0 1 0 0-8"/></svg>
                </div>
                <div class="icon-label">CONCIERGE</div>
              </div>
              <div class="icon-item">
                <div class="icon-circle">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/></svg>
                </div>
                <div class="icon-label">HOUSEKEEPING</div>
              </div>
              <div class="icon-item">
                <div class="icon-circle">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <div class="icon-label">RECEPTION</div>
              </div>
            </div>
            
            <div class="qr-container">
              ${qrSvg}
            </div>
            
            <div class="scan-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              SCAN WITH YOUR PHONE CAMERA
            </div>
            
            <div class="footer-section">
              <div class="footer-heading">WE'RE HERE FOR YOU</div>
              <div class="footer-sub">THANK YOU FOR CHOOSING ${hotel.name.toUpperCase()}</div>
              
              <div class="bottom-features">
                <div class="feature">
                  <div class="feature-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>
                  </div>
                  <div class="feature-text">100% QUALITY<br>ASSURED</div>
                </div>
                <div class="feature">
                  <div class="feature-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                  </div>
                  <div class="feature-text">SAFE &<br>HYGIENIC</div>
                </div>
                <div class="feature">
                  <div class="feature-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
                  </div>
                  <div class="feature-text">24x7<br>SUPPORT</div>
                </div>
              </div>
            </div>
          </div>
          <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 500); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  useEffect(() => {
    let unsub = () => {};
    if (auth) {
      unsub = onAuthStateChanged(auth, (user) => {
        if (!user) { router.push('/login'); return; }
        setUserId(user.uid);
        loadHotel(user.uid);
      });
    }
    return () => unsub();
  }, [router, loadHotel]);

  // Request FCM token and save to hotel
  useEffect(() => {
    if (!hotel?.id) return;
    const setupFCM = async () => {
      const token = await requestNotificationPermission();
      if (token) {
        const currentTokens = hotel.fcmTokens || [];
        if (!currentTokens.includes(token)) {
          const updatedTokens = [...currentTokens, token];
          try {
            await updateDoc(doc(db, 'hotels', hotel.id), { fcmTokens: updatedTokens });
          } catch (err) {
            console.error('Failed to save FCM token', err);
          }
        }
      }
    };
    setupFCM();
  }, [hotel?.id, userRole]);

  // Live orders listener
  useEffect(() => {
    if (!hotel?.id) return;
    const q = query(
      collection(db, 'orders'),
      where('hotelId', '==', hotel.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const orderList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setOrders(prev => {
        // Sound alert for new pending orders based on previous state
        const newPending = orderList.filter(o => o.status === 'pending').length;
        const oldPending = prev.filter(o => o.status === 'pending').length;
        if (newPending > oldPending) {
          audioRef.current?.play().catch(() => {});
        }
        return orderList;
      });
    }, (error) => {
      console.warn("Orders listener error:", error);
    });
    return unsub;
  }, [hotel?.id]);

  // Load team members
  useEffect(() => {
    if (!hotel?.id || userRole !== 'owner') return;
    const q = query(collection(db, 'users'), where('hotelId', '==', hotel.id));
    const unsub = onSnapshot(q, (snap) => {
      setStaffMembers(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    }, (error) => {
      console.warn("Staff listener error:", error);
    });
    return unsub;
  }, [hotel?.id, userRole]);

  const removeStaff = async (staffId: string) => {
    if (!window.confirm('Are you sure you want to remove this staff member?')) return;
    try {
      await updateDoc(doc(db, 'users', staffId), { hotelId: null, role: 'owner' }); // Reset to owner of no hotel
      showToast('Staff member removed.');
    } catch (err) {
      showToast('Failed to remove staff.');
    }
  };

  const updateStaffRole = async (staffId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', staffId), { role: newRole });
      showToast(`Role updated to ${newRole}.`);
    } catch (err) {
      showToast('Failed to update role.');
    }
  };

  const updateStaffName = async (staffId: string) => {
    if (!tempStaffName) return;
    try {
      await updateDoc(doc(db, 'users', staffId), { name: tempStaffName });
      setEditingStaffId(null);
      showToast('Name updated.');
    } catch (err) {
      showToast('Failed to update name.');
    }
  };

  const testTelegram = async () => {
    if (!hotel?.id || !hotel.telegramChatId) return;
    showToast('Sending test message...');
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotelId: hotel.id,
          type: 'service',
          roomNumber: 'TEST',
          guestName: 'System Test',
          service: 'Bot Connection Test ✅',
          isTest: true
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Test successful! Check Telegram.');
      } else {
        const errorDetail = data.details?.description || data.error || 'Failed to send';
        showToast(`❌ ${errorDetail}`);
        console.error('Telegram Debug:', data);
      }
    } catch (err) {
      showToast('❌ Connection failed.');
    }
  };

  const addStaffManual = async () => {
    if (!hotel?.id) { showToast('Hotel ID not found.'); return; }
    if (!newStaff.name || !newStaff.email) {
      showToast('Please enter Name and Email.');
      return;
    }
    
    // Auto-generate a secure 8-character password
    const genPass = Math.random().toString(36).slice(-8) + 'A1!';

    try {
      showToast('Creating staff account...');
      
      // 1. Call our custom API to create the Firebase Auth User
      const res = await fetch('/api/staff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newStaff.email,
          password: genPass,
          name: newStaff.name,
          hotelId: hotel.id,
          role: newStaff.role
        })
      });
      
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to create staff auth');
      }

      // 2. Save the user document in Firestore with the real UID returned from the API
      const staffData = {
        uid: data.uid,
        name: newStaff.name,
        email: newStaff.email,
        hotelId: hotel.id,
        role: newStaff.role || 'staff',
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', data.uid), staffData);
      
      setShowAddStaffModal(false);
      setNewStaff({ name: '', email: '', role: 'staff' });
      setCreatedStaffCreds({ email: newStaff.email, pass: genPass });
      showToast('Staff member added successfully!');
    } catch (err: any) {
      console.error('Error adding staff:', err);
      showToast(`Failed: ${err.message || 'Unknown error'}`);
    }
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    await updateDoc(doc(db, 'orders', orderId), { status });
    showToast('Order status updated!');
  };

  const guestUrl = typeof window !== 'undefined' && hotel
    ? `${window.location.origin}/hotel/${hotel.id}`
    : '';

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const itemCounts: Record<string, number> = {};
  orders.forEach(o => {
    if (o.type === 'food' && o.items) {
      o.items.forEach((item: string) => {
        const match = item.match(/^(.*?) x\d+/);
        const name = match ? match[1] : item;
        itemCounts[name] = (itemCounts[name] || 0) + 1;
      });
    }
  });
  const popularItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <span>🏨</span>
          <span>Hotel<span className="gradient-text">QR</span></span>
        </div>
        <div className={styles.hotelName}>{hotel?.name}</div>
        <nav className={styles.sideNav}>
          {[
            { id: 'overview', icon: '📊', label: 'Overview' },
            { id: 'analytics', icon: '📈', label: 'Analytics' },
            { id: 'orders', icon: '📋', label: 'Orders', badge: pendingCount },
            { id: 'rooms', icon: '🔑', label: 'Rooms' },
            { id: 'menu', icon: '🍽️', label: 'Menu', ownerOnly: true },
            { id: 'qr', icon: '📱', label: 'QR Code', ownerOnly: true },
            { id: 'team', icon: '👥', label: 'Team', ownerOnly: true },
            { id: 'settings', icon: '⚙️', label: 'Settings', ownerOnly: true },
          ].filter(item => {
            if (item.ownerOnly && userRole?.toLowerCase() !== 'owner') return false;
            return true;
          }).map(item => {
            const isLocked = ['analytics', 'rooms', 'team', 'orders', 'menu'].includes(item.id) && hotel?.plan === 'standard';
            return (
            <button
              key={item.id}
              className={`${styles.navItem} ${activeTab === item.id ? styles.navActive : ''}`}
              onClick={() => setActiveTab(item.id as TabType)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
              {isLocked && <span style={{ marginLeft: 'auto', fontSize: '0.9rem' }}>🔒</span>}
              {!isLocked && (item as any).badge ? <span className={styles.navBadge}>{(item as any).badge}</span> : null}
            </button>
            );
          })}
        </nav>
        {hotel?.plan === 'standard' && (
          <div style={{ padding: '16px', marginTop: 'auto' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #FFD700 0%, #D4AF37 100%)', color: '#000', border: 'none', fontWeight: 'bold' }}
              onClick={() => setActiveTab('analytics')}
            >
              👑 Upgrade Premium
            </button>
          </div>
        )}
        <button
          className={styles.logoutBtn}
          style={hotel?.plan === 'standard' ? { marginTop: '8px' } : {}}
          onClick={async () => { await signOut(auth); router.push('/'); }}
        >
          🚪 Sign Out
        </button>
      </aside>

      {/* ── Check-In Modal ── */}
      {checkInModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: '480px' }}>
            <h3 style={{ marginBottom: '6px', fontSize: '1.2rem' }}>
              🏨 Check In — Room {checkInModal.roomId}
            </h3>
            <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: '20px' }}>
              Fill guest details and send OTP to their phone to verify identity.
            </p>

            {/* Step 1: Guest Details */}
            <div className={styles.modalForm}>
              <div className="form-group">
                <label className="form-label">Guest Name *</label>
                <input className="form-input" placeholder="e.g. Ravi Shah" value={checkInForm.guestName}
                  onChange={e => setCheckInForm(f => ({ ...f, guestName: e.target.value }))}
                  disabled={otpSent} />
              </div>
              <div className="form-group">
                <label className="form-label">Mobile Number *</label>
                <input className="form-input" type="tel" placeholder="98765 43210" value={checkInForm.phone}
                  onChange={e => setCheckInForm(f => ({ ...f, phone: e.target.value }))}
                  disabled={otpSent} />
              </div>
            </div>

            {/* OTP Section */}
            <div style={{ marginTop: '16px', padding: '20px', background: 'var(--glass)', borderRadius: 'var(--r)', border: '1px solid var(--glass-b)' }}>
              {otpError && (
                <div style={{ color: 'var(--danger)', fontSize: '.82rem', marginBottom: '12px', fontWeight: 600 }}>
                  ⚠ {otpError}
                </div>
              )}

              {!otpSent ? (
                /* Step 1: Send OTP button */
                <div>
                  <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: '12px' }}>
                    🔐 An OTP will be sent to the guest&apos;s mobile number
                  </div>
                  <button className="btn btn-primary btn-sm"
                    disabled={!checkInForm.guestName || !checkInForm.phone || otpLoading}
                    onClick={sendOtp}>
                    {otpLoading ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} /> Sending...</> : '📱 Send OTP to Guest'}
                  </button>
                </div>
              ) : !otpVerified ? (
                /* Step 2: OTP sent — verify it */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '.85rem', color: 'var(--success)', fontWeight: 600 }}>
                      ✓ OTP sent to {checkInForm.phone}
                    </span>
                    <button style={{ fontSize: '.75rem', color: 'var(--mid)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => { setOtpSent(false); setOtpError(''); }}>
                      Change number
                    </button>
                  </div>

                  {/* DEV mode: show OTP on screen */}
                  {devOtp && (
                    <div style={{ background: 'rgba(234,179,8,.1)', border: '1px solid rgba(234,179,8,.3)', borderRadius: '8px', padding: '10px 14px', fontSize: '.8rem', color: '#ca8a04' }}>
                      ⚠ DEV MODE — OTP: <strong style={{ letterSpacing: '.15em', fontSize: '1.1rem' }}>{devOtp}</strong>
                      <br/><span style={{ fontSize: '.72rem' }}>Add FAST2SMS_API_KEY to .env.local for real SMS</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input className="form-input"
                      placeholder="Enter OTP from guest"
                      value={checkInForm.otp}
                      style={{ maxWidth: '180px', textAlign: 'center', letterSpacing: '.2em', fontWeight: 700, fontSize: '1.1rem' }}
                      onChange={e => setCheckInForm(f => ({ ...f, otp: e.target.value }))}
                      maxLength={6} />
                    <button className="btn btn-primary btn-sm"
                      disabled={checkInForm.otp.length < 4 || otpLoading}
                      onClick={verifyOtp}>
                      {otpLoading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Verify →'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 3: Verified */
                <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: '.95rem' }}>
                  ✓ Identity Verified — Ready to check in
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button className="btn btn-primary btn-sm"
                disabled={!checkInForm.guestName || !checkInForm.phone || !otpVerified}
                onClick={confirmCheckIn}>
                ✓ Confirm Check In
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setCheckInModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.pageTitle}>
            {activeTab === 'overview' && 'Dashboard Overview'}
            {activeTab === 'analytics' && 'Revenue & Analytics'}
            {activeTab === 'orders' && 'Live Orders'}
            {activeTab === 'rooms' && 'Room Management'}
            {activeTab === 'menu' && 'Menu Management'}
            {activeTab === 'qr' && 'Your QR Code'}
            {activeTab === 'settings' && 'Hotel Settings'}
            {activeTab === 'team' && 'Team Management'}
          </h1>
          <div className={styles.topbarRight}>
            <button className="btn btn-outline btn-sm" style={{ marginRight: '16px', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={async () => {
              const token = await requestNotificationPermission();
              if (token) setToast('Notifications Enabled Successfully!');
            }}>
              🔔 <span style={{ fontSize: '0.8rem' }}>Enable Notifications</span>
            </button>
            <button className="btn btn-ghost btn-sm" style={{ marginRight: '16px' }} onClick={() => window.open(guestUrl, '_blank')}>
              🔗 View Live Portal
            </button>
            <span className={styles.liveDot} />
            <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Live</span>
          </div>
        </div>

        {toast && <div className="toast toast-success">{toast}</div>}

        {/* ── Premium Locked Screen ── */}
        {['analytics', 'rooms', 'team', 'orders', 'menu'].includes(activeTab) && hotel?.plan === 'standard' && (
          <div className={styles.tabContent}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 20px', maxWidth: '500px', margin: '40px auto', background: 'var(--glass)', border: '1px solid var(--glass-b)', borderRadius: 'var(--r-lg)' }}>
              <div style={{ background: 'rgba(109,40,217,.1)', color: 'var(--mid)', fontSize: '3rem', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>👑</div>
              <h2 style={{ fontFamily: 'Outfit', fontSize: '1.8rem', marginBottom: '16px', color: 'var(--text)' }}>Unlock Premium Features</h2>
              <p style={{ color: 'var(--muted)', marginBottom: '32px', fontSize: '0.95rem', lineHeight: '1.5' }}>
                You need the Premium plan to access Food Orders, Room Management, Analytics, and Team Collaboration. Upgrade now for unlimited access at ₹7,999/year.
              </p>
              
              <div style={{ background: '#fff', padding: '16px', borderRadius: '16px', marginBottom: '16px' }}>
                <QRCode value={`upi://pay?pa=9652172595@axl&pn=Hotel%20SaaS&am=7999&cu=INR`} size={160} />
              </div>
              <h4 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>₹7,999 <span style={{fontSize: '0.9rem', color: 'var(--muted)', fontWeight: 400}}>per year</span></h4>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '24px' }}>UPI ID: <b>9652172595@axl</b></p>
              
              <div style={{ width: '100%', maxWidth: '300px', textAlign: 'left' }}>
                <label className="form-label">Transaction ID (UTR) *</label>
                <input 
                  className="form-input" 
                  placeholder="Enter 12-digit UTR number" 
                  value={upgradeUtr}
                  onChange={e => setUpgradeUtr(e.target.value)}
                />
              </div>
              {upgradeError && <div className="toast toast-error" style={{ position: 'static', marginTop: '16px', width: '100%', maxWidth: '300px', borderRadius: 'var(--r)' }}>{upgradeError}</div>}
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', maxWidth: '300px', marginTop: '16px', height: '48px', justifyContent: 'center' }}
                onClick={handleUpgrade}
                disabled={upgradeLoading}
              >
                {upgradeLoading ? <span className="spinner" /> : '✅ Verify & Upgrade'}
              </button>
            </div>
          </div>
        )}

        {/* ── Overview ── */}
        {activeTab === 'overview' && (
          <div className={styles.tabContent}>
            <div className={styles.statsRow}>
              {[
                { label: 'Total Orders', value: orders.length, icon: '📋' },
                { label: 'Pending', value: orders.filter(o => o.status === 'pending').length, icon: '⏳' },
                { label: 'In Progress', value: orders.filter(o => o.status === 'in-progress').length, icon: '🔄' },
                { label: 'Completed', value: orders.filter(o => o.status === 'done').length, icon: '✅' },
              ].map(stat => (
                <div key={stat.label} className={styles.statCard}>
                  <div className={styles.statIcon}>{stat.icon}</div>
                  <div className={styles.statValue}>{stat.value}</div>
                  <div className={styles.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>

            <div className={styles.recentOrders}>
              <h3 style={{ marginBottom: '16px', color: 'var(--text)' }}>Recent Orders</h3>
              {orders.length === 0 ? (
                <div className={styles.emptyState}>
                  <span style={{ fontSize: '3rem' }}>🎯</span>
                  <p>No orders yet. Share your QR code with guests!</p>
                  <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('qr')}>View QR Code →</button>
                </div>
              ) : (
                orders.slice(0, 5).map(order => <OrderRow key={order.id} order={order} onUpdate={updateOrderStatus} />)
              )}
            </div>

          </div>
        )}

        {/* ── Analytics ── */}
        {activeTab === 'analytics' && hotel?.plan !== 'standard' && (
          <div className={styles.tabContent}>
            <div className={styles.upgradeSection} style={{ marginTop: 0 }}>
              <div className={styles.upgradeCard}>
                <div className={styles.upgradeIcon}>📈</div>
                <div className={styles.upgradeContent}>
                  <h3>Revenue Dashboard</h3>
                  <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
                    <div style={{ background: 'var(--glass)', padding: '12px', borderRadius: '8px', flex: 1, border: '1px solid var(--glass-b)' }}>
                      <div style={{ fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Revenue</div>
                      <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)', marginTop: '4px' }}>₹{totalRevenue}</div>
                    </div>
                    <div style={{ background: 'var(--glass)', padding: '12px', borderRadius: '8px', flex: 1, border: '1px solid var(--glass-b)' }}>
                      <div style={{ fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Popular Items</div>
                      {popularItems.length > 0 ? popularItems.map(([name, count]) => (
                        <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem', marginBottom: '4px', color: 'var(--text)' }}>
                          <span>{name}</span>
                          <span style={{ fontWeight: 600 }}>{count}</span>
                        </div>
                      )) : <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>No items yet</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Orders ── */}
        {activeTab === 'orders' && hotel?.plan !== 'standard' && (
          <div className={styles.tabContent}>
            {orders.length === 0 ? (
              <div className={styles.emptyState}>
                <span style={{ fontSize: '3rem' }}>📭</span>
                <p>No orders yet. Guests will appear here after scanning your QR.</p>
              </div>
            ) : (
              <div className={styles.ordersList}>
                {orders.map(order => <OrderRow key={order.id} order={order} onUpdate={updateOrderStatus} expanded />)}
              </div>
            )}
          </div>
        )}

        {/* ── Room Management ── */}
        {activeTab === 'rooms' && hotel && hotel?.plan !== 'standard' && (
          <div className={styles.tabContent}>
            <div className={styles.roomsGrid}>
              {(hotel.rooms || []).length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No rooms defined yet. You can add them in Settings.</p>
                </div>
              ) : (
                (hotel.rooms || []).map(room => (
                  <div key={room.id} className={`${styles.roomCard} ${room.status === 'occupied' ? styles.roomOccupied : ''}`}>
                    <div className={styles.roomNumber}>Room {room.id}</div>
                    <div className={styles.roomStatus}>
                      <span className="status-dot" style={{ background: room.status === 'occupied' ? 'var(--danger)' : 'var(--success)' }} />
                      {room.status}
                    </div>
                    {room.status === 'occupied' ? (
                      <div className={styles.roomGuest}>
                        <div className={styles.guestName}>{room.guestName}</div>
                        {(room as any).phone && <div className={styles.checkInTime}>📞 {(room as any).phone}</div>}
                        <div className={styles.checkInTime}>In: {new Date(room.checkInTime!).toLocaleDateString()}</div>
                        <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: '12px' }} onClick={() => updateRoomStatus(room.id, 'empty')}>Check Out</button>
                      </div>
                    ) : (
                      <div className={styles.roomGuest}>
                        <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => {
                          setCheckInForm({ guestName: '', phone: '', otp: '' });
                          setOtpSent(false);
                          setOtpVerified(false);
                          setOtpError('');
                          setDevOtp('');
                          setCheckInModal({ roomId: room.id });
                        }}>Check In</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Menu Management ── */}
        {activeTab === 'menu' && hotel && userRole?.toLowerCase() === 'owner' && hotel?.plan !== 'standard' && (
          <div className={styles.tabContent}>
            <div className={styles.menuHeader}>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ Add New Item</button>
            </div>

            <div className={styles.menuGrid}>
              {MENU_CATS.filter(cat => hotel.menu.some(i => i.category === cat)).map(cat => (
                <div key={cat} className={styles.menuSection}>
                  <h3 className={styles.menuCatTitle}>{cat}</h3>
                  <div className={styles.menuItemsList}>
                    {hotel.menu.filter(i => i.category === cat).map(item => (
                      <div key={item.id} className={styles.menuItemCard}>
                        <div className={styles.menuItemMain}>
                          <div className={styles.menuItemName}>{item.name}</div>
                          <div className={styles.menuItemDesc}>{item.description}</div>
                        </div>
                        <div className={styles.menuItemActions}>
                          <span className={styles.menuItemPrice}>₹{item.price}</span>
                          <button className={styles.deleteBtn} onClick={() => deleteMenuItem(item.id)}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Item Modal */}
            {showAddModal && (
              <div className={styles.modalOverlay}>
                <div className={styles.modal}>
                  <h3>Add Menu Item</h3>
                  <div className={styles.modalForm}>
                    <div className="form-group">
                      <label className="form-label">Name</label>
                      <input className="form-input" placeholder="Dish Name" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Price (₹)</label>
                      <input className="form-input" type="number" placeholder="250" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <select className="form-input" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})}>
                        {MENU_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ gridColumn: '1/-1' }}>
                      <label className="form-label">Description</label>
                      <input className="form-input" placeholder="Brief description..." value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} />
                    </div>
                  </div>
                  <div className={styles.modalActions}>
                    <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={saveMenuItem}>Save Item</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── QR Code ── */}
        {activeTab === 'qr' && userRole === 'owner' && (
          <div className={styles.tabContent}>
            <div className={styles.qrSection}>
              <div className={styles.qrCard}>
                <div id="qr-printable" style={{ background: '#fff', padding: '24px', borderRadius: '16px', marginBottom: '24px', width: '100%' }}>
                  <div style={{ color: '#000', fontWeight: 800, fontSize: '1.2rem', marginBottom: '12px', textAlign: 'center' }}>{hotel?.name}</div>
                  <div className={styles.qrWrapper} style={{ background: '#fff', padding: 0 }}>
                    <QRCode id="hotel-qr" value={guestUrl} size={220} level="H" />
                  </div>
                  <div style={{ color: '#666', fontSize: '.7rem', textAlign: 'center', marginTop: '12px' }}>Scan for Room Service &amp; Dining</div>
                </div>
                
                <div className={styles.qrUrl}>
                  <span>{guestUrl}</span>
                </div>

                {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
                  <div className="toast toast-error" style={{ position: 'static', marginBottom: '20px', fontSize: '.8rem', width: '100%' }}>
                    ⚠️ <b>Local Dev Note:</b> This QR uses &apos;localhost&apos;. It won&apos;t work on your mobile phone unless you use your PC&apos;s network IP (e.g. 192.168.x.x) or deploy.
                  </div>
                )}

                <div className={styles.qrActions}>
                  <button className="btn btn-primary" onClick={downloadQR}>⬇ Download PNG</button>
                  <button className="btn btn-ghost" onClick={printTableCard}>🖨️ Print Card</button>
                  <button className="btn btn-ghost" onClick={() => { navigator.clipboard.writeText(guestUrl); showToast('Link copied!'); }}>📋 Copy Link</button>
                </div>
              </div>

              <div className={styles.qrInfo}>
                <h4 style={{ color: 'var(--text)', marginBottom: '16px' }}>Setup Guide:</h4>
                <div className={styles.qrTip}>
                  <div className={styles.qrTipNum}>1</div>
                  <div>
                    <strong>Print &amp; Place</strong>
                    <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Download the PNG or use &apos;Print Card&apos; to get a high-quality physical copy.</p>
                  </div>
                </div>
                <div className={styles.qrTip}>
                  <div className={styles.qrTipNum}>2</div>
                  <div>
                    <strong>Guest Scanning</strong>
                    <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Guests scan with their phone camera, enter their room number, and start ordering.</p>
                  </div>
                </div>
                <div className={styles.qrTip}>
                  <div className={styles.qrTipNum}>3</div>
                  <div>
                    <strong>Live Tracking</strong>
                    <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Requests pop up in your &apos;Orders&apos; tab instantly with a sound alert.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Settings ── */}
        {activeTab === 'settings' && hotel && userRole?.toLowerCase() === 'owner' && (
          <div className={styles.tabContent}>
            <div className={styles.settingsCard}>
              <h3 style={{ color: 'var(--text)', marginBottom: '20px' }}>Hotel Information</h3>
              <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: '1fr 1fr' }}>
                <InfoRow label="Hotel Name" value={hotel.name} />
                <InfoRow label="City" value={hotel.city} />
                <InfoRow label="Reception" value={hotel.phone} />
                <InfoRow label="Email" value={hotel.email || '—'} />
                <InfoRow label="Address" value={hotel.address} style={{ gridColumn: '1/-1' }} />
                <InfoRow label="Hotel ID" value={hotel.id} style={{ gridColumn: '1/-1', fontFamily: 'monospace', fontSize: '.8rem' }} />
              </div>
              <h3 style={{ color: 'var(--text)', margin: '28px 0 16px' }}>Active Services</h3>
              {!editingServices ? (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {hotel.services.map(s => (
                      <span key={s} className="badge">
                        {hotel.customServiceLabels?.[s] || s.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setServicesDraft([...hotel.services]); setEditingServices(true); }}>✏️ Edit Services</button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Toggle services on/off for your guests.</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {['room_service','housekeeping','laundry','spa','cab','wakeup','checkin','luggage','wifi','restaurant'].map(svc => {
                      const active = servicesDraft.includes(svc);
                      return (
                        <button
                          key={svc}
                          onClick={() => setServicesDraft(d => active ? d.filter(x => x !== svc) : [...d, svc])}
                          style={{
                            padding: '8px 16px', borderRadius: '100px', fontSize: '.82rem', fontWeight: 600,
                            background: active ? 'var(--grad)' : 'var(--glass)', border: active ? 'none' : '1px solid var(--glass-b)',
                            color: active ? '#fff' : 'var(--muted)', cursor: 'pointer', transition: 'all .2s'
                          }}
                        >
                          {svc.replace(/_/g, ' ')}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-primary btn-sm" onClick={saveServices}>Save Changes</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingServices(false)}>Cancel</button>
                  </div>
                </div>
              )}
              <div style={{ marginTop: '32px', padding: '24px', background: 'var(--glass)', borderRadius: 'var(--r-lg)', border: '1px solid var(--glass-b)' }}>
                <h3 style={{ color: 'var(--text)', marginBottom: '16px', fontSize: '1.1rem' }}>🔑 Room Management Setup</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: '16px' }}>
                  Update your list of rooms. Enter room numbers separated by commas.
                </p>
                <textarea 
                  className="form-input" 
                  style={{ minHeight: '80px', marginBottom: '16px', background: 'var(--bg2)' }}
                  placeholder="e.g. 101, 102, 103..."
                  defaultValue={(hotel.rooms || []).map(r => r.id).join(', ')}
                  id="room-list-input"
                />
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  const input = document.getElementById('room-list-input') as HTMLTextAreaElement;
                  const newIds = input.value.split(',').map(v => v.trim()).filter(v => v);
                  const existingRooms = hotel.rooms || [];
                  
                  // Map new IDs to existing room objects or create new ones
                  const updatedRooms = newIds.map(id => {
                    const existing = existingRooms.find(r => r.id === id);
                    return existing || { id, status: 'empty' as const };
                  });

                  try {
                    await updateDoc(doc(db, 'hotels', hotel.id), { rooms: updatedRooms });
                    setHotel({ ...hotel, rooms: updatedRooms });
                    showToast('Rooms updated successfully!');
                  } catch (err) {
                    showToast('Failed to update rooms.');
                  }
                }}>
                  Update Room List
                </button>
              </div>

              {/* ── Telegram Integration ── */}
              <div style={{ marginTop: '32px', padding: '24px', background: 'var(--glass)', borderRadius: 'var(--r-lg)', border: '1px solid var(--glass-b)' }}>
                <h3 style={{ color: 'var(--text)', marginBottom: '16px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📱</span> Telegram Notifications
                </h3>
                <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: '20px', lineHeight: '1.5' }}>
                  Get instant mobile alerts when a guest places an order or requests a service.
                </p>

                {!hotel.telegramChatId ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className={styles.qrTip} style={{ marginBottom: '8px' }}>
                      <div className={styles.qrTipNum} style={{ width: '24px', height: '24px', fontSize: '.75rem' }}>1</div>
                      <p style={{ fontSize: '.85rem', color: 'var(--text)' }}>
                        Search for <b>@HotelQR_Bot</b> on Telegram and send <b>/myid</b>
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input 
                        className="form-input" 
                        placeholder="Enter Chat ID (e.g. 123456789)" 
                        style={{ maxWidth: '240px' }}
                        value={telegramInput}
                        onChange={e => setTelegramInput(e.target.value)}
                      />
                      <button className="btn btn-primary btn-sm" onClick={() => updateTelegramId(telegramInput)} disabled={!telegramInput}>
                        Link Bot →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(34,197,94,.08)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(34,197,94,.2)' }}>
                    <div>
                      <div style={{ fontSize: '.8rem', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ✓ Connected to Telegram
                      </div>
                      <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: '4px' }}>
                        Chat ID: {hotel.telegramChatId}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button className="btn btn-primary btn-sm" onClick={testTelegram}>
                        Send Test Message ⚡
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => updateTelegramId('')}>
                        Disconnect
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '32px', padding: '20px', background: 'rgba(109,40,217,.08)', borderRadius: 'var(--r)', border: '1px solid rgba(109,40,217,.2)' }}>
                <p style={{ fontSize: '.9rem' }}>
                  🔧 Full settings editor (Menu & Info) is active. Use the Menu tab to manage your food items.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Team Management ── */}
        {activeTab === 'team' && userRole?.toLowerCase() === 'owner' && hotel?.plan !== 'standard' && (
          <div className={styles.tabContent}>
            <div className={styles.settingsCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h3 style={{ color: 'var(--text)', marginBottom: '8px' }}>Your Team</h3>
                  <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Manage staff members who have access to this dashboard.</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddStaffModal(true)}>
                  ➕ Add Staff Access
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  const botLink = `https://t.me/HotelQR_Bot`;
                  const msg = `Join our Hotel Staff Bot to receive live guest requests: ${botLink}\n\nAfter starting the bot, send your Chat ID to the manager.`;
                  const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
                  window.open(waUrl, '_blank');
                }}>
                  📢 Share Bot Link
                </button>
              </div>

              <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px dashed var(--glass-b)' }}>
                <p style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
                  💡 <b>Tip:</b> Use "Add Staff Access" to manually create a member. You can define custom roles like "Chef" or "Manager".
                </p>
              </div>

              <div className={styles.staffList}>
                {staffMembers.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No other team members yet.</p>
                  </div>
                ) : (
                  staffMembers.map(member => (
                    <div key={member.id} className={styles.staffRow} style={{ 
                      display: 'flex', alignItems: 'center', padding: '16px', 
                      background: 'var(--glass)', borderRadius: '12px', marginBottom: '10px',
                      border: '1px solid var(--glass-b)'
                    }}>
                      <div style={{ width: '40px', height: '40px', background: 'var(--grad)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, marginRight: '16px' }}>
                        {(member.name || 'U').charAt(0)}
                      </div>
                      <div style={{ flex: 1 }}>
                        {editingStaffId === member.id ? (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input 
                              className="form-input" 
                              style={{ height: '32px', fontSize: '.85rem' }} 
                              value={tempStaffName} 
                              onChange={e => setTempStaffName(e.target.value)} 
                              autoFocus
                            />
                            <button className="btn btn-primary btn-sm" onClick={() => updateStaffName(member.id)}>Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingStaffId(null)}>✕</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{member.name || 'Unnamed User'} {member.id === userId && '(You)'}</div>
                            {member.id !== userId && (
                              <button 
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.75rem', opacity: 0.5 }}
                                onClick={() => { setEditingStaffId(member.id); setTempStaffName(member.name || ''); }}
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                        )}
                        <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{(member as any).phone || member.email}</div>
                      </div>
                      
                      {member.id !== userId && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <input 
                            className="form-input" 
                            style={{ padding: '4px 8px', fontSize: '.75rem', width: '100px', height: '32px' }}
                            value={member.role}
                            onChange={(e) => updateStaffRole(member.id, e.target.value)}
                            placeholder="Role"
                          />
                          <button 
                            className="btn btn-ghost btn-sm" 
                            style={{ color: 'var(--danger)', padding: '4px 8px' }}
                            onClick={() => removeStaff(member.id)}
                          >
                            🗑️
                          </button>
                        </div>
                      )}

                      {member.id === userId && (
                        <div className="badge" style={{ textTransform: 'capitalize', background: member.role === 'owner' ? 'rgba(109,40,217,.1)' : 'rgba(255,255,255,.05)', color: member.role === 'owner' ? 'var(--grad-b)' : 'var(--muted)' }}>
                          {member.role}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add Staff Modal */}
        {showAddStaffModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <h3 style={{ color: 'var(--text)', marginBottom: '16px' }}>Add Staff Access</h3>
              <div className={styles.modalForm}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-input" placeholder="e.g. John Doe" value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-input" placeholder="e.g. staff@hotel.com" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role (Optional)</label>
                  <input className="form-input" placeholder="e.g. Reception, Chef, Manager" value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})} />
                </div>
              </div>
              <div className={styles.modalActions}>
                <button className="btn btn-ghost" onClick={() => setShowAddStaffModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={addStaffManual}>Grant Access →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Generated Credentials Modal ── */}
        {createdStaffCreds && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal} style={{ maxWidth: '400px', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>✅</div>
              <h3 style={{ marginBottom: '16px' }}>Staff Account Created!</h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
                Please give these login credentials to your staff member. They can log in at <b>yourdomain.com/login</b>
              </p>
              
              <div style={{ background: 'var(--bg2)', padding: '16px', borderRadius: 'var(--r-lg)', textAlign: 'left', marginBottom: '24px', border: '1px solid var(--glass-b)' }}>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Email</span>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text)' }}>{createdStaffCreds.email}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Password</span>
                  <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--mid)', letterSpacing: '2px' }}>{createdStaffCreds.pass}</div>
                </div>
              </div>

              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setCreatedStaffCreds(null)}>
                I have copied the credentials
              </button>
            </div>
          </div>
        )}
        <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3" preload="auto" />
      </main>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────

const MENU_CATS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Beverages', 'Desserts', 'Specials'];

function OrderRow({ order, onUpdate, expanded = false }: {
  order: Order;
  onUpdate: (id: string, status: Order['status']) => void;
  expanded?: boolean;
}) {
  const statusColors: Record<Order['status'], string> = {
    pending: 'var(--warning)',
    'in-progress': '#3b82f6',
    done: 'var(--success)',
  };

  return (
    <div className={styles.orderCard}>
      <div className={styles.orderHeader}>
        <div>
          <div className={styles.orderRoom}>Room {order.roomNumber}</div>
          <div className={styles.orderGuest}>{order.guestName}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="status-dot" style={{ background: statusColors[order.status], boxShadow: `0 0 8px ${statusColors[order.status]}` }} />
          <span style={{ fontSize: '.8rem', fontWeight: 600, color: statusColors[order.status], textTransform: 'capitalize' }}>
            {order.status.replace('-', ' ')}
          </span>
        </div>
      </div>
      {expanded && (
        <div className={styles.orderDetails}>
          <div className={styles.orderType}>{order.type === 'food' ? '🍽️ Food Order' : '⚙️ Service Request'}</div>
          {order.items && order.items.length > 0 && (
            <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: '8px' }}>
              {order.items.join(', ')}
            </div>
          )}
          {order.service && <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{order.service}</div>}
          {order.total && <div style={{ fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>Total: ₹{order.total}</div>}
        </div>
      )}
      <div className={styles.orderActions}>
        {order.status === 'pending' && (
          <button className="btn btn-ghost btn-sm" onClick={() => onUpdate(order.id, 'in-progress')}>Mark In Progress</button>
        )}
        {order.status === 'in-progress' && (
          <button className="btn btn-primary btn-sm" onClick={() => onUpdate(order.id, 'done')}>Mark Done ✓</button>
        )}
        {order.status === 'done' && (
          <span style={{ fontSize: '.82rem', color: 'var(--success)' }}>✓ Completed</span>
        )}
        <span style={{ fontSize: '.75rem', color: 'var(--muted)', marginLeft: 'auto' }}>
          {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

function InfoRow({ label, value, style }: { label: string; value: string; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <div style={{ fontSize: '.75rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

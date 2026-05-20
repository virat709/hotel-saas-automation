import { NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccountStr = process.env.FIREBASE_ADMIN_CREDENTIALS;
    if (serviceAccountStr) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountStr))
      });
    } else {
      console.warn("FIREBASE_ADMIN_CREDENTIALS is not set. Push notifications won't work.");
    }
  } catch (error) {
    console.error("Firebase Admin initialization error", error);
  }
}

// In-memory rate limiter: Max 15 requests per minute per hotelId
const notifyRateLimitStore = new Map<string, { count: number; windowStart: number }>();

function checkNotifyRateLimit(hotelId: string): boolean {
  const now = Date.now();
  const record = notifyRateLimitStore.get(hotelId);
  const WINDOW_MS = 60 * 1000; // 1 minute
  const MAX_REQS = 15;

  if (!record) {
    notifyRateLimitStore.set(hotelId, { count: 1, windowStart: now });
    return true;
  }

  if (now - record.windowStart > WINDOW_MS) {
    notifyRateLimitStore.set(hotelId, { count: 1, windowStart: now });
    return true;
  }

  if (record.count >= MAX_REQS) {
    return false;
  }

  notifyRateLimitStore.set(hotelId, { count: record.count + 1, windowStart: record.windowStart });
  return true;
}

export async function POST(req: Request) {
  try {
    const { hotelId, type, roomNumber, guestName, items, service, total } = await req.json();

    if (!hotelId) {
      return NextResponse.json({ error: 'Missing hotelId' }, { status: 400 });
    }

    if (!checkNotifyRateLimit(hotelId)) {
      return NextResponse.json({ error: 'Rate limit exceeded. Too many notifications sent recently.' }, { status: 429 });
    }

    // 1. Get hotel data (to find the telegramChatId)
    const hotelSnap = await getDoc(doc(db, 'hotels', hotelId));
    if (!hotelSnap.exists()) {
      return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
    }

    const hotelData = hotelSnap.data();
    const chatId = hotelData.telegramChatId;

    if (!chatId) {
      // Not an error, just means integration isn't set up yet
      return NextResponse.json({ status: 'No Telegram linked' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN is not set in environment variables');
      return NextResponse.json({ error: 'Notification service misconfigured' }, { status: 500 });
    }

    // 2. Format the message
    let message = '';
    if (type === 'food') {
      message = `🍱 *NEW FOOD ORDER*\n\n` +
                `🏨 *Hotel:* ${hotelData.name}\n` +
                `🔑 *Room:* ${roomNumber}\n` +
                `👤 *Guest:* ${guestName}\n` +
                `🍽️ *Items:*\n${items.map((i: string) => `• ${i}`).join('\n')}\n\n` +
                `💰 *Total:* ₹${total}\n` +
                `🕒 *Time:* ${new Date().toLocaleTimeString()}`;
    } else {
      message = `🛎️ *SERVICE REQUEST*\n\n` +
                `🏨 *Hotel:* ${hotelData.name}\n` +
                `🔑 *Room:* ${roomNumber}\n` +
                `👤 *Guest:* ${guestName}\n` +
                `🛠️ *Service:* ${service}\n\n` +
                `🕒 *Time:* ${new Date().toLocaleTimeString()}`;
    }

    // 3. Send FCM Push Notifications if configured
    let fcmSuccessCount = 0;
    let fcmFailureCount = 0;
    const fcmTokens = hotelData.fcmTokens || [];
    
    if (fcmTokens.length > 0 && admin.apps.length > 0) {
      const fcmPayload = {
        notification: {
          title: type === 'food' ? 'New Food Order 🍱' : 'New Service Request 🛎️',
          body: `Room ${roomNumber}: ${type === 'food' ? 'Food order' : service}`,
        },
        tokens: fcmTokens,
      };
      
      try {
        const response = await admin.messaging().sendEachForMulticast(fcmPayload);
        fcmSuccessCount = response.successCount;
        fcmFailureCount = response.failureCount;
      } catch (err) {
        console.error('FCM Send Error:', err);
      }
    }

    // 4. Send to Telegram (Supports multiple IDs separated by commas)
    const chatIds = chatId.split(',').map((id: string) => id.trim()).filter((id: string) => id);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const sendPromises = chatIds.map(async (id: string) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: id,
          text: message,
          parse_mode: 'Markdown',
        }),
      });
      return response.json();
    });

    const results = await Promise.all(sendPromises);
    const failures = results.filter(r => !r.ok);

    if (failures.length === chatIds.length && chatIds.length > 0) {
      console.error('All Telegram notifications failed:', failures);
      return NextResponse.json({ 
        error: 'All notifications failed. Please check if Chat IDs are correct and bot is started.',
        details: failures[0]
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      sentCount: chatIds.length - failures.length,
      failedCount: failures.length,
      fcmSent: fcmSuccessCount,
      fcmFailed: fcmFailureCount
    });
  } catch (error: any) {
    console.error('Notify API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

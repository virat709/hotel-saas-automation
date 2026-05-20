import { NextRequest, NextResponse } from 'next/server';

// Store OTPs in memory (in production, use Redis or Firestore with TTL)
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

// Simple in-memory rate limit store
const rateLimitStore = new Map<string, { count: number; lastReqTime: number }>();

function checkRateLimit(phone: string): { allowed: boolean; message?: string } {
  const now = Date.now();
  const record = rateLimitStore.get(phone);
  
  if (!record) {
    rateLimitStore.set(phone, { count: 1, lastReqTime: now });
    return { allowed: true };
  }

  // Block if less than 2 minutes since last request
  if (now - record.lastReqTime < 2 * 60 * 1000) {
    return { allowed: false, message: 'Please wait 2 minutes before requesting another OTP.' };
  }

  // Reset if more than 1 hour
  if (now - record.lastReqTime > 60 * 60 * 1000) {
    rateLimitStore.set(phone, { count: 1, lastReqTime: now });
    return { allowed: true };
  }

  // Max 5 per hour
  if (record.count >= 5) {
    return { allowed: false, message: 'Maximum OTP requests reached. Please try again in an hour.' };
  }

  rateLimitStore.set(phone, { count: record.count + 1, lastReqTime: now });
  return { allowed: true };
}

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Normalize phone: strip +91, spaces, dashes
    const cleanPhone = phone.replace(/\D/g, '').replace(/^91/, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return NextResponse.json({ error: 'Invalid Indian phone number' }, { status: 400 });
    }

    // Check Rate Limit
    const rateLimit = checkRateLimit(cleanPhone);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', details: rateLimit.message }, { status: 429 });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with 10-minute expiry
    otpStore.set(cleanPhone, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

    const apiKey = process.env.FAST2SMS_API_KEY;

    if (!apiKey || apiKey === 'YOUR_FAST2SMS_KEY') {
      // Dev mode: return OTP in response (NEVER do this in production)
      console.log(`[DEV] OTP for ${cleanPhone}: ${otp}`);
      return NextResponse.json({ success: true, dev: true, otp, message: 'DEV MODE: OTP logged to console' });
    }

    // Send SMS via Fast2SMS DLT route (for Indian numbers)
    const smsRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'q', // quick DLT route
        message: `Your hotel check-in OTP is ${otp}. Valid for 10 minutes. - V4Stay`,
        language: 'english',
        flash: 0,
        numbers: cleanPhone,
      }),
    });

    const smsData = await smsRes.json();

    if (!smsData.return) {
      console.error('Fast2SMS error:', smsData);
      return NextResponse.json({ error: 'SMS failed to send', details: smsData.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `OTP sent to +91 ${cleanPhone}` });

  } catch (err: any) {
    console.error('Send OTP error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { phone, otp } = await req.json();

    const cleanPhone = phone.replace(/\D/g, '').replace(/^91/, '').slice(-10);
    const stored = otpStore.get(cleanPhone);

    if (!stored) {
      return NextResponse.json({ valid: false, error: 'No OTP found. Please request a new one.' });
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(cleanPhone);
      return NextResponse.json({ valid: false, error: 'OTP has expired. Please request a new one.' });
    }

    if (stored.otp !== otp) {
      return NextResponse.json({ valid: false, error: 'Incorrect OTP. Please try again.' });
    }

    // OTP verified — remove it
    otpStore.delete(cleanPhone);
    return NextResponse.json({ valid: true, message: 'OTP verified successfully!' });

  } catch (err: any) {
    return NextResponse.json({ valid: false, error: 'Server error' }, { status: 500 });
  }
}

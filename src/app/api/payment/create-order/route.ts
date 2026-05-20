import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const PLAN_PRICES: Record<string, number> = {
  standard: 499900,  // ₹4,999 in paise
  premium: 999900,   // ₹9,999 in paise
  enterprise: 1999900, // ₹19,999 in paise
};

export async function POST(req: NextRequest) {
  try {
    const { plan, hotelName, email } = await req.json();

    if (!plan || !PLAN_PRICES[plan]) {
      return NextResponse.json({ error: 'Invalid plan selected.' }, { status: 400 });
    }

    const order = await razorpay.orders.create({
      amount: PLAN_PRICES[plan],
      currency: 'INR',
      receipt: `hotel_${Date.now()}`,
      notes: {
        plan,
        hotelName: hotelName || '',
        email: email || '',
      },
    });

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err: any) {
    console.error('Razorpay create-order error:', err);
    return NextResponse.json({ error: 'Failed to create payment order.' }, { status: 500 });
  }
}

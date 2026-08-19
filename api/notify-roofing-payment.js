import Stripe from 'stripe';
import { cardDetailsFromBody, cardDetailsFromPaymentIntent } from '../lib/stripe-card.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookUrl =
    process.env.ROOFING_MAKE_WEBHOOK_URL ||
    process.env.ENERGY_MAKE_WEBHOOK_URL ||
    'https://hook.us1.make.com/kv373lbaf143bg9f4k28878txn8znd2i';

  const body = req.body || {};
  const paymentId = typeof body.payment_id === 'string' ? body.payment_id.trim() : '';
  const status = body.status === 'succeeded' ? 'succeeded' : '';

  if (!paymentId || status !== 'succeeded') {
    return res.status(400).json({ error: 'Successful payment_id is required' });
  }

  const amount = Number.isFinite(Number(body.amount)) ? Number(body.amount) : 1031;

  let card = cardDetailsFromBody(body);
  if (!card.card_brand || !card.card_last4) {
    const secretKey = process.env.ROOFING_STRIPE_SECRET_KEY;
    if (secretKey) {
      const stripe = new Stripe(secretKey);
      card = await cardDetailsFromPaymentIntent(stripe, paymentId);
    } else {
      console.error('ROOFING_STRIPE_SECRET_KEY is not configured; cannot load card brand/last4');
    }
  }

  const payload = {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    address: typeof body.address === 'string' ? body.address.trim() : '',
    city: typeof body.city === 'string' ? body.city.trim() : '',
    state: typeof body.state === 'string' ? body.state.trim() : '',
    postal_code: typeof body.postal_code === 'string' ? body.postal_code.trim() : '',
    amount,
    currency: 'cad',
    division: 'roofing',
    payment_id: paymentId,
    card_brand: card.card_brand,
    card_last4: card.card_last4,
    payment_method: card.payment_method,
    status: 'succeeded',
    payment_status: 'succeeded',
  };

  try {
    const makeRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!makeRes.ok) {
      const text = await makeRes.text();
      console.error('Roofing Make webhook failed:', makeRes.status, text);
      return res.status(502).json({ error: 'Failed to send payment webhook' });
    }

    return res.status(200).json({ ok: true, card_brand: card.card_brand, card_last4: card.card_last4 });
  } catch (e) {
    console.error('notify-roofing-payment error:', e);
    return res.status(500).json({ error: e.message || 'Failed to send payment webhook' });
  }
}

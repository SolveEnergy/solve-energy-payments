import Stripe from 'stripe';
import { loadRoofingPrice } from '../lib/roofing-stripe.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secretKey = process.env.ROOFING_STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Roofing Stripe secret key is not configured' });
  }

  const { email, name, job_id, description } = req.body || {};

  try {
    const stripe = new Stripe(secretKey);
    const catalog = await loadRoofingPrice(stripe);

    if (!Number.isFinite(catalog.amountCents) || catalog.amountCents < 50) {
      return res.status(500).json({ error: 'Invalid Roofing payment amount configuration' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: catalog.amountCents,
      currency: catalog.currency,
      automatic_payment_methods: { enabled: true },
      receipt_email: typeof email === 'string' && email.includes('@') ? email.trim() : undefined,
      description: typeof description === 'string' && description.trim()
        ? description.trim()
        : catalog.productName,
      metadata: {
        source: 'solve-energy-payments',
        brand: 'solve-roofing',
        price_id: catalog.priceId,
        product_id: catalog.productId,
        product_name: catalog.productName,
        job_id: typeof job_id === 'string' ? job_id : '',
        customer_name: typeof name === 'string' ? name : '',
        customer_email: typeof email === 'string' ? email : '',
      },
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents: catalog.amountCents,
      currency: catalog.currency,
      productName: catalog.productName,
      productId: catalog.productId,
      priceId: catalog.priceId,
    });
  } catch (e) {
    console.error('roofing-create-payment-intent error:', e);
    return res.status(500).json({ error: e.message || 'Failed to create Roofing payment' });
  }
}

import Stripe from 'stripe';
import { loadRoofingPrice } from '../lib/roofing-stripe.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const publishableKey = process.env.ROOFING_STRIPE_PUBLISHABLE_KEY;
  const secretKey = process.env.ROOFING_STRIPE_SECRET_KEY;

  if (!publishableKey) {
    return res.status(500).json({ error: 'Roofing Stripe publishable key is not configured' });
  }
  if (!secretKey) {
    return res.status(500).json({ error: 'Roofing Stripe secret key is not configured' });
  }

  try {
    const stripe = new Stripe(secretKey);
    const catalog = await loadRoofingPrice(stripe);

    if (!Number.isFinite(catalog.amountCents) || catalog.amountCents < 50) {
      return res.status(500).json({ error: 'Invalid Roofing payment amount' });
    }

    return res.status(200).json({
      publishableKey,
      amountCents: catalog.amountCents,
      currency: catalog.currency,
      productName: catalog.productName,
      productId: catalog.productId,
      priceId: catalog.priceId,
    });
  } catch (e) {
    console.error('Failed to load Roofing Stripe price for config:', e);
    return res.status(500).json({ error: e.message || 'Failed to load Roofing Stripe price' });
  }
}

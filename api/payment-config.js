import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY
    || 'pk_live_51ScaVFENkL2uPjR2wfrpGCgDreVd1CSLHkZBvAZuiuukyFnPiEtXR3ElJEzACdMi50AsOHAIZmaKrDb0tBDM7F6Z00WpKrkz9c';
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const productIdFallback = process.env.STRIPE_PRODUCT_ID || 'prod_V3qNf5KztX5oWV';
  const productName = 'Total Deposit';

  if (!publishableKey) {
    return res.status(500).json({ error: 'Stripe publishable key is not configured' });
  }

  let amountCents = Number(process.env.PAYMENT_AMOUNT_CENTS || '103100');
  let currency = (process.env.PAYMENT_CURRENCY || 'cad').toLowerCase();
  let productId = productIdFallback;

  // Prefer live amount/currency from the Stripe Price when configured
  if (priceId && secretKey) {
    try {
      const stripe = new Stripe(secretKey);
      const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });

      if (price.unit_amount == null) {
        return res.status(500).json({ error: 'Stripe price must be a fixed one-time amount' });
      }

      amountCents = price.unit_amount;
      currency = (price.currency || currency).toLowerCase();

      // Keep display label as Total Deposit; only sync product id from Stripe.
      if (typeof price.product === 'object' && price.product && !price.product.deleted) {
        productId = price.product.id || productId;
      } else if (typeof price.product === 'string') {
        productId = price.product;
      }
    } catch (e) {
      console.error('Failed to load Stripe price for config:', e);
      return res.status(500).json({ error: e.message || 'Failed to load Stripe price' });
    }
  }

  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return res.status(500).json({ error: 'Invalid payment amount' });
  }

  return res.status(200).json({
    publishableKey,
    amountCents,
    currency,
    productName,
    productId,
    priceId: priceId || null,
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  });
}

import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const publishableKey = process.env.ROOFING_STRIPE_PUBLISHABLE_KEY;
  const secretKey = process.env.ROOFING_STRIPE_SECRET_KEY;
  const priceId = process.env.ROOFING_STRIPE_PRICE_ID;
  const productIdFallback = process.env.ROOFING_STRIPE_PRODUCT_ID || '';
  const productName = 'Total Deposit';

  if (!publishableKey) {
    return res.status(500).json({ error: 'Roofing Stripe publishable key is not configured' });
  }

  let amountCents = Number(process.env.ROOFING_PAYMENT_AMOUNT_CENTS || '0');
  let currency = (process.env.ROOFING_PAYMENT_CURRENCY || 'cad').toLowerCase();
  let productId = productIdFallback;

  if (priceId && secretKey) {
    try {
      const stripe = new Stripe(secretKey);
      const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });

      if (price.unit_amount == null) {
        return res.status(500).json({ error: 'Roofing Stripe price must be a fixed one-time amount' });
      }

      amountCents = price.unit_amount;
      currency = (price.currency || currency).toLowerCase();

      if (typeof price.product === 'object' && price.product && !price.product.deleted) {
        productId = price.product.id || productId;
      } else if (typeof price.product === 'string') {
        productId = price.product;
      }
    } catch (e) {
      console.error('Failed to load Roofing Stripe price for config:', e);
      return res.status(500).json({ error: e.message || 'Failed to load Roofing Stripe price' });
    }
  }

  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return res.status(500).json({ error: 'Invalid Roofing payment amount. Add ROOFING_STRIPE_PRICE_ID in Vercel.' });
  }

  return res.status(200).json({
    publishableKey,
    amountCents,
    currency,
    productName,
    productId,
    priceId: priceId || null,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Defaults: $1,031.00 CAD — "Solve Energy Project Deposit (New)"
  // Prefer Vercel env STRIPE_PUBLISHABLE_KEY; fallback is the live publishable key.
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY
    || 'pk_live_51ScaVFENkL2uPjR2wfrpGCgDreVd1CSLHkZBvAZuiuukyFnPiEtXR3ElJEzACdMi50AsOHAIZmaKrDb0tBDM7F6Z00WpKrkz9c';
  const amountCents = Number(process.env.PAYMENT_AMOUNT_CENTS || '103100');
  const currency = (process.env.PAYMENT_CURRENCY || 'cad').toLowerCase();
  const productName = process.env.PAYMENT_PRODUCT_NAME || 'Solve Energy Project Deposit (New)';
  const productId = process.env.STRIPE_PRODUCT_ID || 'prod_V3qNf5KztX5oWV';

  if (!publishableKey) {
    return res.status(500).json({ error: 'Stripe publishable key is not configured' });
  }

  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return res.status(500).json({ error: 'PAYMENT_AMOUNT_CENTS must be at least 50 (e.g. 103100 = $1,031.00)' });
  }

  return res.status(200).json({
    publishableKey,
    amountCents,
    currency,
    productName,
    productId,
  });
}

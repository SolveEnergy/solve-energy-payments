import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe secret key is not configured' });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  const productIdFallback = process.env.STRIPE_PRODUCT_ID || 'prod_V3qNf5KztX5oWV';
  const productNameFallback = process.env.PAYMENT_PRODUCT_NAME || 'Total Deposit';

  const { email, name, job_id, description } = req.body || {};

  try {
    const stripe = new Stripe(secretKey);

    let amountCents = Number(process.env.PAYMENT_AMOUNT_CENTS || '103100');
    let currency = (process.env.PAYMENT_CURRENCY || 'cad').toLowerCase();
    let productName = productNameFallback;
    let productId = productIdFallback;

    if (priceId) {
      const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });

      if (price.unit_amount == null) {
        return res.status(500).json({ error: 'Stripe price must be a fixed one-time amount' });
      }
      if (price.type && price.type !== 'one_time') {
        return res.status(500).json({ error: 'Stripe price must be a one-time price for deposits' });
      }

      amountCents = price.unit_amount;
      currency = (price.currency || currency).toLowerCase();

      if (typeof price.product === 'object' && price.product && !price.product.deleted) {
        productId = price.product.id || productId;
        if (price.product.name) productName = price.product.name;
      } else if (typeof price.product === 'string') {
        productId = price.product;
      }
    }

    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return res.status(500).json({ error: 'Invalid payment amount configuration' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      automatic_payment_methods: { enabled: true },
      receipt_email: typeof email === 'string' && email.includes('@') ? email.trim() : undefined,
      description: typeof description === 'string' && description.trim()
        ? description.trim()
        : productName,
      metadata: {
        source: 'solve-energy-payments',
        brand: 'solve-energy',
        price_id: priceId || '',
        product_id: productId,
        product_name: productName,
        job_id: typeof job_id === 'string' ? job_id : '',
        customer_name: typeof name === 'string' ? name : '',
        customer_email: typeof email === 'string' ? email : '',
      },
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents,
      currency,
      productName,
      productId,
      priceId: priceId || null,
    });
  } catch (e) {
    console.error('create-payment-intent error:', e);
    return res.status(500).json({ error: e.message || 'Failed to create payment' });
  }
}

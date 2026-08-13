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

  // Defaults: $1,031.00 CAD — "Solve Energy Project Deposit (New)" / prod_V3qNf5KztX5oWV
  const amountCents = Number(process.env.PAYMENT_AMOUNT_CENTS || '103100');
  const currency = (process.env.PAYMENT_CURRENCY || 'cad').toLowerCase();
  const productName = process.env.PAYMENT_PRODUCT_NAME || 'Total Deposit';
  const productId = process.env.STRIPE_PRODUCT_ID || 'prod_V3qNf5KztX5oWV';

  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return res.status(500).json({ error: 'Invalid payment amount configuration' });
  }

  const { email, name, job_id, description } = req.body || {};

  try {
    const stripe = new Stripe(secretKey);

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
    });
  } catch (e) {
    console.error('create-payment-intent error:', e);
    return res.status(500).json({ error: e.message || 'Failed to create payment' });
  }
}

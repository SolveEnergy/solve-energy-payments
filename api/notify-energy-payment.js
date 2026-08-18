import Stripe from 'stripe';

function formatAddress(addr) {
  if (!addr) return '';
  return [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookUrl =
    process.env.ENERGY_MAKE_WEBHOOK_URL ||
    'https://hook.us1.make.com/kv373lbaf143bg9f4k28878txn8znd2i';

  const body = req.body || {};
  const paymentId = typeof body.payment_id === 'string' ? body.payment_id.trim() : '';
  const status = body.status === 'succeeded' ? 'succeeded' : '';

  if (!paymentId || status !== 'succeeded') {
    return res.status(400).json({ error: 'Successful payment_id is required' });
  }

  let address = typeof body.address === 'string' ? body.address.trim() : '';
  let city = typeof body.city === 'string' ? body.city.trim() : '';
  let state = typeof body.state === 'string' ? body.state.trim() : '';
  let postalCode = typeof body.postal_code === 'string' ? body.postal_code.trim() : '';

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (secretKey) {
    try {
      const stripe = new Stripe(secretKey);
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentId, {
        expand: ['payment_method'],
      });
      const billingAddress = paymentIntent?.payment_method?.billing_details?.address;
      if (billingAddress) {
        address = formatAddress(billingAddress) || address;
        city = billingAddress.city || city;
        state = billingAddress.state || state;
        postalCode = billingAddress.postal_code || postalCode;
      }
    } catch (e) {
      console.error('Failed to load Stripe billing address:', e);
    }
  }

  const payload = {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    address,
    city,
    state,
    postal_code: postalCode,
    amount: 1031,
    currency: 'cad',
    division: 'solar',
    payment_id: paymentId,
    status: 'succeeded',
  };

  try {
    const makeRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!makeRes.ok) {
      const text = await makeRes.text();
      console.error('Energy Make webhook failed:', makeRes.status, text);
      return res.status(502).json({ error: 'Failed to send payment webhook' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('notify-energy-payment error:', e);
    return res.status(500).json({ error: e.message || 'Failed to send payment webhook' });
  }
}

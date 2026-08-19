import Stripe from 'stripe';

function formatCardPaymentMethod(card) {
  const brand = String(card && card.brand ? card.brand : '').trim().toUpperCase();
  const last4 = String(card && card.last4 ? card.last4 : '').trim();
  if (!brand || !last4) return '';
  return `${brand} - ${last4}`;
}

async function paymentMethodFromStripe(paymentId) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !paymentId) return '';
  try {
    const stripe = new Stripe(secretKey);
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId, {
      expand: ['payment_method', 'latest_charge'],
    });
    const pm = paymentIntent.payment_method;
    const charge = paymentIntent.latest_charge;
    const card = (pm && typeof pm === 'object' && pm.card)
      ? pm.card
      : (charge && typeof charge === 'object' && charge.payment_method_details && charge.payment_method_details.card)
        || null;
    return formatCardPaymentMethod(card);
  } catch (e) {
    console.error('Failed to load Stripe payment method for webhook:', e);
    return '';
  }
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

  let paymentMethod = typeof body.payment_method === 'string' ? body.payment_method.trim() : '';
  if (!paymentMethod) {
    paymentMethod = await paymentMethodFromStripe(paymentId);
  }

  const payload = {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim() : '',
    phone: typeof body.phone === 'string' ? body.phone.trim() : '',
    address: typeof body.address === 'string' ? body.address.trim() : '',
    city: typeof body.city === 'string' ? body.city.trim() : '',
    state: typeof body.state === 'string' ? body.state.trim() : '',
    postal_code: typeof body.postal_code === 'string' ? body.postal_code.trim() : '',
    amount: 1031,
    currency: 'cad',
    division: 'solar',
    payment_id: paymentId,
    status: 'succeeded',
    payment_method: paymentMethod,
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

export function cardDetailsFromCard(card) {
  const brand = String(card && (card.display_brand || card.brand) ? (card.display_brand || card.brand) : '')
    .trim()
    .toUpperCase();
  const last4 = String(card && card.last4 ? card.last4 : '').trim();
  return {
    card_brand: brand,
    card_last4: last4,
    payment_method: brand && last4 ? `${brand} - ${last4}` : '',
  };
}

const EMPTY = { card_brand: '', card_last4: '', payment_method: '' };

function firstCardDetails(...cards) {
  for (const card of cards) {
    const details = cardDetailsFromCard(card);
    if (details.payment_method) return details;
  }
  return { ...EMPTY };
}

function detailsFromStripeObject(obj) {
  if (!obj || typeof obj !== 'object') return { ...EMPTY };
  const methodDetails = obj.payment_method_details || obj;
  return firstCardDetails(
    obj.card,
    obj.card_present,
    obj.interac_present,
    methodDetails.card,
    methodDetails.card_present,
    methodDetails.interac_present,
    methodDetails.link,
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paymentMethodIdFrom(value) {
  if (typeof value === 'string' && value.startsWith('pm_')) return value;
  if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.startsWith('pm_')) {
    return value.id;
  }
  return '';
}

async function detailsFromPaymentMethodId(stripe, paymentMethodId) {
  if (!paymentMethodId) return { ...EMPTY };
  const method = await stripe.paymentMethods.retrieve(paymentMethodId);
  return detailsFromStripeObject(method);
}

async function cardDetailsOnce(stripe, paymentId, paymentMethodId) {
  const fromId = await detailsFromPaymentMethodId(stripe, paymentMethodId);
  if (fromId.payment_method) return fromId;

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentId, {
      expand: ['payment_method', 'latest_charge'],
    });
  } catch (e) {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  }

  const fromPmObject = detailsFromStripeObject(paymentIntent.payment_method);
  if (fromPmObject.payment_method) return fromPmObject;

  const pmId = paymentMethodIdFrom(paymentIntent.payment_method);
  const fromPmRetrieve = await detailsFromPaymentMethodId(stripe, pmId);
  if (fromPmRetrieve.payment_method) return fromPmRetrieve;

  let charge = paymentIntent.latest_charge;
  if (typeof charge === 'string' && charge) {
    charge = await stripe.charges.retrieve(charge);
  }
  const fromCharge = detailsFromStripeObject(charge);
  if (fromCharge.payment_method) return fromCharge;

  const charges = await stripe.charges.list({ payment_intent: paymentId, limit: 1 });
  const fromList = detailsFromStripeObject(charges.data && charges.data[0]);
  if (fromList.payment_method) return fromList;

  return { ...EMPTY };
}

export async function cardDetailsFromPaymentIntent(stripe, paymentId, paymentMethodId) {
  if (!stripe || !paymentId) return { ...EMPTY };

  try {
    let details = await cardDetailsOnce(stripe, paymentId, paymentMethodId);
    const waits = [700, 1200, 2000];
    for (let i = 0; i < waits.length && !details.payment_method; i += 1) {
      await sleep(waits[i]);
      details = await cardDetailsOnce(stripe, paymentId, paymentMethodId);
    }
    return details;
  } catch (e) {
    console.error('Failed to load Stripe card details for webhook:', e);
    return { ...EMPTY };
  }
}

export function paymentMethodIdFromBody(body) {
  const candidates = [body && body.payment_method_id, body && body.payment_method];
  for (const value of candidates) {
    const id = paymentMethodIdFrom(value);
    if (id) return id;
  }
  return '';
}

export function cardDetailsFromBody(body) {
  const paymentMethod = typeof body.payment_method === 'string' ? body.payment_method.trim() : '';
  let brand = typeof body.card_brand === 'string' ? body.card_brand.trim().toUpperCase() : '';
  let last4 = typeof body.card_last4 === 'string' ? body.card_last4.trim() : '';

  if ((!brand || !last4) && paymentMethod.includes(' - ') && !paymentMethod.startsWith('pm_')) {
    const parts = paymentMethod.split(' - ');
    brand = brand || String(parts[0] || '').trim().toUpperCase();
    last4 = last4 || String(parts[1] || '').trim();
  }

  if (brand && last4) {
    return { card_brand: brand, card_last4: last4, payment_method: `${brand} - ${last4}` };
  }
  if (paymentMethod && !paymentMethod.startsWith('pm_')) {
    return { card_brand: brand, card_last4: last4, payment_method: paymentMethod };
  }
  return { ...EMPTY };
}

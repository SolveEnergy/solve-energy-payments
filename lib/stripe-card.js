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

function firstCardDetails(...cards) {
  for (const card of cards) {
    const details = cardDetailsFromCard(card);
    if (details.payment_method) return details;
  }
  return { card_brand: '', card_last4: '', payment_method: '' };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cardDetailsOnce(stripe, paymentId) {
  const empty = { card_brand: '', card_last4: '', payment_method: '' };
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId, {
    expand: ['payment_method', 'latest_charge'],
  });

  const pm = paymentIntent.payment_method;
  if (pm && typeof pm === 'object') {
    const fromPm = firstCardDetails(pm.card, pm.card_present);
    if (fromPm.payment_method) return fromPm;
  }

  const pmId = typeof pm === 'string' ? pm : (pm && pm.id) || '';
  if (pmId) {
    const method = await stripe.paymentMethods.retrieve(pmId);
    const fromMethod = firstCardDetails(method.card, method.card_present);
    if (fromMethod.payment_method) return fromMethod;
  }

  let charge = paymentIntent.latest_charge;
  if (typeof charge === 'string' && charge) {
    charge = await stripe.charges.retrieve(charge);
  }
  if (charge && typeof charge === 'object' && charge.payment_method_details) {
    const details = charge.payment_method_details;
    const fromCharge = firstCardDetails(details.card, details.card_present);
    if (fromCharge.payment_method) return fromCharge;
  }

  const charges = await stripe.charges.list({ payment_intent: paymentId, limit: 1 });
  const listed = charges.data && charges.data[0] && charges.data[0].payment_method_details;
  if (listed) {
    const fromList = firstCardDetails(listed.card, listed.card_present);
    if (fromList.payment_method) return fromList;
  }

  return empty;
}

export async function cardDetailsFromPaymentIntent(stripe, paymentId) {
  const empty = { card_brand: '', card_last4: '', payment_method: '' };
  if (!stripe || !paymentId) return empty;

  try {
    let details = await cardDetailsOnce(stripe, paymentId);
    if (!details.payment_method) {
      await sleep(800);
      details = await cardDetailsOnce(stripe, paymentId);
    }
    return details;
  } catch (e) {
    console.error('Failed to load Stripe card details for webhook:', e);
    return empty;
  }
}

export function cardDetailsFromBody(body) {
  const paymentMethod = typeof body.payment_method === 'string' ? body.payment_method.trim() : '';
  let brand = typeof body.card_brand === 'string' ? body.card_brand.trim().toUpperCase() : '';
  let last4 = typeof body.card_last4 === 'string' ? body.card_last4.trim() : '';

  if ((!brand || !last4) && paymentMethod.includes(' - ')) {
    const parts = paymentMethod.split(' - ');
    brand = brand || String(parts[0] || '').trim().toUpperCase();
    last4 = last4 || String(parts[1] || '').trim();
  }

  if (brand && last4) {
    return { card_brand: brand, card_last4: last4, payment_method: `${brand} - ${last4}` };
  }
  if (paymentMethod) {
    return { card_brand: brand, card_last4: last4, payment_method: paymentMethod };
  }
  return { card_brand: '', card_last4: '', payment_method: '' };
}

// Yearly cost of a household electricity offer, from the normalized
// offers.json (prepare.py). Same rules as bill.py, which tests/compare.mjs
// uses as the reference. Variable offers pay an index (PUN) plus the
// supplier's spread; the index is the mean of the last 12 months
// (data.index.pun), an estimate, not the portal's forward prices.

// Assumed split of a household's use over the time bands, used when the
// visitor doesn't give their own (a bill shows it).
export const DEFAULT_SPLIT = { F1: 0.33, F2: 0.31, F3: 0.36 };

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Price for the first 12 months: intervals limited to fewer months weigh by them.
function firstYear(ivs) {
  const timed = ivs.filter((i) => i.months > 0 && i.months < 12);
  const rest = ivs.filter((i) => !(i.months > 0 && i.months < 12)).map((i) => i.price);
  if (!timed.length) return mean(rest);
  const used = timed.reduce((a, i) => a + Math.min(i.months, 12), 0);
  const later = rest.length ? mean(rest) : timed[timed.length - 1].price;
  return (timed.reduce((a, i) => a + Math.min(i.months, 12) * i.price, 0) + (12 - used) * later) / 12;
}

function bandWeights(bands, split) {
  if (bands === "01") return { "01": 1 };
  if (bands === "91") return { "01": split.F1, "91": split.F2 + split.F3 };
  if (bands === "03") return { "01": split.F1, "02": split.F2, "03": split.F3 };
  return null; // peak/off-peak or custom bands: not priced
}

export function availableIn(offer, region, province) {
  if (!offer.regions.length && !offer.provinces.length) return true; // all of Italy
  return offer.regions.includes(region) || (!!province && offer.provinces.includes(province));
}

export function fits(offer, kwh) {
  if (offer.kwhMin && kwh < offer.kwhMin) return false;
  if (offer.kwhMax && kwh > offer.kwhMax) return false;
  return true;
}

// Returns the yearly breakdown in €, or null when the offer can't be priced.
export function yearlyCost(offer, P, { kwh, kw, split = DEFAULT_SPLIT, pun }) {
  const w = bandWeights(offer.bands, split);
  if (!w) return null;
  if (offer.variable && !(pun > 0)) return null;
  const inTier = (i) => (i.from == null || kwh >= i.from) && (i.to == null || i.to === 0 || kwh <= i.to);

  let energy = 0, fixed = 0;
  for (const c of offer.components) {
    const ivs = c.intervals.filter(inTier);
    if (!ivs.length) continue;
    const unit = ivs[0].unit;
    if (unit === "03") { // €/kWh per band, network losses included
      const byBand = {};
      for (const i of ivs) (byBand[i.band] ??= []).push(i);
      const bands = Object.keys(byBand);
      if (bands.length === 1 && bands[0] === "01") energy += firstYear(byBand["01"]) * kwh;
      else if (Object.keys(w).every((b) => byBand[b])) {
        for (const [b, share] of Object.entries(w)) energy += firstYear(byBand[b]) * share * kwh;
      } else return null;
    } else if (unit === "01" || unit === "05") fixed += firstYear(ivs); // €/year, one-off €
    else if (unit === "02") fixed += firstYear(ivs) * kw;               // €/kW per year
    else return null;
  }

  // Network losses apply to the index only: the spread already includes them.
  if (offer.variable) energy += pun * (1 + P.lambda) * offer.coef * kwh;

  let dispatch = 0;
  for (const d of offer.dispatch) {
    if (["01", "02", "14"].includes(d.code)) dispatch = Math.max(dispatch, P.cdispd * kwh);
    else if (d.code === "99") dispatch += (d.value || 0) * kwh;
  }

  // A discount limited to fewer than 12 months counts for that share of the
  // year (not one-off ones); a tiered discount applies only the household's tier.
  let discountVat = 0, discountNoVat = 0;
  for (const s of offer.discounts) {
    if (!((s.from == null || kwh >= s.from) && (s.to == null || s.to === 0 || kwh <= s.to))) continue;
    const share = s.unit !== "05" && s.months > 0 && s.months < 12 ? s.months / 12 : 1;
    const amount = share * ({ "01": s.value, "05": s.value, "02": s.value * kw, "03": s.value * kwh,
                              "06": (s.value / 100) * (energy + fixed) }[s.unit] ?? 0);
    if (s.vat) discountVat += amount; else discountNoVat += amount;
  }

  const network = P.sigma1 + P.sigma2 * kw + P.sigma3 * kwh + P.uc6s_d * kw + P.uc6p_d * kwh;
  const system = (P.asos_dr + P.arim_dr) * kwh;
  const exempt = kw <= 3 && kwh / 12 <= 150; // residential ≤3 kW, ≤150 kWh/month
  const excise = exempt ? 0 : P.acc_c_r_l * kwh;
  const taxable = energy + fixed + dispatch + network + system + excise - discountVat;
  const vat = taxable * P.iva_c;
  const total = taxable + vat - discountNoVat;
  return { total, energy, fixed, dispatch, network, system, excise,
           discount: discountVat + discountNoVat, vat };
}

// Offers of one kind (fixed, or variable) for this household, cheapest
// first, malformed ones dropped.
export function rank(data, { kwh, kw, region, province, split, variable = false }) {
  const rows = [];
  for (const o of data.offers) {
    if (!!o.variable !== variable) continue;
    if (!fits(o, kwh) || !availableIn(o, region, province) || o.secondHome) continue;
    const c = yearlyCost(o, data.params, { kwh, kw, split, pun: data.index?.pun });
    if (!c || c.energy / kwh < 0.02 || c.energy / kwh > 1 || c.total <= 0) continue;
    rows.push({ offer: o, ...c });
  }
  return rows.sort((a, b) => a.total - b.total);
}

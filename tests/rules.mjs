// Hand-checked cases for single rules of site/calc.js, independent of the
// day's data. Run: node tests/rules.mjs
import assert from "node:assert/strict";
import { yearlyCost } from "../site/calc.js";

const P = { sigma1: 0, sigma2: 0, sigma3: 0, uc6s_d: 0, uc6p_d: 0, asos_dr: 0, arim_dr: 0,
            acc_c_r_l: 0, iva_c: 0, cdispd: 0, lambda: 0.1 };
const offer = (extra) => ({ bands: "01", components: [], dispatch: [], discounts: [], ...extra });
const spread = (price) => ({ name: "SPREAD", intervals: [{ unit: "03", band: "01", price, months: null }] });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

// Variable: index × (1 + losses) × coefficient, plus the spread (losses already in it).
near(yearlyCost(offer({ variable: true, coef: 1, components: [spread(0.02)] }), P, { kwh: 1000, kw: 3, pun: 0.1 }).energy,
     1000 * (0.1 * 1.1 + 0.02));
near(yearlyCost(offer({ variable: true, coef: 1.05, components: [spread(0)] }), P, { kwh: 1000, kw: 3, pun: 0.1 }).energy,
     1000 * 0.1 * 1.1 * 1.05);
// No index value: a variable offer can't be priced.
assert.equal(yearlyCost(offer({ variable: true, coef: 1, components: [spread(0.02)] }), P, { kwh: 1000, kw: 3 }), null);
// A fixed offer ignores the index.
near(yearlyCost(offer({ components: [spread(0.15)] }), P, { kwh: 1000, kw: 3, pun: 0.1 }).energy, 150);

// Discounts: one month of 0.12 €/kWh counts as 1/12 of the year.
const d = (x) => ({ unit: "03", value: 0.12, vat: true, months: null, from: null, to: null, ...x });
near(yearlyCost(offer({ components: [spread(0.15)], discounts: [d({ months: 1 })] }), P, { kwh: 1200, kw: 3 }).discount, 12);
// 12 months or more, or no duration: the whole year.
near(yearlyCost(offer({ components: [spread(0.15)], discounts: [d({ months: 30 })] }), P, { kwh: 1200, kw: 3 }).discount, 144);
// One-off € discounts are never scaled by months.
near(yearlyCost(offer({ components: [spread(0.15)], discounts: [d({ unit: "05", value: 50, months: 1 })] }), P, { kwh: 1200, kw: 3 }).discount, 50);
// Tiered: only the tier that contains the yearly consumption.
const tiers = [d({ value: 0.3, from: 0, to: 1000 }), d({ value: 0.1, from: 1001, to: 3000 })];
near(yearlyCost(offer({ components: [spread(0.15)], discounts: tiers }), P, { kwh: 2000, kw: 3 }).discount, 200);
near(yearlyCost(offer({ components: [spread(0.15)], discounts: tiers }), P, { kwh: 4000, kw: 3 }).discount, 0);

console.log("ok   rules: variable index, losses, coefficient, month-limited and tiered discounts");

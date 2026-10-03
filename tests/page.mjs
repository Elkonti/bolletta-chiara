// Smoke test for site/app.js without a browser: a tiny fake page, the day's
// offers.json, and checks on the rendered text. Run: node tests/page.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// Short failure messages: the rendered page is long.
const has = (html, re, yes = true) => assert.equal(re.test(html), yes, `${yes ? "missing" : "unexpected"}: ${re}`);

const data = JSON.parse(readFileSync(new URL("../site/data/offers.json", import.meta.url), "utf8"));
const affiliates = JSON.parse(readFileSync(new URL("../affiliates.json", import.meta.url), "utf8"));

async function page(dayData, kind) {
  const els = {};
  const el = (id) => (els[id] ??= { id, value: "", innerHTML: "", textContent: "", hidden: id === "kind" || id === "out",
    handlers: {}, addEventListener(t, f) { this.handlers[t] = f; }, remove() {} });
  Object.assign(el("kwh"), { value: "2700" }); Object.assign(el("kw"), { value: "3" });
  el("f").elements = { kind: { value: kind } };
  globalThis.document = { getElementById: el };
  globalThis.localStorage = { getItem: () => "03", setItem() {} };
  globalThis.location = { search: "", protocol: "http:" };
  globalThis.fetch = async (url) => ({ json: async () => (url.includes("offers") ? dayData : affiliates) });
  await import(`../site/app.js?${Math.random()}`);
  await new Promise((r) => setTimeout(r, 20));
  return els;
}

// Data with the PUN index: the choice shows, variable offers render as an estimate.
let p = await page(data, "variable");
assert.equal(p.kind.hidden, false, "price kind choice hidden although data has an index");
has(p.out.innerHTML, /offerte a prezzo variabile per 2\.?700 kWh in Lombardia/);
has(p.out.innerHTML, /<b>Stima\.<\/b>/);
has(p.out.innerHTML, /segue il PUN/);
has(p.out.innerHTML, /NaN|undefined|−?€\s*-/, false);

p = await page(data, "fixed");
has(p.out.innerHTML, /offerte a prezzo fisso per/);
has(p.out.innerHTML, /Stima\.|segue il PUN|NaN|undefined/, false);

// Old-format data (no index, as before the data builder update): fixed only, no choice.
const old = { ...data, index: undefined, offers: data.offers.filter((o) => !o.variable) };
p = await page(old, "variable");
assert.equal(p.kind.hidden, true);
has(p.out.innerHTML, /offerte a prezzo fisso per/);

console.log("ok   page: fixed/variable choice, estimate note, old data without index");

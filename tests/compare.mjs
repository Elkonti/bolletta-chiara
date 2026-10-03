// Checks that the website calculator (site/calc.js) gives the same yearly
// totals as the reference script (bill.py) for several households, for
// fixed offers and for variable (PUN) offers.
// Run: node tests/compare.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rank } from "../site/calc.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "site/data/offers.json"), "utf8"));
const cases = [
  { kwh: 2700, kw: 3, region: "03" },
  { kwh: 1500, kw: 3, region: "03" },
  { kwh: 1500, kw: 3, region: "03", province: "020" },
  { kwh: 4500, kw: 4.5, region: "12" },
  { kwh: 900, kw: 1.5, region: "02" },
  { kwh: 2700, kw: 3, region: "03", variable: true },
  { kwh: 1200, kw: 3, region: "15", variable: true },
  { kwh: 5000, kw: 6, region: "08", province: "037", variable: true },
];

let failed = 0;
for (const c of cases) {
  const args = ["bill.py", c.kwh, c.kw, c.region, ...(c.province ? [c.province] : [])].map(String);
  const env = { ...process.env, BILL_JSON: "1", BILL_KIND: c.variable ? "variable" : "fixed" };
  const ref = JSON.parse(execFileSync("python3", args, { cwd: root, env }));
  const got = Object.fromEntries(rank(data, c).map((r) => [r.offer.id, r.total]));
  const ids = new Set([...Object.keys(ref), ...Object.keys(got)]);
  const bad = [...ids].filter((id) => !(id in ref) || !(id in got) || Math.abs(ref[id] - got[id]) > 0.01);
  const label = `${c.variable ? "variable" : "fixed   "} ${c.kwh} kWh, ${c.kw} kW, region ${c.region}${c.province ? "/" + c.province : ""}`;
  if (bad.length) {
    failed++;
    console.log(`FAIL ${label}: ${bad.length} of ${ids.size} offers differ, e.g.`,
      bad.slice(0, 3).map((id) => `${id}: python ${ref[id]} js ${got[id]?.toFixed(2)}`));
  } else console.log(`ok   ${label}: ${ids.size} offers match`);
}
process.exit(failed ? 1 : 0);

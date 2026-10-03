// Reads the household's numbers from an electricity bill PDF, on the device:
// pdf.js (self-hosted in vendor/pdfjs) extracts the text, parseBill() finds
// the values. Nothing is uploaded. Loaded only when the visitor picks a file.

// Italian number: "2.345" or "2.345,6" or "3,5" or "4.5" (a dot before 1–2 digits is a decimal point).
function num(s) {
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", "."));
  return parseFloat(s.replace(",", "."));
}
const NUM = "(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)";
const nums = (s) => [...s.matchAll(new RegExp(NUM, "g"))].map((m) => num(m[1]));
const kwhValues = (s) => [...s.matchAll(new RegExp(NUM + "\\s*kwh", "gi"))].map((m) => num(m[1]));
const close = (a, b) => Math.abs(a - b) <= Math.max(1, b * 0.002);
const plausibleYear = (v) => v >= 50 && v <= 50000;

// Three numbers that add up to a fourth: band values and their total. Bills
// show the annual consumption as F1, F2, F3 and a total, but the order of the
// extracted text often doesn't follow the layout; the sum doesn't lie.
function bandsAndTotal(values) {
  for (const total of values) {
    if (!plausibleYear(total)) continue;
    const rest = values.filter((v) => v !== total && v > 0);
    for (let a = 0; a < rest.length; a++) for (let b = a + 1; b < rest.length; b++) for (let c = b + 1; c < rest.length; c++)
      if (close(rest[a] + rest[b] + rest[c], total)) return total;
  }
  return null;
}

// ARERA (Del. 315/2024/R/com, art. 5 and 8) requires the "consumo annuo" on
// every bill; suppliers word it differently.
const ANNUAL = /consumo annuo|consum[oi] (?:degli|negli) ultimi (?:12|dodici) mesi|consumo da inizio fornitura/gi;
// Dates, years and "12 mesi" are numbers too: drop them before looking.
const noise = (s) => s.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ").replace(/\b(?:12|18) mesi\b/gi, " ").replace(/\b(?:19|20)\d{2}\b/g, " ");
const lineAt = (t, i) => t.slice(i, t.indexOf("\n", i) < 0 ? t.length : t.indexOf("\n", i));

function annual(t) {
  const hits = [...t.matchAll(ANNUAL)].map((m) => m.index);
  // 1. One row: "Consumo annuo - kWh 475 355 670 1.500" (F1, F2, F3, total in reading order).
  for (const i of hits) {
    const v = nums(noise(lineAt(t, i)));
    if (v.length >= 4 && plausibleYear(v[3]) && close(v[0] + v[1] + v[2], v[3]))
      return { kwh: v[3], bands: { f1: v[0] / v[3], f2: v[1] / v[3] } };
  }
  // 2. A table around the label: band values and total among the nearby "n kWh". Band order unknown.
  for (const i of hits) {
    const total = bandsAndTotal(kwhValues(noise(t.slice(Math.max(0, i - 250), i + 300))));
    if (total) return { kwh: total, bands: null };
  }
  // 3. The first "n kWh" after the label (same or next lines).
  for (const i of hits) {
    const v = kwhValues(noise(t.slice(i, i + 200)))[0];
    if (v != null && plausibleYear(v)) return { kwh: v, bands: null };
  }
  return { kwh: null, bands: null };
}

// Contracted power: the first "n kW" (not kWh) within a few lines after the label.
function power(t) {
  for (const m of t.matchAll(/potenza (?:contrattualmente |contrattuale )?impegnata/gi)) {
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 160);
    const k = after.match(new RegExp(NUM + "\\s*kw(?!h)", "i")) || after.match(new RegExp("^\\s*\\(kw\\)[^\\d\\n]{0,20}" + NUM, "i"));
    if (k && num(k[1]) >= 0.5 && num(k[1]) <= 30) return num(k[1]);
  }
  return null;
}

// Band shares written plainly on one line each: "F1 210 kWh" (or F1 and F23).
function plainBands(t) {
  const band = (name) => {
    const m = t.match(new RegExp(`\\b${name}\\b[^\\d\\n]{0,30}?${NUM}\\s*kwh`, "i"));
    return m ? num(m[1]) : null;
  };
  const f1 = band("F1"), f2 = band("F2"), f3 = band("F3"), f23 = band("F23");
  if (f1 != null && f2 != null && f3 != null && f1 + f2 + f3 > 0) return { f1: f1 / (f1 + f2 + f3), f2: f2 / (f1 + f2 + f3) };
  if (f1 != null && f23 != null && f1 + f23 > 0) return { f1: f1 / (f1 + f23), f2: null };
  return null;
}

// What we could read, or null for each value we couldn't.
export function parseBill(text) {
  const t = text.replace(/ /g, " ").replace(/[ \t]+/g, " ");
  const a = annual(t);
  return { kwh: a.kwh, kw: power(t), bands: a.bands || plainBands(t) };
}

// PDF bytes → text, via the self-hosted pdf.js. Only the first 4 pages: the
// summary that ARERA requires is at the front.
export async function pdfText(data, base = new URL("vendor/pdfjs/", import.meta.url).href) {
  const pdfjs = await import(base + "pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  const lines = [];
  for (let n = 1; n <= Math.min(doc.numPages, 4); n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let line = "";
    for (const item of content.items) {
      line += item.str;
      if (item.hasEOL) { lines.push(line); line = ""; } else if (item.str) line += " ";
    }
    if (line) lines.push(line);
  }
  await doc.destroy();
  return lines.join("\n");
}

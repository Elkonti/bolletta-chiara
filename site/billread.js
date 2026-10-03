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

// Region (ISTAT code, as in the form) from the supply address: the province
// abbreviation after the town is exact; the postcode's first two digits are
// the fallback. Only the supply address (where the electricity is used), not
// the billing address.
const PROVINCES = {
  "01": "TO VC NO CN AT AL BI VB", "02": "AO", "03": "VA CO SO MI BG BS PV CR MN LC LO MB", "04": "BZ TN",
  "05": "VR VI BL TV VE PD RO", "06": "UD GO TS PN", "07": "IM SV GE SP", "08": "PC PR RE MO BO FE RA FC RN",
  "09": "MS LU PT FI LI PI AR SI GR PO", "10": "PG TR", "11": "PU AN MC AP FM", "12": "VT RI RM LT FR",
  "13": "AQ TE PE CH", "14": "CB IS", "15": "CE BN NA AV SA", "16": "FG BA TA BR LE BT", "17": "PZ MT",
  "18": "CS CZ RC KR VV", "19": "TP PA ME AG CL EN CT RG SR", "20": "SS NU CA OR SU OT OG VS CI",
};
const BY_PROVINCE = Object.fromEntries(Object.entries(PROVINCES).flatMap(([r, ps]) => ps.split(" ").map((p) => [p, r])));
const CAP_PREFIX = {
  "00": "12", "01": "12", "02": "12", "03": "12", "04": "12", "05": "10", "06": "10", "07": "20", "08": "20", "09": "20",
  "10": "01", "11": "02", "12": "01", "13": "01", "14": "01", "15": "01", "16": "07", "17": "07", "18": "07", "19": "07",
  "20": "03", "21": "03", "22": "03", "23": "03", "24": "03", "25": "03", "26": "03", "27": "03", "28": "01", "29": "08",
  "30": "05", "31": "05", "32": "05", "33": "06", "34": "06", "35": "05", "36": "05", "37": "05", "38": "04", "39": "04",
  "40": "08", "41": "08", "42": "08", "43": "08", "44": "08", "45": "05", "46": "03", "47": "08", "48": "08",
  "50": "09", "51": "09", "52": "09", "53": "09", "54": "09", "55": "09", "56": "09", "57": "09", "58": "09", "59": "09",
  "60": "11", "61": "11", "62": "11", "63": "11", "64": "13", "65": "13", "66": "13", "67": "13",
  "70": "16", "71": "16", "72": "16", "73": "16", "74": "16", "75": "17", "76": "16",
  "80": "15", "81": "15", "82": "15", "83": "15", "84": "15", "85": "17", "86": "14", "87": "18", "88": "18", "89": "18",
  "90": "19", "91": "19", "92": "19", "93": "19", "94": "19", "95": "19", "96": "19", "97": "19", "98": "19",
};
function region(t) {
  for (const m of t.matchAll(/(?:indirizzo|punto) di fornitura|indirizzo della fornitura|luogo di fornitura/gi)) {
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 160);
    const a = after.match(/\b(\d{5})\s+[A-Za-zÀ-ÿ'. -]{2,40}?\s*\(?\b([A-Z]{2})\b\)?/);
    const cap = a?.[1] ?? after.match(/\b(\d{5})\b/)?.[1];
    if (!cap || /^0+$/.test(cap)) continue; // "00000" is a placeholder, not a postcode
    return BY_PROVINCE[a?.[2]] ?? CAP_PREFIX[cap.slice(0, 2)] ?? null;
  }
  return null;
}

// What we could read, or null for each value we couldn't.
export function parseBill(text) {
  const t = text.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
  const a = annual(t);
  return { kwh: a.kwh, kw: power(t), bands: a.bands || plainBands(t), region: region(t) };
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

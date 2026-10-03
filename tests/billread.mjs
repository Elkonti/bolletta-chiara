// Bill reading: label variants and number formats (text), and one synthetic
// PDF end to end through the self-hosted pdf.js. Run: node tests/billread.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { parseBill, pdfText } from "../site/billread.js";

const near = (a, b) => assert.ok(a != null && Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);

let r = parseBill("Consumo annuo: 2.345 kWh\nPotenza impegnata 3 kW");
assert.equal(r.kwh, 2345); assert.equal(r.kw, 3);
r = parseBill("Consumi degli ultimi 12 mesi 1.980,5 kWh\nPotenza contrattualmente impegnata: 4,5 kW");
assert.equal(r.kwh, 1980.5); assert.equal(r.kw, 4.5);
r = parseBill("Consumo annuo (kWh) 900 kWh\nPotenza impegnata (kW) 1.5");
assert.equal(r.kwh, 900); assert.equal(r.kw, 1.5);
// Power: "disponibile" is not the contracted power; the label must say impegnata.
assert.equal(parseBill("Potenza disponibile 3,3 kW").kw, null);
// Values out of range are ignored (e.g. a POD or a total read as kWh).
assert.equal(parseBill("Consumo annuo 12345678 kWh").kwh, null);
// Bills often put the value on the next line.
assert.equal(parseBill("Consumo Annuo Aggiornato\n2358 kWh (da inizio fornitura al 31/08/2025)").kwh, 2358);
// Dates and "12 mesi" near the label are not consumption.
assert.equal(parseBill("Consumo annuo (dal 01/09/2023 al 31/08/2024)\n*somma dei consumi negli ultimi 12 mesi").kwh, null);

// Layouts of real bills (structure and numbers of public sample bills).
// Enel 2025: table text out of order; the total is found by the band sum.
r = parseBill("F2 F3 Totale consumo\n800 kWh 1.074 kWh 2.787 kWh\nConsumo annuo* (dal 01/09/2023 al 31/08/2024)\nF1\n913 kWh\n" +
              "*somma dei consumi negli ultimi 12 mesi\nPOD: POTENZA IMPEGNATA:\n5,0 kW\nINDIRIZZO DI FORNITURA:\nVIA TANARO 35 00040 ARDEA RM");
assert.equal(r.kwh, 2787); assert.equal(r.kw, 5); assert.equal(r.bands, null);
// Edison (Bolletta 2.0): one row F1 F2 F3 total.
r = parseBill("Potenza impegnata: 3 kW\nPotenza disponibile: 3,3 kW\nConsumi fatturati (energia attiva) - kWh 200 100 100 400\nConsumo annuo - kWh 475 355 670 1.500");
assert.equal(r.kwh, 1500); assert.equal(r.kw, 3); near(r.bands.f1, 475 / 1500); near(r.bands.f2, 355 / 1500);
// Facile Energy 2025: power a few lines below its label, after an address.
r = parseBill("Potenza impegnata\nQuota per consumi\nQuota fissa e quota potenza VIA XXXXXXX, 00 - 00000\nCITTÀ (XX)\n4 kW per 1 mese\n" +
              "Consumi fatturati 180 kWh 31/08/2025\nConsumo Annuo Aggiornato\n2358 kWh (da inizio fornitura al 31/08/2025)");
assert.equal(r.kwh, 2358); assert.equal(r.kw, 4);
// Bands: shares from F1/F2/F3, or F1/F23.
r = parseBill("F1 100 kWh F2 100 kWh F3 200 kWh");
near(r.bands.f1, 0.25); near(r.bands.f2, 0.25);
r = parseBill("F1 300 kWh\nF23 700 kWh");
near(r.bands.f1, 0.3); assert.equal(r.bands.f2, null);
assert.equal(parseBill("nessun dato").bands, null);

// Region from the supply address: province abbreviation, else postcode.
assert.equal(parseBill("INDIRIZZO DI FORNITURA:\nVIA TANARO 35 00040 ARDEA RM").region, "12");
assert.equal(parseBill("Punto di fornitura VIA LEMMI 70\n20100 MILANO MI").region, "03");
assert.equal(parseBill("Indirizzo di fornitura: Via Roma 1, 39100 Bolzano (BZ)").region, "04");
assert.equal(parseBill("Indirizzo di fornitura: Via Roma 1, 98122 Messina").region, "19");   // no abbreviation: postcode
assert.equal(parseBill("Indirizzo di fornitura VIA XXXXXXX, 00 - 00000 CITTÀ (XX)").region, null); // placeholder
assert.equal(parseBill("Recapito: Via Roma 1, 20100 Milano MI").region, null);                // not the supply address

// End to end: synthetic one-page PDF (tests/fixtures, made with tests/makepdf.py).
const pdf = new Uint8Array(readFileSync(new URL("fixtures/bolletta-sintetica.pdf", import.meta.url)));
const text = await pdfText(pdf, new URL("../site/vendor/pdfjs/", import.meta.url).href);
r = parseBill(text);
assert.equal(r.kwh, 2345); assert.equal(r.kw, 3);
near(r.bands.f1, 210 / 620); near(r.bands.f2, 180 / 620);
assert.equal(r.region, "03"); // 25121 Brescia BS

console.log("ok   billread: labels, number formats, bands, region, real layouts, synthetic PDF");

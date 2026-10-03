// Builds the static pages search engines index: one page per region with the
// real yearly cost of the cheapest fixed-price offers, plus sitemap.xml and
// robots.txt. Uses the same calculator as the website (site/calc.js).
// Usage: node render.mjs <offers.json> <output dir>   (SITE_URL sets absolute links)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { rank } from "./site/calc.js";

const [offersPath = "site/data/offers.json", outDir = "site"] = process.argv.slice(2);
const SITE = (process.env.SITE_URL || "http://168.119.162.166").replace(/\/$/, "");
const data = JSON.parse(readFileSync(offersPath, "utf8"));
const affiliates = JSON.parse(readFileSync(new URL("./affiliates.json", import.meta.url), "utf8"));
const disclosure = Object.keys(affiliates.suppliers).length ? affiliates.disclosureWithLinks : affiliates.disclosure;

export const REGIONS = [["01","Piemonte","piemonte"],["02","Valle d'Aosta","valle-d-aosta"],["03","Lombardia","lombardia"],
  ["04","Trentino-Alto Adige","trentino-alto-adige"],["05","Veneto","veneto"],["06","Friuli-Venezia Giulia","friuli-venezia-giulia"],
  ["07","Liguria","liguria"],["08","Emilia-Romagna","emilia-romagna"],["09","Toscana","toscana"],["10","Umbria","umbria"],
  ["11","Marche","marche"],["12","Lazio","lazio"],["13","Abruzzo","abruzzo"],["14","Molise","molise"],["15","Campania","campania"],
  ["16","Puglia","puglia"],["17","Basilicata","basilicata"],["18","Calabria","calabria"],["19","Sicilia","sicilia"],["20","Sardegna","sardegna"]];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (v) => Math.round(v).toLocaleString("it-IT") + " €";
const kwhPrice = (v) => v.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const date = new Date(data.date);
const monthYear = date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
const dayText = date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
const link = (u) => !u ? "" : (/^https?:\/\//i.test(u) ? u : "https://" + u);

// Where an offer's button goes: the supplier's affiliate link when we have one
// (marked as such), else the supplier's own page. Never changes the order.
export function offerLink(o) {
  const a = affiliates.suppliers[o.id.split("/")[0]];
  return a ? { href: a.url, paid: true } : { href: link(o.url || o.site), paid: false };
}

const PROFILES = [[1500, "Single o coppia, pochi elettrodomestici"], [2700, "Famiglia tipo (dato ARERA)"], [4000, "Famiglia numerosa o pompa di calore"]];

function page([code, name, slug]) {
  const rows = rank(data, { kwh: 2700, kw: 3, region: code });
  if (!rows.length) return null;
  const median = rows[Math.floor((rows.length - 1) / 2)].total;
  const profiles = PROFILES.map(([kwh, who]) => {
    const r = rank(data, { kwh, kw: 3, region: code });
    return `<tr><td>${kwh.toLocaleString("it-IT")} kWh<br><small>${who}</small></td><td>${eur(r[0].total)}</td><td>${eur(r[Math.floor((r.length - 1) / 2)].total)}</td></tr>`;
  }).join("");
  const top = rows.slice(0, 15).map((r, i) => {
    const l = offerLink(r.offer);
    return `<tr><td>${i + 1}</td><td><a href="${esc(l.href)}" rel="${l.paid ? "sponsored noopener" : "noopener nofollow"}" target="_blank">${esc(r.offer.name)}</a>${l.paid ? ' <small class="paid">link con commissione</small>' : ""}<br><small>${esc((r.offer.site || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, ""))}</small></td><td>${eur(r.total)}</td><td>${kwhPrice(r.total / 2700)}</td></tr>`;
  }).join("");
  const title = `Offerte luce a prezzo fisso in ${name}: costo reale in un anno (${monthYear})`;
  const desc = `In ${name} l'offerta luce a prezzo fisso più conveniente costa ${eur(rows[0].total)} all'anno per 2.700 kWh, tasse e oneri inclusi. Confronto di ${rows.length} offerte, aggiornato ogni giorno.`;
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/luce/${slug}/"><link rel="stylesheet" href="../../page.css">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Dataset", name: title, description: desc,
  dateModified: data.date, isBasedOn: "https://www.ilportaleofferte.it/portaleOfferte/it/open-data.page", creator: { "@type": "Organization", name: "Bolletta Chiara" } })}</script>
</head><body><main>
<p class="crumb"><a href="../../">Bolletta Chiara</a> › Luce › ${esc(name)}</p>
<h1>Offerte luce a prezzo fisso in ${esc(name)}</h1>
<p class="lead">Il ${dayText}, per una famiglia tipo (2.700 kWh l'anno, 3 kW, residente) l'offerta più conveniente costa <b>${eur(rows[0].total)}</b> in un anno, tutto incluso. A metà classifica si spendono ${eur(median)}: <b>${eur(median - rows[0].total)}</b> in più.</p>
<p><a class="cta" href="../../?regione=${code}">Calcola con i tuoi consumi</a></p>
<h2>Quanto si spende in un anno</h2>
<div class="tw"><table><thead><tr><th>Consumo annuo</th><th>Offerta migliore</th><th>Offerta tipica</th></tr></thead><tbody>${profiles}</tbody></table></div>
<h2>Le 15 offerte più convenienti per 2.700 kWh</h2>
<div class="tw"><table><thead><tr><th>#</th><th>Offerta</th><th>€ / anno</th><th>€ / kWh</th></tr></thead><tbody>${top}</tbody></table></div>
<p class="small">Totali con IVA, accise, oneri di sistema, trasporto e dispacciamento, primi 12 mesi. Sconti con condizioni esclusi. ${rows.length} offerte a prezzo fisso disponibili in ${esc(name)}.</p>
<h2>Cosa c'è dentro la bolletta</h2>
<p>Il prezzo pubblicizzato copre solo l'energia. Sopra si pagano la quota fissa del fornitore, il trasporto e la gestione del contatore, gli oneri di sistema, il dispacciamento, le accise (zero per i residenti fino a 3 kW e 1.800 kWh l'anno) e l'IVA al 10%. Per questo il costo reale per kWh è circa il doppio del prezzo dell'energia.</p>
<footer><p>Dati: open data del <a href="https://www.ilportaleofferte.it/portaleOfferte/it/open-data.page" rel="noopener">Portale Offerte di ARERA</a> del ${dayText}. Bolletta Chiara non è collegata ad ARERA. ${disclosure}</p>
<p>Altre regioni: ${REGIONS.filter((r) => r[0] !== code).map(([, n, s]) => `<a href="../${s}/">${esc(n)}</a>`).join(" · ")}</p></footer>
</main></body></html>`;
}

const urls = [`${SITE}/`];
for (const r of REGIONS) {
  const html = page(r);
  if (!html) continue;
  mkdirSync(join(outDir, "luce", r[2]), { recursive: true });
  writeFileSync(join(outDir, "luce", r[2], "index.html"), html);
  urls.push(`${SITE}/luce/${r[2]}/`);
}
writeFileSync(join(outDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${u}</loc><lastmod>${data.date}</lastmod></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`${urls.length - 1} region pages + sitemap → ${outDir}`);

// Page logic: form, ranking, rendering. Loaded as a file so the strict
// Content-Security-Policy (no inline scripts) can stay on.
import { rank, DEFAULT_SPLIT } from "./calc.js";

const REGIONS = [["01","Piemonte"],["02","Valle d'Aosta"],["03","Lombardia"],["04","Trentino-Alto Adige"],["05","Veneto"],
  ["06","Friuli-Venezia Giulia"],["07","Liguria"],["08","Emilia-Romagna"],["09","Toscana"],["10","Umbria"],["11","Marche"],
  ["12","Lazio"],["13","Abruzzo"],["14","Molise"],["15","Campania"],["16","Puglia"],["17","Basilicata"],["18","Calabria"],
  ["19","Sicilia"],["20","Sardegna"]];
const $ = (id) => document.getElementById(id);
const eur = (v) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const per = (v) => v.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " €/kWh";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const link = (u) => !u ? "" : (/^https?:\/\//i.test(u) ? u : "https://" + u);

$("region").innerHTML = REGIONS.map(([c, n]) => `<option value="${c}">${n}</option>`).join("");
try { $("region").value = localStorage.getItem("region") || "03"; } catch { $("region").value = "03"; }

// A region page links here with ?regione=NN.
const wanted = new URLSearchParams(location.search).get("regione");
if (wanted && REGIONS.some(([c]) => c === wanted)) $("region").value = wanted;

let data, affiliates = { suppliers: {} };
const ready = Promise.all([
  fetch("data/offers.json").then((r) => r.json()),
  fetch("affiliates.json").then((r) => r.json()).catch(() => affiliates),
]).then(([d, a]) => {
  data = d; affiliates = a;
  $("disclosure").textContent = Object.keys(a.suppliers).length ? a.disclosureWithLinks : "Non riceve commissioni.";
  $("asof").textContent = ` (dati del ${new Date(d.date).toLocaleDateString("it-IT")})`;
  $("kind").hidden = !d.index; // variable offers only when the day's data could price them
});

const monthName = (ym) => new Date(+ym.slice(0, 4), +ym.slice(4) - 1).toLocaleDateString("it-IT", { month: "short", year: "numeric" });

const PARTS = [
  ["energy", "Energia (prezzo dell'offerta)", "--bar-energy"],
  ["fixed", "Quota fissa del fornitore", "--bar-fee"],
  ["network", "Trasporto e gestione contatore", "--bar-net"],
  ["system", "Oneri di sistema", "--bar-net"],
  ["dispatch", "Dispacciamento", "--bar-net"],
  ["excise", "Accise", "--bar-tax"],
  ["vat", "IVA", "--bar-tax"],
];

// The affiliate link changes only where the button goes, never the order.
function offerButton(o) {
  const a = affiliates.suppliers[o.id.split("/")[0]];
  return a
    ? `<p><a href="${esc(a.url)}" rel="sponsored noopener" target="_blank">Vai all'offerta</a> <small>(link con commissione)</small></p>`
    : `<p><a href="${esc(link(o.url || o.site))}" rel="noopener nofollow" target="_blank">Scheda dell'offerta sul sito del fornitore</a></p>`;
}

function row(r, kwh) {
  const o = r.offer;
  const months = o.variable ? "prezzo variabile, segue il PUN"
    : o.durationMonths > 0 && o.durationMonths < 99 ? `prezzo bloccato ${o.durationMonths} mesi` : "durata prezzo non indicata";
  const total = PARTS.reduce((a, [k]) => a + r[k], 0);
  const bar = PARTS.map(([k, , c]) => `<i style="width:${(r[k] / total) * 100}%;background:var(${c})"></i>`).join("");
  const lines = PARTS.map(([k, label, c]) => `<tr><td><span class="sw" style="background:var(${c})"></span>${label}</td><td>${eur(r[k])}</td></tr>`).join("")
    + (r.discount > 0.5 ? `<tr><td>Sconti senza condizioni</td><td>−${eur(r.discount)}</td></tr>` : "")
    + `<tr><td>Totale in un anno</td><td>${eur(r.total)}</td></tr>`;
  const conds = o.conditions.filter(Boolean).slice(0, 2).map((c) => `<p class="cond">Condizione: ${esc(c.slice(0, 220))}${c.length > 220 ? "…" : ""}</p>`).join("");
  return `<li><details><summary><span class="name">${esc(o.name)}</span><span class="price">${eur(r.total)}</span>
    <span class="meta">${esc((o.site || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, ""))} · ${per(r.total / kwh)} tutto incluso · ${months}</span></summary>
    <div class="detail"><div class="bar" aria-hidden="true">${bar}</div><table>${lines}</table>${conds}
    ${offerButton(o)}</div></details></li>`;
}

function render() {
  const kwh = +$("kwh").value, kw = +$("kw").value, region = $("region").value;
  const f1 = $("f1").value === "" ? null : +$("f1").value / 100, f2 = $("f2").value === "" ? null : +$("f2").value / 100;
  let split = DEFAULT_SPLIT, splitNote = "";
  if (f1 != null && f2 != null && f1 + f2 <= 1) split = { F1: f1, F2: f2, F3: 1 - f1 - f2 };
  else if (f1 != null || f2 != null) splitNote = `<p class="note"><b>Fasce ignorate.</b> Inserisci sia F1 che F2, con somma non oltre 100%. Uso la ripartizione tipica.</p>`;
  try { localStorage.setItem("region", region); } catch {}

  const variable = !!data.index && $("f").elements.kind.value === "variable";
  const kindWord = variable ? "variabile" : "fisso";
  const rows = rank(data, { kwh, kw, region, split, variable });
  const out = $("out");
  if (!rows.length) { out.innerHTML = `<p class="note">Nessuna offerta a prezzo ${kindWord} trovata per questi valori.</p>`; out.hidden = false; return; }
  const estimate = variable
    ? `<p class="note"><b>Stima.</b> Il prezzo di queste offerte segue il PUN, che cambia ogni mese. Il calcolo usa la media del PUN di ${esc(monthName(data.index.from))}–${esc(monthName(data.index.to))} (${per(data.index.pun)}, più le perdite di rete) e lo spread di ogni offerta. Se il PUN sale o scende, il costo cambia. Il Portale Offerte usa invece prezzi futuri che non sono pubblici, quindi i suoi totali possono essere diversi.</p>`
    : "";
  const median = rows[Math.floor((rows.length - 1) / 2)].total, best = rows[0].total;
  const now = +$("now").value;
  const save = now > 0
    ? (now > best ? `<p class="save">Con l'offerta più conveniente risparmieresti circa <b>${eur(now - best)}</b> all'anno rispetto a oggi.</p>`
                  : `<p class="save">Spendi già meno dell'offerta più conveniente qui: non c'è niente da cambiare.</p>`)
    : `<p class="save">Tra l'offerta più conveniente e quella tipica ci sono <b>${eur(median - best)}</b> all'anno.</p>`;
  let shown = 20;
  const list = () => rows.slice(0, shown).map((r) => row(r, kwh)).join("");
  out.innerHTML = `${splitNote}${estimate}<div class="summary">
      <h2>${rows.length} offerte a prezzo ${kindWord} per ${kwh.toLocaleString("it-IT")} kWh in ${esc(REGIONS.find(([c]) => c === region)[1])}</h2>
      <div class="figs"><div><b>${eur(best)}</b><span>la più conveniente</span></div>
        <div><b>${eur(median)}</b><span>a metà classifica</span></div>
        <div><b>${eur(rows[rows.length - 1].total)}</b><span>la più cara</span></div></div>${save}</div>
    <ol class="offers" id="list">${list()}</ol>
    ${rows.length > shown ? `<button class="more" id="more" type="button">Mostra altre offerte</button>` : ""}`;
  out.hidden = false;
  const more = $("more");
  if (more) more.onclick = () => { shown += 30; $("list").innerHTML = list(); if (shown >= rows.length) more.remove(); };
}

$("f").addEventListener("submit", async (e) => { e.preventDefault(); await ready; render(); });
$("kind").addEventListener("change", () => { if (data) render(); });
ready.then(render).catch(() => { $("out").innerHTML = `<p class="note"><b>Dati non disponibili.</b> Riprova tra qualche minuto.</p>`; $("out").hidden = false; });

// Installable app and offline use (browsers allow it only over HTTPS).
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

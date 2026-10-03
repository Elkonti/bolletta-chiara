# bolletta-check

What a household in Italy really pays per year for electricity, for every
fixed-price offer on ARERA's Portale Offerte, and an estimate for variable
offers on the PUN: the offer's own price plus network, system charges,
dispatch, excise and VAT.

```
python fetch.py                  # today's offers and parameters into data/
python bill.py 2700 3 03         # kWh/year, kW, ISTAT region (03 = Lombardia)
python bill.py 2700 3 03 020     # + ISTAT province (020 = Mantova)
BILL_KIND=variable python bill.py 2700 3 03   # variable offers on the PUN
```

No dependencies beyond Python 3.

## Data

Open data from the [Portale Offerte](https://www.ilportaleofferte.it/portaleOfferte/it/open-data.page),
updated daily: free-market electricity offers (XML) and regulated parameters
(CSV), plus the portal's "Prezzi storici – indici a pubblica diffusione"
(monthly PUN, CSV) for variable offers. The site states no license; check reuse terms with ARERA / Acquirente
Unico before publishing results. `data/` is not committed.

Field codes follow the SII spec
[Trasmissione Offerte Mercato Retail v5.0](https://siiportale.acquirenteunico.it/documents/11387888/11431920/Funzionamento+e+Specifiche+del+Processo+di+Trasmissione+Offerte+Mercato+Retail_v5.0+in+consultazione.pdf/d3744d3b-9afa-7fba-97d9-a41f08c3e335?version=1.0&t=1766499930915&download=true) (12/11/2025).

## Rules applied (from the spec)

- Offer prices already include network losses.
- Optional green-energy components (MACROAREA 06, TIPOLOGIA 02) are left out.
- Conditional discounts (CONDIZIONE_APPLICAZIONE other than 00) are left out;
  discounts valid only after 12 months are left out. A discount limited to
  fewer than 12 months (PeriodoValidita/DURATA) counts for that share of the
  year; a tiered discount (VALIDO_DA/VALIDO_FINO) applies only the tier with
  the household's yearly kWh.
- Variable offers (IDX_PREZZO_ENERGIA 01 PUN, 12 PUN Index GME): energy =
  PUN × (1 + lambda) × COEFFICIENTE + the supplier's components. Losses apply
  to the index only; the spread already includes them (portal rules, "Regole
  per il calcolo della Spesa Annua Stimata" v4.0). The portal uses forward
  prices that are not open data, so the PUN is the mean of the last 12 months
  in the historical file: an estimate if prices stay as they were, shown as
  such. If that file is missing or more than 6 months old, variable offers
  are left out and fixed ones still publish. Other index codes (05, 08) and
  peak/off-peak bands are not priced.
- Offers limited to other regions (ZoneOfferta) are left out.
- Excise is zero for residential ≤3 kW using ≤150 kWh a month.

## Reading the bill PDF

The visitor can pick their bill PDF; `site/billread.js` reads it in the
browser with pdf.js (self-hosted in `site/vendor/pdfjs`, version and checksum
in `SOURCE.txt`) and fills consumption, power and band split. The file is
never uploaded, and pdf.js loads only when a file is picked. Scanned bills
(images) can't be read; the form says so and manual entry stays. Patterns
are tested on text cases, the layouts of public sample bills (Enel 2025,
Edison, Facile Energy 2025; the PDFs themselves aren't in the repo) and a
synthetic PDF (`tests/billread.mjs`; fixtures made with `tests/makepdf.py`).
The annual total is recognised by its band values adding up to it, because
the text order of bill tables often doesn't follow the layout.

## Not done yet

- Variable offers use one PUN figure for all bands (the open file has no
  F1/F23 split) and lag the market by about three months.
- F1/F2/F3 split is assumed 33/31/36%; a real bill gives the household's own.
- Excise partial rule between 150 and 220 kWh a month.
- Offers that need e-billing or direct debit are not flagged.
- Not yet checked against the portal's own simulation.

## Live site and deployment

Live at http://168.119.162.166/ (Hetzner, Caddy). No server code: the site is
static and the calculation runs in the visitor's browser.

- `git push server HEAD:main` deploys: the server's hook checks out the code
  and republishes (`deploy/post-receive`).
- `bolletta-refresh.timer` runs `deploy/refresh.sh` at 08:30 and 14:30
  Europe/Rome: download, `prepare.py`, publish. A failed step keeps the
  previous data online. Logs: `journalctl -u bolletta-refresh`.
- Server setup from scratch: `ssh pvadmin@server 'sudo sh -s' < deploy/setup.sh`,
  push, check out once, run setup again (see the script).
- Before changing the calculation: `node tests/compare.mjs` must pass.

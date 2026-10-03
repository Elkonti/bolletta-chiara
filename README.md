# bolletta-check

What a household in Italy really pays per year for electricity, for every
fixed-price offer on ARERA's Portale Offerte: the offer's own price plus
network, system charges, dispatch, excise and VAT.

```
python fetch.py                  # today's offers and parameters into data/
python bill.py 2700 3 03         # kWh/year, kW, ISTAT region (03 = Lombardia)
python bill.py 2700 3 03 020     # + ISTAT province (020 = Mantova)
```

No dependencies beyond Python 3.

## Data

Open data from the [Portale Offerte](https://www.ilportaleofferte.it/portaleOfferte/it/open-data.page),
updated daily: free-market electricity offers (XML) and regulated parameters
(CSV). The site states no license; check reuse terms with ARERA / Acquirente
Unico before publishing results. `data/` is not committed.

Field codes follow the SII spec
[Trasmissione Offerte Mercato Retail v5.0](https://siiportale.acquirenteunico.it/documents/11387888/11431920/Funzionamento+e+Specifiche+del+Processo+di+Trasmissione+Offerte+Mercato+Retail_v5.0+in+consultazione.pdf/d3744d3b-9afa-7fba-97d9-a41f08c3e335?version=1.0&t=1766499930915&download=true) (12/11/2025).

## Rules applied (from the spec)

- Offer prices already include network losses.
- Optional green-energy components (MACROAREA 06, TIPOLOGIA 02) are left out.
- Conditional discounts (CONDIZIONE_APPLICAZIONE other than 00) are left out;
  discounts valid only after 12 months are left out.
- Offers limited to other regions (ZoneOfferta) are left out.
- Excise is zero for residential ≤3 kW using ≤150 kWh a month.

## Not done yet

- Variable-price offers: need the quarterly forward prices the portal uses.
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

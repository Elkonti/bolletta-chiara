# Status

One dated line per work cycle: what shipped, what's next, what's blocked.

- 2026-10-03 — Shipped 080a533: variable offers on the PUN priced (1,405 offers; mean PUN of
  the last 12 months from the portal's open historical file, labelled as an estimate) and a
  discount fix (month-limited and tiered discounts were counted in full; one supplier showed
  -1,873 €/year). Tests: rules.mjs + compare.mjs 8/8. Live: only site/ and tests/ deployed;
  root files (prepare.py…) failed with "Permission denied" (app folder not group-writable).
  Live results checked unchanged (Lombardia 2,700 kWh: 798 / median 1,032). Blocked: deploy
  permissions (HQ q7), domain (q2). Next: variable-offer UI once q7 is done; meanwhile Nil Net.
- 2026-10-03 12:45 — Shipped f89c371: "Tipo di prezzo" fixed/variable choice on the page,
  variable results open with an estimate note (PUN months used, portal differs). Hidden while
  the live data has no index, so the live page is unchanged (checked). New tests/page.mjs
  runs app.js on a fake page. Still blocked: q7 (deploy permissions), q2 (domain). Next
  Bolletta: bill PDF reading in the browser (backlog 3).
- 2026-10-03 13:30 — Shipped 786ef42 + 3850a1a: bill PDF reading in the browser (pdf.js
  4.10.38 self-hosted, checksum verified; nothing uploaded). Right on 3 public sample bills
  (Enel 2025, Edison, Facile Energy 2025). Live: files served as JS, the deployed reader reads
  the Enel sample correctly; not yet tried in a real browser (no browser here; HQ q14). Still
  blocked: q7 (deploy permissions: variable offers), q2 (domain). Next Bolletta: region from
  CAP, or small-business offers (backlog 4).

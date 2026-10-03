# Status

One dated line per work cycle: what shipped, what's next, what's blocked.

- 2026-10-03 — Shipped 080a533: variable offers on the PUN priced (1,405 offers; mean PUN of
  the last 12 months from the portal's open historical file, labelled as an estimate) and a
  discount fix (month-limited and tiered discounts were counted in full; one supplier showed
  -1,873 €/year). Tests: rules.mjs + compare.mjs 8/8. Live: only site/ and tests/ deployed;
  root files (prepare.py…) failed with "Permission denied" (app folder not group-writable).
  Live results checked unchanged (Lombardia 2,700 kWh: 798 / median 1,032). Blocked: deploy
  permissions (HQ q7), domain (q2). Next: variable-offer UI once q7 is done; meanwhile Nil Net.

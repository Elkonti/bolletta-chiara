# Bolletta Chiara

A free site that shows Italian households what they'd really pay per year for
each fixed-price electricity offer (and an estimate for variable ones on the
PUN): the offer's price plus network, system charges, dispatch, excise and VAT.
Data: ARERA Portale Offerte open data, refreshed twice a day. Live at
http://168.119.162.166/ (no domain yet).

## The owner

Wants Claude to run the project as the whole team. Puts answers and decisions
on the HQ page, not in chat: https://claude.ai/artifact/235ToScji2VSVcK231N148
(database collection `questions`). Read it at the start of a session; add new
questions there (ArtifactData), never block on chat.

## Decisions already taken

- Income: transparent switching commissions. `affiliates.json` holds links per
  supplier VAT number; a paid link is always labelled and never changes the
  ranking. Ads are out (they break the privacy promise).
- Privacy: the calculation runs in the visitor's browser; the page loads
  nothing from third parties; no cookies, no analytics, no access logs.
- Italian UI. Region pages (`render.mjs`) are the main source of visitors.

## Code

- `fetch.py` downloads the day's files; `prepare.py` builds `offers.json` and
  refuses to publish broken data; `render.mjs` builds region pages + sitemap.
- `site/calc.js` is the calculator (browser and Node); `bill.py` is an
  independent Python reference. After any calculation change:
  `node tests/rules.mjs && node tests/compare.mjs && node tests/page.mjs` must
  pass (needs `python3 fetch.py` and `python3 prepare.py` first for the day's
  data).
- Field codes follow the SII spec "Trasmissione Offerte Mercato Retail" v5.0;
  the README lists the rules applied.

## Deploying

`git push` to `/srv/bolletta/repo.git` (branch `main`) checks out the code into
`/srv/bolletta/app` and runs `bolletta-refresh.service`, which publishes to
`/var/www/bolletta` (Caddy). Logs: `journalctl -u bolletta-refresh`.
Server setup from scratch: `deploy/setup.sh`.

## Work

`ops/BACKLOG.md` is the ordered list. Commit small, test, push, then update the
backlog and the HQ page's status.

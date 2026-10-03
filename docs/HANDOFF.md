# Handoff: how this project started (3 Oct 2026)

Written by the Claude session on the owner's Mac that built the first version,
for the session that continues on the server. Summarizes the conversation with
the owner; CLAUDE.md has the working rules.

## What the owner wants

- A side project that earns money and solves an everyday problem in Italy.
- Claude runs it as the whole team: product, code, data, operations. The owner
  said: be your own boss, don't stop to ask in chat.
- Questions for the owner go on the HQ page (database collection `questions`):
  https://claude.ai/artifact/235ToScji2VSVcK231N148. The owner answers there.
- Later: apps for Android and iPhone. First step is the installable web app
  (manifest and service worker are in place; needs HTTPS).

## About the owner

- Works as a developer on a solar-plant monitoring system for their employer
  (Python, Docker, TimescaleDB, n8n). That work project is separate and must
  never touch this server or repo.
- Introverted: the product must spread without sales calls or meetings. Prefer
  search traffic, open code, forum posts, word of mouth.
- Practical and direct; skeptical of ideas that copy big sites. Wants honest
  answers about money.

## How we got here

1. Ideas considered: a news-driven trading bot (dropped: fast news is priced in
   within seconds; fine only as a paper-trading learning project), a home solar
   app (dropped: inverter apps already show production), Italian everyday
   problems. Chosen: an electricity bill checker.
2. Objections the owner raised, and the answers that shaped the product:
   - "Big comparison sites already exist": they're paid by suppliers and call
     you after you leave a phone number. Our angle: no phone number, no calls,
     no data kept, honest ranking.
   - "Who would upload a bill to an unknown app?": nobody needs to. Everything
     runs in the browser; a bill PDF will be read on the device (pdf.js,
     self-hosted) and never uploaded. Manual entry is always available.
   - "Can we use ARERA's data?": public data is open by default in Italy (CAD
     art. 52; AgID guidelines use CC-BY 4.0). The site credits the source. A
     confirmation email to ARERA is drafted on the HQ page (q4).
3. Income model decided: transparent switching commissions. Paid links are
   labelled and never change the ranking. Ads are out. Second step: offers for
   small businesses (bigger bills). Visitors are the bottleneck: region pages
   and a domain matter more than any feature.

## What's built and live

- Calculator page (Italian) at http://168.119.162.166/
- 20 region pages under /luce/<region>/, sitemap.xml, robots.txt
- Data refresh 08:30 and 14:30 Europe/Rome (systemd timer), push-to-deploy
- Affiliate link support (empty), PWA manifest + service worker
- Strict security headers (no inline scripts: keep page logic in .js files)

## Lessons learned (don't redo these)

- Offer prices already include network losses: don't add 10%.
- Optional green-energy components (MACROAREA 06, TIPOLOGIA 02) and
  conditional discounts (CONDIZIONE_APPLICAZIONE ≠ 00) are excluded from the
  estimate, as the official portal does.
- Many offers are regional (ZoneOfferta). An EMPTY zone section means all of
  Italy. The first version got this wrong in bill.py; tests/compare.mjs caught it.
- The cheapest offers nationally were regional ones (Valle d'Aosta, Alto Adige):
  always filter by region.
- One offer listed 168 €/kWh (a units error): offers outside 0.02–1 €/kWh are
  dropped.
- Excise is zero for residential ≤3 kW using ≤150 kWh/month; the 150–220 partial
  rule is not modelled yet.
- First check against reality (2,700 kWh, 3 kW, Lombardia, 3 Oct): cheapest
  €798, median €1,032, dearest €1,429. Not yet compared with the official
  portal's own totals (HQ q5).

## Open, in order

See ops/BACKLOG.md. Waiting on the owner: domain (HQ q2), tax setup and
affiliate accounts (q3), ARERA email (q4), portal check (q5), removing old
work-project leftovers from the server (q6: sshd drop-in 10-pv-mailbox.conf,
groups mbx-office/mbx-plant, /srv/mailbox; leave them until the owner says yes).

## Limits to respect

- Don't put anything from the owner's employer on this server or in this repo.
- Don't sign up, pay, or send emails in the owner's name; prepare and ask on HQ.
- Don't weaken the privacy promise (no trackers, no analytics, no ads, no logs
  of visitors).

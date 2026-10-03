#!/bin/sh
# Nightly job (runs as user "bolletta"): download the day's ARERA files,
# build offers.json, publish the site. A failed step leaves the live site as it was.
set -eu
APP=/srv/bolletta/app
WWW=/var/www/bolletta
export BOLLETTA_DATA=/var/lib/bolletta/data
export BOLLETTA_OUT=/var/lib/bolletta/offers.json

python3 "$APP/fetch.py"
python3 "$APP/prepare.py"

# Region pages for search engines, built in a staging folder first.
STAGE=/var/lib/bolletta/stage
rm -rf "$STAGE" && mkdir -p "$STAGE"
node "$APP/render.mjs" "$BOLLETTA_OUT" "$STAGE"

# Publish: page files, region pages, then swap in the new data in one step.
mkdir -p "$WWW/data"
cd "$APP/site"
cp index.html app.js calc.js sw.js page.css icon.svg manifest.webmanifest "$WWW/"
cp "$APP/affiliates.json" "$WWW/"
cp "$STAGE/sitemap.xml" "$STAGE/robots.txt" "$WWW/"
rm -rf "$WWW/luce.new" && cp -r "$STAGE/luce" "$WWW/luce.new"
rm -rf "$WWW/luce.old" && { [ -d "$WWW/luce" ] && mv "$WWW/luce" "$WWW/luce.old" || true; }
mv "$WWW/luce.new" "$WWW/luce" && rm -rf "$WWW/luce.old"
cp "$BOLLETTA_OUT" "$WWW/data/offers.json.new"
mv "$WWW/data/offers.json.new" "$WWW/data/offers.json"

# Keep 60 days of raw files (~20 MB a day).
find "$BOLLETTA_DATA" -type f -mtime +60 -delete
echo "published $(date -Is)"

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

# Publish: copy the page files, then swap in the new data in one step.
mkdir -p "$WWW/data"
cp "$APP"/site/*.html "$APP"/site/*.js "$WWW/"
cp "$BOLLETTA_OUT" "$WWW/data/offers.json.new"
mv "$WWW/data/offers.json.new" "$WWW/data/offers.json"

# Keep 60 days of raw files (~20 MB a day).
find "$BOLLETTA_DATA" -type f -mtime +60 -delete
echo "published $(date -Is)"

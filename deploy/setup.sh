#!/bin/sh
# One-time server setup (Ubuntu), run with sudo. Safe to run again.
set -eu
apt-get update -q
apt-get install -y -q caddy git python3 nodejs
id bolletta >/dev/null 2>&1 || useradd --system --home /var/lib/bolletta --shell /usr/sbin/nologin bolletta
install -d -o pvadmin -g pvadmin /srv/bolletta /srv/bolletta/app
install -d -o bolletta -g bolletta /var/lib/bolletta /var/lib/bolletta/data /var/www/bolletta
[ -d /srv/bolletta/repo.git ] || sudo -u pvadmin git init -q --bare /srv/bolletta/repo.git
sudo -u pvadmin git --git-dir=/srv/bolletta/repo.git symbolic-ref HEAD refs/heads/main

# Second part, once the code has been pushed into /srv/bolletta/app.
D=/srv/bolletta/app/deploy
if [ -f "$D/refresh.sh" ]; then
  install -m 755 -o pvadmin -g pvadmin "$D/post-receive" /srv/bolletta/repo.git/hooks/post-receive
  install -m 644 "$D/bolletta-refresh.service" "$D/bolletta-refresh.timer" /etc/systemd/system/
  install -m 644 "$D/Caddyfile" /etc/caddy/Caddyfile
  # The push hook may start the refresh, nothing else.
  echo "pvadmin ALL=(root) NOPASSWD: /usr/bin/systemctl start bolletta-refresh.service" > /etc/sudoers.d/bolletta
  chmod 440 /etc/sudoers.d/bolletta
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
  systemctl daemon-reload
  systemctl enable --now bolletta-refresh.timer
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload-or-restart caddy
  systemctl start bolletta-refresh.service
fi

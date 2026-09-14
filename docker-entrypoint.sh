#!/bin/sh
set -e

# ./data wird per Bind-Mount vom Host reingereicht und gehört daher meist root
# (bzw. dem Host-User) statt dem unprivilegierten bonsync-User im Container.
# Deshalb hier als root kurz chown, dann Rechte abgeben und die App starten.
mkdir -p /app/data
chown -R bonsync:bonsync /app/data

exec gosu bonsync:bonsync "$@"

#!/usr/bin/env bash
set -euo pipefail

stamp=$(date +%Y%m%d-%H%M%S)
release_dir="/var/www/order-app.release-$stamp"
previous_dir="/var/www/order-app.prev-$stamp"

echo "Extracting and validating the AriX Order release..."
mkdir "$release_dir"
tar -xzf /tmp/order-app-latest.tgz -C "$release_dir"
test -f "$release_dir/arix-order.webmanifest"
grep -q '<title>AriX Order</title>' "$release_dir/index.html"

echo "Atomically switching the validated Order release..."
chown -R www-data:www-data "$release_dir"
mv /var/www/order-app "$previous_dir"
mv "$release_dir" /var/www/order-app

echo "Restarting arix-api.service..."
systemctl restart arix-api
sleep 2
systemctl is-active arix-api

echo "Reloading nginx..."
nginx -t
systemctl reload nginx

echo "Verifying local HTTP response..."
curl -fsS -H "Host: order.arix.az" http://127.0.0.1/ | head -n 15
echo "DEPLOYMENT COMPLETED SUCCESSFULLY!"

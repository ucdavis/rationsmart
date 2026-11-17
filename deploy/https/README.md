# Staging HTTPS behind Cloudflare

`https://rationsmart.ucdavis.edu` uses Cloudflare's proxy and a hostname-specific Full (strict) rule. Cloudflare connects to the VM on HTTPS. The VM's Nginx gateway terminates TLS and forwards requests to the existing frontend and API containers. HTTP redirects to HTTPS; `/healthz` remains available over HTTP for the container health check.

The staging NSG permits ports 80 and 443 only from Cloudflare's IPv4 ranges, since the origin public IP is IPv4-only. SSH is limited to the two developer IPs. Cloudflare can still serve IPv6 visitors. Refresh the Cloudflare ranges in `infra/params/stage.bicepparam` and the Nginx `set_real_ip_from` directives together when Cloudflare changes its published ranges.

## Files on the VM

- `/etc/rationsmart/tls/rationsmart.ucdavis.edu.cert.pem`: Cloudflare Origin CA certificate, root-owned, mode 644.
- `/etc/rationsmart/tls/rationsmart.ucdavis.edu.key.pem`: matching private key, root-owned, mode 600. The TLS directory is mode 700.
- `/etc/rationsmart/tls/cloudflare-origin-ca-root.pem`: public Cloudflare Origin CA RSA root for verification.
- `/etc/rationsmart/nginx/rationsmart.conf`: copy of the adjacent Nginx configuration.
- `/opt/rationsmart/gateway/docker-compose.override.yml`: copy of the adjacent Compose override.

Certificates and private keys are not committed to this repository. Keep a secure backup of the matching pair. The certificate issued November 16, 2026 covers only `rationsmart.ucdavis.edu` and expires November 12, 2041. Track renewal separately; do not assume automatic renewal.

The override replaces the gateway's configuration-directory mount and adds port 443. The current deployment script invokes Compose without `-f` for the gateway, so Compose automatically loads the override. Git checkout leaves this untracked file and `/etc/rationsmart` in place. A VM replacement, checkout cleanup, or deployment change that selects explicit Compose files requires restoring or explicitly including the override.

The local Nginx configuration preserves the application's routing and limits as of installation. If `gateway/nginx/conf.d/rationsmart.conf` changes later, reconcile those changes with this HTTPS configuration and the installed copy. Nginx trusts `CF-Connecting-IP` only from Cloudflare ranges so rate limits and upstream client IP headers identify the visitor.

## Restore on a replacement VM

First provision the normal app stacks and obtain the certificate/key from the administrator's secure backup. Use a secure transfer, never plaintext private keys in Run Command scripts, logs, email, or Git.

As root, install the certificate and key at the paths above. From a checkout containing this directory:

```bash
install -d -m 700 /etc/rationsmart/tls
install -d -m 755 /etc/rationsmart/nginx
# Copy the certificate and private key securely before continuing.
chmod 600 /etc/rationsmart/tls/rationsmart.ucdavis.edu.key.pem
chmod 644 /etc/rationsmart/tls/rationsmart.ucdavis.edu.cert.pem
chown root:root /etc/rationsmart/tls/*.pem
install -m 644 deploy/https/rationsmart.conf /etc/rationsmart/nginx/rationsmart.conf
install -m 644 deploy/https/docker-compose.override.yml /opt/rationsmart/gateway/docker-compose.override.yml
curl -fsS https://developers.cloudflare.com/ssl/static/origin_ca_rsa_root.pem \
  -o /etc/rationsmart/tls/cloudflare-origin-ca-root.pem
cd /opt/rationsmart/gateway
docker compose config --quiet
docker compose run --rm --no-deps nginx nginx -t
docker compose up -d --no-build --pull never --wait nginx
curl --fail --cacert /etc/rationsmart/tls/cloudflare-origin-ca-root.pem \
  --resolve rationsmart.ucdavis.edu:443:127.0.0.1 https://rationsmart.ucdavis.edu/
```

Set the GitHub `stage` environment variables `API_BASE_URL` and `ALLOWED_ORIGINS` to `https://rationsmart.ucdavis.edu`. The release workflow uses these to regenerate `backend/.env`. For an existing deployment, update those two values in that file and recreate API, worker, and beat with their existing images; do not rebuild or run migrations solely for this configuration change.

Apply the staging Bicep network settings before relying on origin access. If the VM public IP changes, update the campus DNS A record through Hostclerk and verify its Cloudflare secondary-zone proxy override. Ensure the hostname-specific Cloudflare SSL configuration rule remains Strict. Do not change the campus-wide encryption mode.

The deployment smoke test detects port 443 in the effective gateway Compose configuration and checks the local HTTPS endpoint with the Origin CA root. It verifies that `/docs` still returns 404 without routing through Cloudflare. Without an HTTPS port, it uses the existing HTTP checks.

Verify the public homepage and login screen, HTTP redirect, backend health, and authenticated login/email links. An Origin CA certificate is trusted by Cloudflare, not ordinary browsers connecting directly to the origin.

## Rollback

Keep root-only backups before changing the two backend environment values or local configuration. Restoring the old backend values requires recreating API, worker, and beat from their existing images.

To return the gateway to the repository's HTTP-only configuration, move the local Compose override aside and run `docker compose up -d --no-build --pull never --wait nginx`. Coordinate this with Cloudflare: its Strict rule requires a working HTTPS origin. A full return to the old public-IP HTTP setup also requires changing proxy/DNS and firewall settings; it is not accomplished by removing the override alone. Prefer restoring the last working HTTPS configuration.

Bicep preserves network rules only. It does not install the TLS files, local gateway override, or developer operating-system accounts.

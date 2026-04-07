# Cloudflare CDN Setup: alpo.ai

This runbook walks through migrating alpo.ai from direct Caddy/Let's Encrypt HTTPS to Cloudflare-proxied delivery with origin certificates. After completing these steps, all traffic flows through Cloudflare's edge network with compression, caching, and DDoS protection.

> **Prerequisite:** The DNS cutover in `docs/dns-cutover.md` must be completed first — the droplet should be running and serving traffic before adding Cloudflare.

---

## 1. Cloudflare Account & Site Setup

1. Sign up or log in at [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click **Add a site** → enter `alpo.ai`
3. Select the **Free** plan
4. Cloudflare will scan existing DNS records — review them in the next step

---

## 2. DNS Migration

### Change nameservers at Namecheap

1. Log in to [Namecheap → Domain List → alpo.ai → Domain](https://ap.www.namecheap.com/Domains/DomainControlPanel/alpo.ai/domain)
2. Under **Nameservers**, switch from "Namecheap BasicDNS" to **Custom DNS**
3. Enter the two nameservers Cloudflare assigned (shown in the Cloudflare dashboard, e.g. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
4. Save changes

> **Propagation:** Nameserver changes take 1–24 hours. Cloudflare will email when the site is active.

### Configure DNS records in Cloudflare

Set the following records in Cloudflare DNS. All records must be **Proxied** (orange cloud icon):

| Type  | Name   | Content             | Proxy Status |
|-------|--------|---------------------|--------------|
| A     | `@`    | `134.199.219.170`   | Proxied      |
| CNAME | `www`  | `alpo.ai`           | Proxied      |
| A     | `api`  | `134.199.219.170`   | Proxied      |

> **Why proxied?** Proxied records route traffic through Cloudflare's edge, enabling caching, compression, DDoS protection, and hiding the origin IP. DNS-only (grey cloud) bypasses all Cloudflare features.

### Remove stale Namecheap records

After nameservers propagate, the old Namecheap DNS records are inactive. No cleanup needed there — Cloudflare is now the authoritative DNS.

---

## 3. SSL/TLS Configuration

### Generate a Cloudflare Origin Certificate

Origin certificates let Cloudflare authenticate the connection to your origin server. They are trusted only by Cloudflare — not by browsers directly.

1. In Cloudflare dashboard → **SSL/TLS** → **Origin Server**
2. Click **Create Certificate**
3. Settings:
   - **Key type:** RSA (2048)
   - **Hostnames:** `*.alpo.ai, alpo.ai`
   - **Validity:** 15 years
4. Click **Create**
5. Copy the **Origin Certificate** (PEM) and **Private Key**

### Install the certificate on the droplet

```bash
ssh root@134.199.219.170
mkdir -p /opt/alpo/certs
```

Save the certificate and key:

```bash
# Paste the Origin Certificate PEM
nano /opt/alpo/certs/cloudflare-origin.pem

# Paste the Private Key PEM
nano /opt/alpo/certs/cloudflare-origin-key.pem

# Lock down permissions
chmod 600 /opt/alpo/certs/cloudflare-origin-key.pem
chmod 644 /opt/alpo/certs/cloudflare-origin.pem
```

### Set SSL mode to Full (Strict)

1. In Cloudflare dashboard → **SSL/TLS** → **Overview**
2. Set encryption mode to **Full (strict)**

> **Why Full (strict)?** This ensures Cloudflare validates the origin certificate on every request. "Flexible" mode would allow unencrypted origin connections. "Full" without "strict" doesn't validate the cert — only Full (strict) provides end-to-end encryption with certificate validation.

---

## 4. Caddyfile TLS Changes

Add a `tls` directive pointing to the origin certificate in each domain block. This replaces Caddy's default Let's Encrypt auto-HTTPS with the Cloudflare origin certificate.

### Updated Caddyfile blocks

Add this line inside each of the three domain blocks (`alpo.ai`, `www.alpo.ai`, `api.alpo.ai`):

```caddyfile
tls /etc/caddy/certs/cloudflare-origin.pem /etc/caddy/certs/cloudflare-origin-key.pem
```

**Example — `alpo.ai` block:**

```caddyfile
alpo.ai {
    tls /etc/caddy/certs/cloudflare-origin.pem /etc/caddy/certs/cloudflare-origin-key.pem
    header {
        # ... existing CSP and security headers ...
    }
    encode zstd gzip
    reverse_proxy app:3000
}
```

**Example — `www.alpo.ai` block:**

```caddyfile
www.alpo.ai {
    tls /etc/caddy/certs/cloudflare-origin.pem /etc/caddy/certs/cloudflare-origin-key.pem
    redir https://alpo.ai{uri} permanent
}
```

**Example — `api.alpo.ai` block:**

```caddyfile
api.alpo.ai {
    tls /etc/caddy/certs/cloudflare-origin.pem /etc/caddy/certs/cloudflare-origin-key.pem
    header {
        # ... existing CSP and security headers ...
    }
    encode zstd gzip
    reverse_proxy api:8000
}
```

> **What changes:** Caddy stops requesting Let's Encrypt certificates and uses the Cloudflare origin cert instead. Since only Cloudflare connects to the origin, browser trust is not needed — Cloudflare presents its own edge certificate to visitors.

### Docker Compose volume mount

The `docker-compose.prod.yml` has been updated to mount the certs directory into the Caddy container:

```yaml
caddy:
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile
    - ./certs:/etc/caddy/certs:ro    # Cloudflare origin certificate
    - caddy_data:/data
    - caddy_config:/config
```

> **Security:** The `certs/` directory lives on the droplet only and is **not committed to git**. The `:ro` flag makes the mount read-only inside the container.

---

## 5. Cache Rules

### Default behavior (no configuration needed)

Cloudflare automatically caches static assets based on file extension (`.js`, `.css`, `.png`, `.woff2`, etc.) and respects origin `Cache-Control` headers.

Next.js standalone already sets optimal caching headers:
- `/_next/static/*` → `Cache-Control: public, max-age=31536000, immutable`
- ISR pages → `s-maxage` with revalidation intervals
- API responses → `no-cache` or short TTLs

These headers flow through Caddy unchanged (no Caddy cache rules were added — see T01 decision).

### Optional: Explicit cache rule for static assets

For belt-and-suspenders caching of hashed Next.js assets:

1. In Cloudflare dashboard → **Caching** → **Cache Rules**
2. Click **Create rule**
3. Settings:
   - **Rule name:** `Next.js static assets`
   - **When:** URI Path starts with `/_next/static/`
   - **Then:** Cache eligible, Edge TTL = 1 month
4. Save and deploy

> **Why optional?** Cloudflare already respects the `immutable` Cache-Control header. An explicit rule is redundant but makes caching behavior visible in the dashboard.

---

## 6. CSP Adjustments

### Current state (no changes needed for basic setup)

The existing Content-Security-Policy in the Caddyfile includes `'unsafe-inline'` in `script-src`, which covers Cloudflare's challenge scripts (used for Under Attack mode and Bot Management challenges).

### If Bot Management is enabled (future)

Add `https://challenges.cloudflare.com` to the `script-src` directive:

```
script-src 'self' 'unsafe-inline' https://us.i.posthog.com https://challenges.cloudflare.com;
```

### If Web Analytics is enabled (future)

Add `https://static.cloudflareinsights.com` to both `script-src` and `connect-src`:

```
script-src 'self' 'unsafe-inline' https://us.i.posthog.com https://static.cloudflareinsights.com;
connect-src 'self' https://api.alpo.ai https://us.i.posthog.com https://cloudflareinsights.com;
```

> **When to do this:** Only add these CSP entries when you actually enable the respective Cloudflare feature. Adding them prematurely widens the security surface for no benefit.

---

## 7. Webhook Considerations

### LemonSqueezy webhooks work through Cloudflare

LemonSqueezy signs webhook payloads with HMAC-SHA256 using the `LEMONSQUEEZY_WEBHOOK_SECRET`. Verification is body-based (hash of the raw request body), not IP-based — Cloudflare proxying does not affect webhook verification.

The existing webhook endpoint at `/api/webhook` returns 401 for unsigned requests (verified in the post-cutover script).

### If Bot Fight Mode blocks webhooks

Cloudflare's Bot Fight Mode may flag automated POST requests as bot traffic. If LemonSqueezy webhooks start returning 403:

1. In Cloudflare dashboard → **Security** → **WAF** → **Custom rules**
2. Create a rule:
   - **Rule name:** `Allow LemonSqueezy webhooks`
   - **When:** `(http.request.uri.path eq "/api/webhook" and http.request.method eq "POST")`
   - **Then:** Skip all remaining rules
3. Save and deploy

> **When to do this:** Only create this exception if you observe webhook delivery failures after enabling Bot Fight Mode. Test by checking LemonSqueezy's webhook delivery logs.

---

## 8. Verification Steps

After completing the Cloudflare setup, verify the full stack is working:

### Run the verification script

```bash
./scripts/verify-live.sh
```

This includes checks for DNS, HTTPS, health endpoint, www redirect, webhook reachability, compression, Cloudflare headers, and static asset caching.

### Manual header checks

```bash
# Check Cloudflare is active (cf-ray header present)
curl -sI https://alpo.ai | grep -i 'cf-ray'
# Expected: cf-ray: <hex>-<colo>

# Check compression is working
curl -sI -H 'Accept-Encoding: gzip, br' https://alpo.ai | grep -i 'content-encoding'
# Expected: content-encoding: gzip (or br)

# Check static asset caching
# First, find a static asset URL by viewing page source
curl -sI 'https://alpo.ai/_next/static/chunks/main.js' | grep -i 'cf-cache-status'
# Expected: cf-cache-status: HIT (after first request warms the cache)
# First request will show MISS or DYNAMIC
```

### Expected header flow

| Header              | Source      | Expected Value                     |
|---------------------|-------------|------------------------------------|
| `cf-ray`            | Cloudflare  | `<hex>-<colo>` (e.g. `8a1b2c3-IAD`) |
| `content-encoding`  | Caddy       | `gzip` or `zstd`                   |
| `cf-cache-status`   | Cloudflare  | `HIT`, `MISS`, or `DYNAMIC`        |
| `server`            | Cloudflare  | `cloudflare`                       |
| `strict-transport-security` | Caddy | `max-age=63072000; ...`       |

---

## 9. Rollback Plan

If Cloudflare causes issues, you can revert to direct Caddy/Let's Encrypt:

### Quick rollback (DNS-level)

1. In Cloudflare DNS, toggle all records from **Proxied** (orange) to **DNS only** (grey)
2. Traffic goes directly to the origin, bypassing Cloudflare
3. Caddy will need to obtain Let's Encrypt certificates — this happens automatically but takes 1–2 minutes

### Full rollback (remove Cloudflare)

1. In Namecheap, switch nameservers back to Namecheap BasicDNS
2. Re-create the DNS records from `docs/dns-cutover.md`
3. Remove `tls` directives from the Caddyfile (Caddy reverts to auto-HTTPS)
4. Remove the `./certs:/etc/caddy/certs:ro` volume from `docker-compose.prod.yml`
5. Restart the stack: `docker compose -f docker-compose.prod.yml up -d`

> **Note:** Nameserver changes take 1–24 hours to propagate. The DNS-level rollback (toggling proxy off) is nearly instant and should be tried first.

---

## 10. Post-Setup Checklist

- [ ] Nameservers changed at Namecheap → Cloudflare-assigned nameservers
- [ ] Cloudflare shows site as **Active**
- [ ] DNS records configured: A `@`, CNAME `www`, A `api` — all Proxied
- [ ] Origin certificate generated and installed at `/opt/alpo/certs/`
- [ ] SSL mode set to **Full (strict)**
- [ ] Caddyfile updated with `tls` directives pointing to origin cert
- [ ] `docker-compose.prod.yml` updated with cert volume mount
- [ ] Stack restarted: `docker compose -f docker-compose.prod.yml up -d`
- [ ] `./scripts/verify-live.sh` passes all 8 checks
- [ ] `cf-ray` header present in responses
- [ ] Compression working (`content-encoding` header present)
- [ ] LemonSqueezy webhook delivery confirmed
- [ ] Raised DNS TTL to 3600s after 24–48h of stable operation

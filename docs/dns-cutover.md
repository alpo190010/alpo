# DNS Cutover: Vercel → DigitalOcean Droplet

This runbook walks through moving alpo.ai DNS from Vercel to the DigitalOcean droplet (`134.199.142.211`). After completing these steps, alpo.ai will serve from the self-hosted Docker stack with Caddy handling HTTPS automatically.

---

## Prerequisites

Before touching DNS, confirm the droplet is healthy and ready to serve production traffic.

- [ ] SSH into the droplet: `ssh root@134.199.142.211`
- [ ] Docker stack is running: `docker compose ps` shows `app`, `db`, and `caddy` healthy
- [ ] Health endpoint responds: `curl -sf http://localhost:3000/api/health` returns `{"status":"ok"}`
- [ ] `.env` is populated with production secrets (see `.env.production.template`)
- [ ] Database has been migrated: `docker compose exec app npx prisma migrate status` shows no pending
- [ ] Caddyfile includes `www.alpo.ai` redirect block (deploy latest before cutover)

---

## DNS Records to Set (Namecheap)

Log in to [Namecheap → Domain List → alpo.ai → Advanced DNS](https://ap.www.namecheap.com/Domains/DomainControlPanel/alpo.ai/advancedns).

### Remove existing records

Delete any existing A, AAAA, or CNAME records for:
- `@` (apex / root)
- `www`

### Add new records

| Type  | Host  | Value              | TTL       |
|-------|-------|--------------------|-----------|
| A     | `@`   | `134.199.142.211`  | 5 min     |
| CNAME | `www` | `alpo.ai.`         | Automatic |

> **Why CNAME for www?** Caddy needs to see the `www.alpo.ai` Host header to issue its TLS certificate and apply the permanent redirect. A CNAME pointing `www` → `alpo.ai` routes traffic to the same IP while preserving the hostname.

### TTL strategy

1. **Before cutover (24h prior if possible):** Lower the existing TTL to 300s (5 minutes) so the old records expire quickly once you switch.
2. **At cutover:** Set the new records with TTL = 300s.
3. **After verification (24–48h later):** Raise TTL to 1800s or 3600s for normal caching.

---

## Cutover Steps

### 1. Lower existing TTL (optional, 24h before)

In Namecheap, edit the current A/CNAME records and set TTL to 5 min. This ensures caches expire quickly when you change the value.

### 2. Deploy the latest Caddyfile

On the droplet:

```bash
ssh root@134.199.142.211
cd /root/alpo   # or wherever docker-compose.yml lives
git pull origin main
docker compose up -d caddy
docker compose logs -f caddy   # watch for "certificate obtained" messages
```

### 3. Update DNS records

In Namecheap Advanced DNS:
1. Delete old A/CNAME records for `@` and `www`
2. Add the records from the table above
3. Save changes

### 4. Wait for propagation

DNS propagation typically takes 5–30 minutes with low TTL. Check progress:

```bash
# From your local machine
dig alpo.ai A +short
# Expected: 134.199.142.211

dig www.alpo.ai A +short
# Expected: shows alpo.ai CNAME then 134.199.142.211

# Or use a propagation checker
# https://www.whatsmydns.net/#A/alpo.ai
```

### 5. Run the post-cutover verification script

```bash
./scripts/verify-live.sh
```

This checks DNS resolution, HTTPS, health endpoint, www redirect, and webhook reachability. All checks must pass.

---

## Post-Cutover Checklist

### Update LemonSqueezy webhook URL

Go to [LemonSqueezy → Settings → Webhooks](https://app.lemonsqueezy.com/) and update the webhook endpoint to:

```
https://alpo.ai/api/webhook
```

**This is critical** — payment events will fail silently if the webhook URL still points at the Vercel deployment.

### Verify webhook delivery

After updating the URL, either:
- Make a test purchase, or
- Use LemonSqueezy's "Send test webhook" button

Confirm the webhook is received:

```bash
ssh root@134.199.142.211
docker compose logs -f app | grep -i webhook
```

### Other post-cutover tasks

- [ ] **Disable Vercel deployment** — Remove the Vercel project or disconnect the Git integration to prevent the old deployment from running and consuming resources
- [ ] **Update Resend domain settings** — If Resend is configured with domain verification DNS records (SPF/DKIM), ensure those TXT records are preserved in Namecheap
- [ ] **Raise TTL** — After 24–48h of stable operation, increase DNS TTL to 1800s or 3600s
- [ ] **Monitor logs** — Watch for errors in the first 24h: `docker compose logs -f app`
- [ ] **Test email delivery** — Trigger a transactional email (e.g., analysis complete notification) and verify it arrives

---

## Rollback Plan

If something goes wrong after cutover:

1. **Revert DNS:** Change the A record for `@` back to Vercel's IP (find it in Vercel dashboard → Project → Domains)
2. **Revert webhook URL:** Change LemonSqueezy webhook back to `https://alpo.ai/api/webhook` (pointing at Vercel)
3. **Investigate:** SSH into the droplet and check logs: `docker compose logs --tail=100 app`

With a 5-minute TTL, DNS rollback takes effect within 5–10 minutes.

---

## Troubleshooting

### Caddy won't obtain a TLS certificate

- Ensure port 80 and 443 are open on the droplet firewall: `ufw status`
- Ensure no other process is binding port 80/443: `ss -tlnp | grep -E ':80|:443'`
- Check Caddy logs: `docker compose logs caddy`
- Caddy uses Let's Encrypt — rate limits apply (5 certs per domain per week)

### Site loads over HTTP but not HTTPS

- Caddy auto-redirects HTTP→HTTPS. If HTTPS fails, the TLS certificate hasn't been obtained yet.
- Wait 1–2 minutes after DNS propagation for Caddy to detect the new domain and request a cert.

### www.alpo.ai doesn't redirect

- Ensure the `www.alpo.ai` block is in the Caddyfile with `redir https://alpo.ai{uri} permanent`
- Ensure the CNAME record for `www` points to `alpo.ai.`
- Caddy needs to obtain a separate cert for `www.alpo.ai` — check logs for certificate issuance

### Database connection errors after cutover

- The database runs inside Docker and is not exposed externally. Connection issues usually mean the `app` container crashed.
- Check: `docker compose ps` and `docker compose logs app`

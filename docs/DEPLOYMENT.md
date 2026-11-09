# Deploying to AWS EC2

Target: one small EC2 instance running Docker Compose (Nginx + web + api), MongoDB Atlas for data, Let's Encrypt for TLS. Suitable for ~300 employees; costs roughly US$20/month plus AI usage.

```
Internet ──443/80──▶ [Security group] ──▶ EC2 (Ubuntu 24.04)
                                           ├─ nginx  (TLS termination, rate limiting)  :80/:443
                                           ├─ web    (Next.js standalone, non-root)   internal :3000
                                           └─ api    (Express, non-root, read-only)   internal :4000 ──▶ MongoDB Atlas (IP allow-listed)
                                                                                              └─────▶ Anthropic API
```

Only Nginx publishes ports. The web and api containers are reachable only on the Compose network.

---

## 0. Prerequisites

- AWS account with permission to create EC2 instances, security groups and Elastic IPs.
- A domain where you can create an `A` record — or use `sslip.io` (see step 4).
- Clerk application keys (production instance if you own the domain; otherwise development keys).
- Anthropic API key with a **spend limit set in the Anthropic Console** (the hard provider-level cap).
- MongoDB Atlas cluster (M0 free tier works; it's a replica set, so transactions are supported).

## 1. Create the EC2 instance

EC2 console → **Launch instance**:

| Setting | Value |
|---|---|
| AMI | Ubuntu Server 24.04 LTS (x86_64) |
| Type | `t3.small` (2 vCPU, 2 GB) — swap is added for builds |
| Key pair | create/select an ed25519 key |
| Storage | 20 GB gp3, encrypted |
| IMDS | IMDSv2 required (default) |

Allocate an **Elastic IP** (EC2 → Elastic IPs → Allocate) and associate it with the instance so the address survives restarts.

## 2. Configure the security group

| Type | Port | Source | Why |
|---|---|---|---|
| HTTP | 80 | 0.0.0.0/0, ::/0 | Let's Encrypt challenge + redirect to HTTPS |
| HTTPS | 443 | 0.0.0.0/0, ::/0 | Application |
| SSH | 22 | **your IP only** (`x.x.x.x/32`) | Administration — or omit and use SSM Session Manager |

Nothing else. MongoDB (27017), the API (4000) and Next.js (3000) are **not** exposed.

### MongoDB Atlas network and user

- **Network Access:** add only the Elastic IP (`x.x.x.x/32`). Remove `0.0.0.0/0` if present.
- **Database Access:** create a user (e.g. `ika_app`) with the built-in role `readWrite` **on the `knowledge_assistant` database only** (Specific Privileges), not `atlasAdmin`.
- Connection string: `mongodb+srv://ika_app:<password>@<cluster>.mongodb.net/knowledge_assistant?retryWrites=true&w=majority`

## 3. Install Docker on the instance

```bash
ssh -i ~/.ssh/<key>.pem ubuntu@<elastic-ip>
git clone https://github.com/<you>/internal-knowledge-assistant.git
cd internal-knowledge-assistant
./deploy/ec2-setup.sh          # Docker Engine + Compose plugin, certbot, 2 GB swap, unattended upgrades
exit                           # log out/in so the docker group applies
```

## 4. Configure DNS

Create an `A` record for your hostname (e.g. `kb.example.com`) pointing to the Elastic IP. Verify with `dig +short kb.example.com`.

No domain? Use `sslip.io`, which resolves `<ip-with-dashes>.sslip.io` to that IP and works with Let's Encrypt — e.g. `DOMAIN=3-120-45-67.sslip.io`.

In **Clerk**: add the domain under *Domains* for a production instance (requires DNS records on a domain you own). With an `sslip.io` hostname, use development instance keys (`pk_test_…`/`sk_test_…`) — Clerk shows a small "development mode" badge.

## 5. Configure the environment

```bash
cd ~/internal-knowledge-assistant
cp .env.example .env
chmod 600 .env
nano .env
```

Production values to set:

```dotenv
NODE_ENV=production
LOG_LEVEL=info
DOMAIN=kb.example.com
FRONTEND_URL=https://kb.example.com
MONGODB_URI=mongodb+srv://ika_app:...@cluster.mongodb.net/knowledge_assistant?retryWrites=true&w=majority
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
REQUIRE_ADMIN_MFA=true          # once admins have enrolled MFA
AI_API_KEY=sk-ant-...
MONTHLY_QUERY_LIMIT=100
```

`.env` is read by Compose; `NEXT_PUBLIC_*` values are passed to the web image as build arguments (they are public by design). Server secrets reach only the containers that need them.

## 6. HTTPS certificate (Let's Encrypt)

```bash
./deploy/issue-cert.sh admin@example.com
```

This runs `certbot certonly --standalone` (port 80 must be free, which it is before the first start) and stores renewal hooks that briefly stop/start the Nginx container. Ubuntu's `certbot.timer` renews automatically; test with `sudo certbot renew --dry-run`.

## 7. Nginx

Already configured in the repo:

- `deploy/nginx/https.conf.template` — HTTP→HTTPS redirect, TLS 1.2/1.3, HSTS, rejects unknown hostnames (`ssl_reject_handshake`), templated with `DOMAIN` by the official Nginx image.
- `deploy/nginx/common.conf` — `/api/` → api (rate limited 10 r/s per IP, burst 30, 75 s read timeout), everything else → web, long-lived caching for `/_next/static`, 6 MB body cap, `server_tokens off`, `X-Forwarded-For` overwritten (not appended) to stop client spoofing.

## 8. Start the containers

```bash
./deploy/deploy.sh
```

This builds both images (multi-stage, non-root), starts `nginx`, `web` and `api` with restart policies and health checks, prunes old images, then runs the smoke test.

Equivalent manual commands:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Create the first administrator (sign up at `https://<domain>/sign-up` first and copy the user ID from the Clerk dashboard):

```bash
docker compose exec api node dist/scripts/bootstrap-admin.js --clerk-user-id user_...
# optional demo content
docker compose exec api node dist/scripts/seed-demo.js --admin-email you@example.com --dir /app/demo-documents
```

## 9. Verify health

```bash
./scripts/smoke.sh https://kb.example.com
curl -s https://kb.example.com/api/v1/health      # {"status":"ok"}
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps   # all "healthy"
```

The smoke test checks health, 401s on protected endpoints, sign-in rendering, anonymous redirects, HTTP→HTTPS, HSTS, certificate validity and that server versions aren't disclosed.

## 10. Inspect logs

```bash
alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'
dc logs -f api            # structured JSON (pino); pipe through `jq` for readability
dc logs -f web
dc logs -f nginx
dc logs --since 1h api | grep '"level":50'      # errors only
```

Logs rotate at 10 MB × 5 files per container (json-file driver). They contain request metadata, audit events and AI token counts — never tokens, keys, questions, answers or document text.

## 11. Update the application

```bash
cd ~/internal-knowledge-assistant
./deploy/deploy.sh        # git pull --ff-only, rebuild, rolling restart via compose, smoke test
```

Rollback: `git checkout <previous-tag> && ./deploy/deploy.sh`. Schema changes are additive (Mongoose), so rolling back code doesn't require a data migration.

---

## Cost notes

| Item | Approx. monthly (us-east-1) |
|---|---|
| EC2 t3.small on-demand | ~US$15 (≈US$9.5 with a 1-yr Savings Plan) |
| 20 GB gp3 | ~US$1.6 |
| Public IPv4 / Elastic IP | ~US$3.6 |
| MongoDB Atlas M0 | US$0 (M10 ~US$57 for backups/SLA) |
| Anthropic API | usage-based; bounded by per-user quotas, `AI_MONTHLY_REQUEST_BUDGET`, and the Console spend limit |

Set an **AWS Budget** alert (e.g. US$30/month) and a Console spend limit on the Anthropic workspace.

## Hardening checklist

- [ ] SSH restricted to your IP (or closed in favour of SSM)
- [ ] Atlas IP allow-list = Elastic IP only; app user has `readWrite` on one DB
- [ ] `.env` is `chmod 600` and not in git
- [ ] Clerk: production instance, restricted sign-ups, MFA enabled; then `REQUIRE_ADMIN_MFA=true`
- [ ] Anthropic Console spend limit configured
- [ ] `sudo certbot renew --dry-run` succeeds
- [ ] AWS Budget alert configured

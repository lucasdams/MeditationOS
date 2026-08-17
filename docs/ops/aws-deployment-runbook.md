# AWS Deployment Runbook (DRAFT / PLAN)

> **Status:** proposal for review. Nothing here has been provisioned. No infrastructure
> exists yet — the repo has CI (test/build only) and a local production-mode compose stack
> (`docker-compose.prod.yml`), but no cloud deploy. This document maps the app's *actual*
> runtime to AWS and gives a phased runbook to stand it up.

## 1. What we are deploying (grounded in the codebase)

| Component | In the repo | Runtime shape |
|-----------|-------------|---------------|
| **Backend API** | `backend/`, `Dockerfile`, `entrypoint.sh` | FastAPI on **gunicorn + uvicorn workers**, port 8000. `entrypoint.sh` runs `alembic upgrade head` then starts gunicorn (`WEB_CONCURRENCY` workers). |
| **Frontend** | `frontend/`, `Dockerfile.prod`, `nginx.conf` | Vite build → static bundle served by **nginx** (SPA fallback to `index.html`). `VITE_*` values are **baked in at build time** (build args). |
| **Database** | Alembic migrations in `backend/alembic/` | **PostgreSQL 16**. |
| **Background jobs** | `app/jobs/send_reminders.py`, `app/jobs/send_weekly_summaries.py` | Run **hourly** via `python -m app.jobs.<job>`. Idempotent; guarded by a `pg_try_advisory_lock` so multiple replicas are safe. |
| **Throttles / rate limits** | `app/core/limits.py`, slowapi | In-memory **per-process** unless `REDIS_URL` is set (then shared across workers/hosts). |
| **Email** | `app/services/notifications/email.py` | SMTP relay (`SMTP_*`). Blank host → logs only. |
| **Web Push** | `app/services/push_service.py` | Optional (VAPID keys). No-op if unset. |
| **Logging** | `app/core/logging_config.py` | Production emits **one JSON object per line to stdout** — CloudWatch-ready. |
| **Error monitoring** | Sentry (`SENTRY_DSN`, `VITE_SENTRY_DSN`) | Optional. PII scrubbed before send. |

**Not used today (despite the roadmap mentioning it):** there is **no S3/boto usage** anywhere
in the code — the app stores no user files. S3 only enters the picture if we host the frontend
static bundle there (Phase 2 below), not as an app dependency.

## 2. Recommended target architecture (Phase 2)

```mermaid
flowchart TD
  U[Browser] -->|HTTPS| CF[CloudFront + ACM cert]
  CF -->|default: static| S3[(S3: frontend bundle)]
  CF -->|/api/*| ALB[ALB HTTPS]
  ALB --> ECS[ECS Fargate: backend gunicorn]
  ECS --> RDS[(RDS PostgreSQL 16)]
  ECS -.optional.-> REDIS[(ElastiCache Redis)]
  ECS --> SES[SES SMTP]
  ECS --> CW[CloudWatch Logs]
  EB[EventBridge Scheduler hourly] -->|RunTask| JOB[ECS task: app.jobs.send_reminders / send_weekly_summaries]
  JOB --> RDS
  SM[Secrets Manager] -. injected .-> ECS
  SM -. injected .-> JOB
```

**Why this shape**
- **Single public origin via CloudFront** (`app.example.com`): default behaviour serves the S3
  static bundle; a `/api/*` behaviour forwards to the ALB. This keeps the browser on **one
  origin**, so the `SameSite=Lax`, `Secure`, httpOnly auth cookie (`auth.py:62`) "just works"
  with no cross-site cookie or CORS-credentials gymnastics. (Split subdomains
  `app.` + `api.` *also* work because they're same-site under one registrable domain, but
  single-origin is simpler and the safer default.)
- **ECS Fargate** for the backend: no servers to patch; scale by task count. Start at 1 task.
- **RDS Postgres 16**: managed, backups, matches local.
- **EventBridge Scheduler → ECS RunTask** for the hourly jobs: serverless cron, no always-on
  box. The advisory lock in the jobs means even overlapping runs are safe.
- **ElastiCache Redis is optional** and only needed once the backend runs **>1 task** — the
  in-memory throttles are per-process, so multiple tasks would each keep their own counters
  (a known, documented trade-off). Single task → skip Redis.
- **Secrets Manager** holds every secret; injected into task definitions (never baked into images).

### Simpler Phase 1 (MVP, fastest to demo)
Single **EC2** (t4g.small) running `docker-compose.prod.yml` (backend + frontend containers) +
**RDS** + **SES**. HTTPS via an ALB or Caddy/Let's Encrypt. Hourly jobs via host `crontab`
calling `docker compose run --rm backend python -m app.jobs.send_reminders`. Migrations run
automatically via `entrypoint.sh` (safe — single instance, no race). ~**$30–45/mo**. Good enough
to put a live link on a résumé; upgrade to Phase 2 when you want the "proper" story.

### Phase 3 (scale, later)
Multi-AZ RDS, ≥2 Fargate tasks + ElastiCache (shared throttles), service autoscaling, WAF on
CloudFront, read replica if needed.

## 3. AWS services checklist

| Need | Service | Notes |
|------|---------|-------|
| Backend compute | **ECS Fargate** (Phase 1: EC2) | 1 task to start; `WEB_CONCURRENCY=2`. |
| Container image | **ECR** | Push the `backend/` image. |
| Database | **RDS PostgreSQL 16** | Start `db.t4g.micro`, single-AZ, 20 GB gp3, automated backups on. |
| Frontend hosting | **S3 + CloudFront** (Phase 1: nginx container) | Static bundle; CloudFront also fronts `/api/*`. |
| TLS cert | **ACM** | For CloudFront (us-east-1) and/or ALB. |
| Load balancer | **ALB** | HTTPS listener → backend target group; health check `GET /health` (see §7). |
| Scheduled jobs | **EventBridge Scheduler** → ECS RunTask | Hourly. Two schedules (reminders + weekly) or one task running both. |
| Shared throttles | **ElastiCache Redis** | Only when >1 backend task. Sets `REDIS_URL`. |
| Secrets | **Secrets Manager** (or SSM Parameter Store) | See §6. |
| Logs/metrics | **CloudWatch Logs** | JSON logs already; add metric filters/alarms. |
| Email | **SES** | Verify domain + DKIM; request production access (leave sandbox). SMTP creds → `SMTP_*`. |
| DNS | **Route 53** | `app.example.com` → CloudFront. |

## 4. Prerequisites (decide before starting)
- [ ] A **domain** (Route 53 hosted zone) — needed for HTTPS, cookies, SES, OAuth origins.
- [ ] AWS account + region (suggest `us-east-1` — required for CloudFront ACM certs).
- [ ] Google OAuth: add the production origin to the OAuth client (authorized JS origin =
      the frontend URL); set `GOOGLE_CLIENT_ID` + `VITE_GOOGLE_CLIENT_ID`.
- [ ] Generate `SECRET_KEY` (`openssl rand -hex 32`) and VAPID keys
      (`npx web-push generate-vapid-keys`) if enabling push.
- [ ] Decide budget tier (Phase 1 vs 2) — see §9.

## 5. Step-by-step (Phase 2)

1. **Network** — a VPC with 2 public + 2 private subnets. ALB in public; ECS tasks + RDS in
   private. Security groups: ALB:443 from world → backend:8000 from ALB only; RDS:5432 from
   backend SG only.
2. **RDS** — create the Postgres 16 instance in the private subnets. Note the endpoint; it
   becomes `DATABASE_URL` (`postgresql://USER:PASS@ENDPOINT:5432/meditationos`).
3. **Secrets Manager** — create one secret per value in §6 (or one JSON secret). 
4. **ECR** — `aws ecr create-repository --repository-name meditationos-backend`; build & push
   the `backend/` image (linux/amd64).
5. **Migrations task** — register an ECS task definition that runs
   `alembic upgrade head` (override the command). **Run it once now**, and as a gated step in
   every deploy — see §8. This is deliberately *separate* from the service so N service tasks
   don't race on migrations.
6. **Backend service** — ECS Fargate service (1 task, `WEB_CONCURRENCY=2`), env from Secrets
   Manager, behind the ALB target group. Set **`TRUST_PROXY=true`** (it's behind the ALB, so
   `X-Forwarded-For` is trustworthy) and **`ENVIRONMENT=production`**.
7. **Frontend** — build with production `VITE_API_URL` (see cookie note in §2 — prefer a
   same-origin path like `/api/v1` via CloudFront), `npm run build`, `aws s3 sync dist/ s3://…`,
   create the CloudFront distribution (S3 default origin + `/api/*` → ALB origin), point
   Route 53 at it.
8. **Scheduler** — EventBridge Scheduler rule (rate: 1 hour) → ECS RunTask for
   `python -m app.jobs.send_reminders`; a second for `send_weekly_summaries`.
9. **SES** — verify the sending domain (DKIM), move out of sandbox, create SMTP credentials →
   `SMTP_*`, set `EMAIL_FROM` and `APP_BASE_URL` (the public frontend URL, used in email links).
10. **Smoke test** — register, verify email, log a session, breathe, journal, check reminders
    fire (invoke the job task manually once), confirm CloudWatch logs and Sentry.

## 6. Configuration & secrets (from `.env.example`, mapped to AWS)

**Secrets Manager (never in the image):**
`SECRET_KEY`, `DATABASE_URL` (or DB user/pass), `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`,
`SMTP_USER` / `SMTP_PASSWORD`, `VAPID_PRIVATE_KEY`, `SENTRY_DSN`.

**Plain env / SSM (non-secret) — production values differ from local:**
| Var | Production value |
|-----|------------------|
| `ENVIRONMENT` | `production` (enables prod security headers, JSON logs, fail-fast config, `Secure` cookies) |
| `TRUST_PROXY` | `true` (behind ALB/CloudFront — required for correct client IP + rate limits) |
| `CORS_ORIGINS` | the real frontend origin(s); **not** `localhost` |
| `APP_BASE_URL` | public frontend URL (email links) |
| `VITE_API_URL` | build arg — prefer same-origin `/api/v1` (see §2) |
| `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` | prod OAuth client |
| `REQUIRE_EMAIL_VERIFICATION` | flip to `true` **only after** SES delivery is confirmed (else it locks out unconfirmed users) |
| `REDIS_URL` | ElastiCache URL when >1 task; else blank |
| `WEB_CONCURRENCY`, `DB_POOL_SIZE`, `DB_MAX_OVERFLOW` | size so `WEB_CONCURRENCY × (POOL + OVERFLOW) ≤ RDS max_connections` |
| `ADMIN_EMAILS` | your admin address(es) |
| `VITE_SENTRY_DSN` | build arg (frontend Sentry) |

## 7. Health checks (already implemented)
No work needed — `backend/app/api/routes/health.py` already exposes both:
- **`GET /health`** — liveness, no auth, **no DB**. Use this for the **ALB target group** health
  check (a DB blip won't cycle otherwise-healthy tasks).
- **`GET /health/ready`** — readiness, runs a cheap `SELECT 1`. Use for a deploy gate / readiness
  probe if you want to hold traffic until the DB is reachable.

## 8. Migrations strategy (important)
`entrypoint.sh` runs `alembic upgrade head` on **every** container start. With a single instance
(Phase 1) that's fine. With **multiple Fargate tasks**, they would race to migrate on rollout.
For Phase 2:
- Run migrations as a **dedicated one-off ECS task** in the deploy pipeline, **before** updating
  the service, and
- either drop the `alembic upgrade head` line from the service image's startup, or gate it behind
  an env flag (`RUN_MIGRATIONS_ON_START`) that's off for service tasks and on for the migration task.
- **This branch adds 2 migrations** (`b8e4d1a7f3c2_add_users_locale`,
  `d9e8f7a6b5c4_add_philosopher_chats_table`) that must be applied — CI does **not** run Alembic.

## 9. Rough cost (us-east-1, low traffic)
| | Phase 1 (EC2) | Phase 2 (Fargate + CloudFront) |
|---|---|---|
| Compute | t4g.small ~$12 | 1 Fargate task ~$18–30 |
| RDS | db.t4g.micro ~$13 | ~$13–15 |
| ALB | — (or ~$16) | ~$16 |
| CloudFront/S3 | — | ~$1–5 |
| SES | ~$0 (low volume) | ~$0 |
| **~Total/mo** | **$30–45** | **$70–120** |
Figures are ballpark, exclude data transfer/free-tier; confirm with the AWS pricing calculator.

## 10. CI/CD (extend the existing GitHub Actions)
Current `ci.yml` only lints/tests/builds. Add a deploy job on push to `main`, using a
**GitHub OIDC role** (no static AWS keys):
1. Build & push backend image to ECR.
2. Run the **migration task** (§8); fail the deploy if it errors.
3. Update the ECS service (new task definition revision).
4. Build frontend, `s3 sync`, CloudFront invalidation.

## 11. Security checklist (ties to `.claude/rules/security.md`)
- [ ] `ENVIRONMENT=production` → `Secure` cookies, HSTS, prod headers.
- [ ] `TRUST_PROXY=true` **only** behind the ALB/CloudFront (never with a directly-exposed task).
- [ ] RDS in private subnets, reachable only from the backend SG; TLS to RDS; not publicly accessible.
- [ ] Secrets only in Secrets Manager; none in images, task defs (plaintext), or git.
- [ ] `CORS_ORIGINS` = exact prod origin(s).
- [ ] SES out of sandbox + DKIM before `REQUIRE_EMAIL_VERIFICATION=true`.
- [ ] CloudWatch retention + alarms (5xx rate, DB connections, task restarts).
- [ ] WAF on CloudFront (Phase 3) for basic bot/rate protection at the edge.

## 12. Open decisions (need your input)
1. **Budget/tier:** start at Phase 1 MVP (~$35/mo) or go straight to Phase 2 Fargate?
2. **Domain:** what domain/subdomain, and single-origin (CloudFront routes `/api/*`) vs split
   `app.` + `api.` subdomains?
3. **Region:** `us-east-1` (simplest for CloudFront certs) or elsewhere?
4. **Email provider:** SES (assumed here) or an external relay (Postmark/SendGrid)?
5. **IaC:** hand-click the console first, or should the next step be Terraform/CloudFormation so
   it's reproducible? (Recommended: Terraform once the shape is agreed.)
6. **Scope of my involvement:** this doc is plan-only. Say the word and I can draft the Terraform,
   the Dockerfile/entrypoint tweaks for the migration split, the `/health` route, and the CI
   deploy job — each as reviewable changes, no live infra touched without your go-ahead.

# Runbook: Enabling SES Email Delivery and the Verification Gate

[← Back to README](../../README.md) · Related: [Notifications design](../design/notifications.md) · [Authentication design](../design/authentication.md)

This runbook covers every step to go from "email delivery is disabled (SMTP_HOST is blank, messages are logged)" to "email is live and unverified accounts are blocked from data routes."

The verification gate shipped dark (PR #189): `REQUIRE_EMAIL_VERIFICATION=false` by default. **Do not flip that flag until you have confirmed email delivery is working end-to-end.** Turning it on without working SMTP locks out every unconfirmed email/password account.

---

## Pre-flight checklist

Before touching anything in production, confirm all of the following:

- [ ] You have AWS console access and permission to create SES identities and IAM credentials.
- [ ] You control DNS for the sending domain (to add SPF, DKIM, and DMARC records).
- [ ] You know the production `APP_BASE_URL` (e.g. `https://app.meditationos.app`).
- [ ] You have a real throwaway inbox (not the sending address) to receive a test message.
- [ ] Secrets will be stored in environment variables or AWS Parameter Store — not in code or git.
- [ ] You have a rollback plan: you can set `REQUIRE_EMAIL_VERIFICATION=false` and restart within minutes.

---

## Step 1: Provision Amazon SES

SES is the email provider for the AWS stack (see `.claude/rules/infrastructure.md`). It exposes a standard SMTP relay that the app's `_deliver_smtp` function connects to via STARTTLS on port 587.

### 1a. Verify a sending identity

SES requires that every `From:` address or domain is a **verified identity** before it will send on your behalf.

**Option A — verify the whole domain** (recommended for production):
- In the SES console, go to **Verified Identities** and create a new **Domain** identity.
- SES will present a set of **CNAME records** for DKIM (Easy DKIM — see Step 2) and a **TXT record** for domain ownership verification.
- Add those records to your DNS provider and wait for SES to show the identity as **Verified** (typically a few minutes to an hour, depending on TTL).

**Option B — verify a single email address** (quicker for testing):
- Create a new **Email address** identity (e.g. `noreply@meditationos.app`).
- SES sends a confirmation link to that address; click it to verify.
- Note: a single-address identity does not give you domain-level SPF/DKIM coverage — use Option A for production.

### 1b. Request production access (move out of the SES sandbox)

New SES accounts are in the **sandbox**: they can only send to addresses that are themselves verified in SES. You must request production access before sending to real users.

- In the SES console, open **Account dashboard** and locate the **Production access** section.
- Submit the **Request production access** form. Provide your use case (transactional verification email for a wellness app), expected volume, and how you handle bounces and complaints.
- AWS typically responds within 24 hours. You cannot skip this step — sandbox restrictions will cause deliveries to real users to bounce or be silently dropped.

### 1c. Generate SES SMTP credentials

SES SMTP credentials are **not** your AWS access keys. They are derived from an IAM user and look different from regular AWS credentials. Do not confuse them.

- In the SES console, go to **SMTP settings**.
- Choose **Create SMTP credentials**. This creates a dedicated IAM user with the `ses:SendRawEmail` permission and generates a username/password pair.
- Download or copy these credentials immediately — the password is shown only once.
- The SMTP endpoint follows the format:

```
email-smtp.<region>.amazonaws.com
```

For example, `email-smtp.us-east-1.amazonaws.com` for US East (N. Virginia). Use port **587** with STARTTLS (which matches `smtp_port = 587` and the STARTTLS call in `_deliver_smtp`).

---

## Step 2: Domain authentication (SPF, DKIM, DMARC)

Without these DNS records, verification emails land in spam — or are rejected outright — and the gate silently locks users out. This is the most important step for deliverability.

### Why it matters

- **SPF** tells receiving mail servers that SES is authorised to send on behalf of your domain. Without it, many servers mark the mail as suspicious or drop it.
- **DKIM** cryptographically signs each message so the receiver can verify it was not tampered with in transit. SES Easy DKIM handles key generation and rotation.
- **DMARC** ties SPF and DKIM together and tells receivers what to do when a message fails both checks (quarantine or reject). It also enables aggregate reports so you can monitor for spoofing.

### SPF record

Add a `TXT` record to the root of your sending domain:

```
Type:  TXT
Name:  @   (or your domain, e.g. meditationos.app)
Value: "v=spf1 include:amazonses.com ~all"
TTL:   3600
```

If you already have an SPF record (e.g. for G Suite), add `include:amazonses.com` to the existing record rather than creating a second TXT — a domain must have at most one SPF record.

### DKIM (SES Easy DKIM)

When you created the domain identity in Step 1a, SES generated three CNAME records for Easy DKIM. They look like this:

```
Type:  CNAME
Name:  <selector1>._domainkey.meditationos.app
Value: <selector1>.dkim.amazonses.com

Type:  CNAME
Name:  <selector2>._domainkey.meditationos.app
Value: <selector2>.dkim.amazonses.com

Type:  CNAME
Name:  <selector3>._domainkey.meditationos.app
Value: <selector3>.dkim.amazonses.com
```

The actual selector names and values come from the SES console — copy them exactly. Add all three CNAMEs. Once DNS propagates, SES shows **DKIM: Verified** on the identity.

### DMARC record

Add a `TXT` record at `_dmarc.<your-domain>`:

```
Type:  TXT
Name:  _dmarc.meditationos.app
Value: "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@meditationos.app"
TTL:   3600
```

Start with `p=quarantine` rather than `p=reject` until you are confident SPF and DKIM are passing for all your mail streams. Change to `p=reject` once aggregate reports confirm clean alignment. The `rua` address receives XML digest reports — use an address you actually monitor, or a free DMARC reporting service.

---

## Step 3: Set environment variables

All six values below must be present in the production environment. Store them via environment variable injection or AWS Parameter Store — never in `.env` committed to git (see `.claude/rules/infrastructure.md`).

```bash
# SES SMTP relay host for the region where your verified identity lives
SMTP_HOST=email-smtp.us-east-1.amazonaws.com

# Port for STARTTLS (matches the app default — include it explicitly for clarity)
SMTP_PORT=587

# SES SMTP username (from Step 1c — NOT an AWS access key ID)
SMTP_USER=<ses-smtp-username>

# SES SMTP password (from Step 1c — shown only once at creation)
SMTP_PASSWORD=<ses-smtp-password>

# Must exactly match a verified SES identity (domain or address from Step 1a)
EMAIL_FROM=MeditationOS <noreply@meditationos.app>

# The real production frontend origin — used to build the verify link in emails
# Must NOT be localhost; the link must reach the deployed frontend
APP_BASE_URL=https://app.meditationos.app
```

**Field mapping to `backend/app/core/config.py`:**

| Env var | Config field | Notes |
|---|---|---|
| `SMTP_HOST` | `smtp_host` | Empty string disables delivery; app logs instead |
| `SMTP_PORT` | `smtp_port` | Defaults to 587 if omitted |
| `SMTP_USER` | `smtp_user` | If blank, login step is skipped (not valid for SES) |
| `SMTP_PASSWORD` | `smtp_password` | SES SMTP password, not an AWS secret key |
| `EMAIL_FROM` | `email_from` | Must be a verified SES identity |
| `APP_BASE_URL` | `app_base_url` | Used in `send_verification_email` to build the `/verify-email?token=...` link |

After setting these, restart the backend. With `SMTP_HOST` set, `send_email` in `backend/app/services/notifications/email.py` will call `_deliver_smtp` instead of logging.

---

## Step 4: Verify email delivery before enabling the gate

**Do not skip this step.** If you enable the gate with broken delivery, every unconfirmed account is locked out with a `403` and the resend endpoint can't help them.

### 4a. Send a test message end-to-end

1. Register a new account with a throwaway email address you can actually receive at (e.g. a Gmail alias).
2. Check the inbox. The subject is **"Confirm your MeditationOS email"**.
3. If it does not arrive within a few minutes, check the spam/junk folder.
4. Click the link. It should open `APP_BASE_URL/verify-email?token=...` and the frontend should complete verification.
5. Confirm the account is now verified:

```bash
# While logged in as that account, call the /me endpoint
curl -s https://app.meditationos.app/api/v1/auth/me \
  -H "Cookie: access_token=<your-session-cookie>" \
  | python3 -m json.tool | grep email_verified
```

Expect: `"email_verified": true`

### 4b. If the email does not arrive

First check the application log for delivery errors. The logger name is `meditationos.email` (see `backend/app/services/notifications/email.py`, line 21):

```
# In CloudWatch or your log stream, filter for:
meditationos.email
```

If you see `email delivery failed to=... subject=...` with an exception, the SMTP credentials or host are wrong. Common causes:

- `SMTP_HOST` is set to the wrong region endpoint.
- `SMTP_USER` / `SMTP_PASSWORD` are the IAM access key instead of the SES SMTP credential.
- The sending domain or address in `EMAIL_FROM` is not yet verified in SES.
- SES is still in sandbox mode and the recipient address is not verified.

**Test SMTP connectivity independently** (from the EC2 instance or a shell with access to SES):

```bash
python3 - <<'EOF'
import smtplib
smtp = smtplib.SMTP("email-smtp.us-east-1.amazonaws.com", 587, timeout=10)
smtp.starttls()
smtp.login("<SMTP_USER>", "<SMTP_PASSWORD>")
print("Login OK")
smtp.quit()
EOF
```

If login fails, regenerate SES SMTP credentials (Step 1c). If the connection itself times out, check that the EC2 security group allows outbound TCP on port 587.

---

## Step 5: Enable the verification gate

Once you have confirmed that a real verification email arrives and the link works:

1. Set the flag in the production environment:

```bash
REQUIRE_EMAIL_VERIFICATION=true
```

2. Restart the backend. The change takes effect immediately on the next request (the config is read at startup).

### What users experience after the gate is on

- **Email/password accounts that have not verified:** every data route (`/api/v1/sessions`, `/api/v1/journals`, `/api/v1/sanctuary`, etc.) returns `403 Forbidden` with the detail `"Please confirm your email address to continue."` The auth routes (`/api/v1/auth/verify-email`, `/api/v1/auth/verify-email/resend`, `/api/v1/auth/logout`) remain open.
- **Google sign-in accounts:** unaffected — they arrive with `email_verified = true`.
- **Guest accounts:** unaffected — guests are created with `email_verified = true`.

### Existing unconfirmed accounts

Any account registered before the gate is enabled that has not clicked its verification link will be blocked the moment the flag is set. Those users can:

1. Use `POST /api/v1/auth/verify-email/resend` (authenticated, rate-limited at the same limit as login — `LOGIN_RATE_LIMIT`, default `5/minute` per IP) to request a new link.
2. Click the new link to verify and regain access.

Consider sending a proactive email to all unconfirmed accounts before enabling the gate, so they are not surprised. (This is a one-off task; the app does not do this automatically.)

---

## Step 6: Rollback

### Disabling the gate (instant, no code deploy)

If you need to un-gate accounts immediately:

1. Set `REQUIRE_EMAIL_VERIFICATION=false` in the environment.
2. Restart the backend.

The `require_email_verification` config field defaults to `False`. The gate is a pure config check in `backend/app/api/deps.py` (`require_verified_email`) — there is no database migration to reverse.

### Detecting mail delivery failures

The application logs every delivery failure at `ERROR` level via the `meditationos.email` logger:

```
email delivery failed to=<address> subject=<subject>
```

In CloudWatch, set a metric filter or alarm on log lines containing `email delivery failed` to get notified when SES is rejecting or timing out. The `send_email` function never raises — a failure returns `False` to the caller and logs the exception — so the app stays up even if SES is unreachable.

If delivery is failing:
- Check the SES sending quota and bounce/complaint rates in the SES console (high bounce rates can cause AWS to suspend sending).
- Verify the SES SMTP credentials have not been rotated or the IAM user disabled.
- Roll back the gate (`REQUIRE_EMAIL_VERIFICATION=false`) until delivery is restored, so users are not locked out.

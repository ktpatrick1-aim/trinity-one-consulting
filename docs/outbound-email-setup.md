# Trinity One Consulting — Outbound Email Infrastructure Setup

## Overview

This document covers the full setup of Trinity One Consulting's outbound cold email infrastructure using:

- **Saleshandy** — Email sequencing, tracking, and auto-generated mailboxes
- **Namecheap Private Email** — 5 custom domain email accounts for outbound sending

---

## Table of Contents

1. [Infrastructure Architecture](#infrastructure-architecture)
2. [Saleshandy Setup](#saleshandy-setup)
3. [Namecheap Email Setup (5 Accounts)](#namecheap-email-setup)
4. [DNS Authentication (SPF, DKIM, DMARC)](#dns-authentication)
5. [Connecting Mailboxes to Saleshandy](#connecting-mailboxes-to-saleshandy)
6. [Email Warmup & Deliverability](#email-warmup--deliverability)
7. [Sending Limits & Best Practices](#sending-limits--best-practices)
8. [Troubleshooting](#troubleshooting)

---

## 1. Infrastructure Architecture

```
┌─────────────────────────────────────────────────────┐
│                   SALESHANDY                        │
│                                                     │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │  Saleshandy   │    │   Namecheap Email (x5)    │  │
│  │  Generated    │    │                           │  │
│  │  Mailboxes    │    │  1. outreach@domain.com   │  │
│  │  (TrulyInbox) │    │  2. connect@domain.com    │  │
│  │               │    │  3. hello@domain.com      │  │
│  │  Auto-created │    │  4. partnerships@domain   │  │
│  │  & managed    │    │  5. growth@domain.com     │  │
│  └──────┬───────┘    └───────────┬───────────────┘  │
│         │                        │                   │
│         └──────────┬─────────────┘                   │
│                    ▼                                 │
│           ┌────────────────┐                         │
│           │  Email Sequences│                        │
│           │  & Campaigns    │                        │
│           └────────────────┘                         │
│                    │                                 │
│                    ▼                                 │
│           ┌────────────────┐                         │
│           │   Prospects     │                        │
│           │   (Cold Leads)  │                        │
│           └────────────────┘                         │
└─────────────────────────────────────────────────────┘
```

**Why two mailbox sources?**

- **Saleshandy-generated mailboxes** provide pre-warmed, high-deliverability addresses managed entirely within Saleshandy's ecosystem. They're quick to deploy and optimized for cold outreach.
- **Namecheap email accounts** give you branded, custom-domain addresses that match your business identity, adding legitimacy and brand recognition to outreach.

Using both maximizes sending volume while distributing reputation risk across multiple mailboxes and providers.

---

## 2. Saleshandy Setup

### 2.1 Account & Plan

1. Sign up / log in at [saleshandy.com](https://www.saleshandy.com)
2. Ensure your plan supports:
   - Multiple mailbox connections
   - Email sequencing
   - Built-in mailbox provisioning (TrulyInbox / Saleshandy-generated mailboxes)
   - Email warmup

### 2.2 Saleshandy-Generated Mailboxes

Saleshandy offers auto-generated mailboxes through their TrulyInbox integration:

1. Go to **Settings → Email Accounts → Add Email Account**
2. Select **"Saleshandy Mailbox"** (or TrulyInbox option)
3. Saleshandy will auto-provision mailboxes with:
   - Pre-configured SPF/DKIM/DMARC
   - Built-in warmup
   - Optimized sending infrastructure
4. Note the generated email addresses for your records

**Advantages:**
- No DNS configuration needed
- Pre-warmed from day one
- Managed deliverability
- Quick to deploy

**Tracking:**

| Mailbox # | Generated Email Address | Status | Warmup Started | Notes |
|-----------|------------------------|--------|----------------|-------|
| 1         |                        | [ ]    |                |       |
| 2         |                        | [ ]    |                |       |
| 3         |                        | [ ]    |                |       |

---

## 3. Namecheap Email Setup

### 3.1 Purchase Namecheap Private Email

1. Log in to [namecheap.com](https://www.namecheap.com)
2. Go to **Dashboard → Domain → Manage → Email**
3. Purchase **Private Email** (Starter, Pro, or Ultimate plan)
   - Starter is sufficient for outbound — provides email + webmail access
   - Ensure you purchase **5 mailboxes**

### 3.2 Create 5 Email Accounts

Set up 5 distinct email accounts. Use professional, role-based or person-based naming:

| # | Email Address                | Purpose / Persona        | Password Set | Status |
|---|------------------------------|--------------------------|--------------|--------|
| 1 | outreach@[yourdomain].com    | Primary outreach         | [ ]          | [ ]    |
| 2 | connect@[yourdomain].com     | Partnership outreach     | [ ]          | [ ]    |
| 3 | hello@[yourdomain].com       | Friendly intro sequences | [ ]          | [ ]    |
| 4 | partnerships@[yourdomain].com| B2B partnership focus    | [ ]          | [ ]    |
| 5 | growth@[yourdomain].com      | Growth-focused outreach  | [ ]          | [ ]    |

**Alternative naming (persona-based):**
- firstname@domain.com (e.g., kevin@, kt@, kp@)
- firstname.lastname@domain.com

> **Tip:** Persona-based emails (e.g., kevin@domain.com) tend to have higher reply rates than role-based (e.g., outreach@domain.com) for cold outreach.

### 3.3 Namecheap Private Email Settings

For each mailbox, note the IMAP/SMTP settings:

**Incoming Mail (IMAP):**
- Server: `mail.privateemail.com`
- Port: `993`
- Security: `SSL/TLS`

**Outgoing Mail (SMTP):**
- Server: `mail.privateemail.com`
- Port: `465`
- Security: `SSL/TLS`

---

## 4. DNS Authentication

Proper DNS setup is **critical** for deliverability. All records are configured in Namecheap's DNS management panel.

### 4.1 SPF (Sender Policy Framework)

SPF tells receiving servers which mail servers are authorized to send email on behalf of your domain.

**DNS Record:**
```
Type:  TXT
Host:  @
Value: v=spf1 include:spf.privateemail.com ~all
```

> If you also use Saleshandy's SMTP or other services, combine them:
> ```
> v=spf1 include:spf.privateemail.com include:spf.saleshandy.com ~all
> ```

**Verification:**
```bash
nslookup -type=txt yourdomain.com
# or
dig txt yourdomain.com
```

### 4.2 DKIM (DomainKeys Identified Mail)

DKIM adds a digital signature to your emails to verify they haven't been tampered with.

**Steps:**
1. Log in to Namecheap → **Private Email Dashboard**
2. Navigate to **Domain Settings → Email Authentication → DKIM**
3. Namecheap will provide DKIM records (typically a CNAME or TXT record)
4. Add the provided record to your DNS:

```
Type:  TXT (or CNAME, depending on Namecheap's instructions)
Host:  default._domainkey (or as specified)
Value: [provided by Namecheap]
```

**Verification:**
```bash
nslookup -type=txt default._domainkey.yourdomain.com
```

### 4.3 DMARC (Domain-based Message Authentication)

DMARC tells receiving servers what to do with emails that fail SPF/DKIM checks.

**Start with a monitoring policy (recommended for initial setup):**
```
Type:  TXT
Host:  _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com; ruf=mailto:dmarc-reports@yourdomain.com; fo=1
```

**After warmup is complete and deliverability is confirmed, tighten to quarantine:**
```
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourdomain.com; pct=100
```

**Final production policy (after 2-4 weeks of clean sending):**
```
Value: v=DMARC1; p=reject; rua=mailto:dmarc-reports@yourdomain.com; pct=100
```

### 4.4 Custom Tracking Domain (Saleshandy)

Set up a custom tracking domain to avoid shared tracking domains that may be blacklisted:

1. In Saleshandy: **Settings → Custom Tracking Domain**
2. Add a CNAME record in Namecheap DNS:

```
Type:  CNAME
Host:  track (or link, or email)
Value: [provided by Saleshandy, e.g., cname.saleshandy.com]
```

This makes tracked links appear as `track.yourdomain.com` instead of a shared Saleshandy domain.

### 4.5 DNS Checklist

| Record   | Type  | Host              | Value                              | Added | Verified |
|----------|-------|-------------------|------------------------------------|-------|----------|
| SPF      | TXT   | @                 | v=spf1 include:...                 | [ ]   | [ ]      |
| DKIM     | TXT   | default._domainkey| [from Namecheap]                   | [ ]   | [ ]      |
| DMARC    | TXT   | _dmarc            | v=DMARC1; p=none; ...              | [ ]   | [ ]      |
| Tracking | CNAME | track             | [from Saleshandy]                  | [ ]   | [ ]      |
| MX       | MX    | @                 | mx1.privateemail.com (Priority 10) | [ ]   | [ ]      |
| MX       | MX    | @                 | mx2.privateemail.com (Priority 20) | [ ]   | [ ]      |

---

## 5. Connecting Mailboxes to Saleshandy

### 5.1 Connect Each Namecheap Email Account

For each of the 5 Namecheap mailboxes:

1. Go to **Saleshandy → Settings → Email Accounts → Add Email Account**
2. Select **"Other Email Provider"** (SMTP/IMAP)
3. Enter the credentials:

   **IMAP Settings:**
   - Email: `[your-email]@yourdomain.com`
   - Password: `[email password]`
   - IMAP Server: `mail.privateemail.com`
   - Port: `993`
   - Security: `SSL`

   **SMTP Settings:**
   - SMTP Server: `mail.privateemail.com`
   - Port: `465`
   - Security: `SSL`

4. Click **Connect** and verify the connection
5. Repeat for all 5 accounts

### 5.2 Connection Checklist

| Email Account                | IMAP Connected | SMTP Connected | Warmup Enabled | Assigned to Sequence |
|------------------------------|----------------|----------------|----------------|----------------------|
| 1. outreach@domain.com       | [ ]            | [ ]            | [ ]            | [ ]                  |
| 2. connect@domain.com        | [ ]            | [ ]            | [ ]            | [ ]                  |
| 3. hello@domain.com          | [ ]            | [ ]            | [ ]            | [ ]                  |
| 4. partnerships@domain.com   | [ ]            | [ ]            | [ ]            | [ ]                  |
| 5. growth@domain.com         | [ ]            | [ ]            | [ ]            | [ ]                  |

---

## 6. Email Warmup & Deliverability

### 6.1 Enable Warmup in Saleshandy

1. Go to **Email Accounts** in Saleshandy
2. For **each connected mailbox** (both Saleshandy-generated and Namecheap):
   - Toggle **Email Warmup → ON**
   - Set warmup parameters:
     - **Daily warmup limit:** Start at 2-5/day, ramp to 30-40/day
     - **Reply rate:** 30-40%
     - **Ramp-up increment:** 2-3 emails/day

### 6.2 Warmup Schedule

**Week 1-2: Foundation**
- Send 2-5 warmup emails/day per mailbox
- Do NOT send any cold emails yet
- Monitor inbox placement

**Week 3-4: Ramp Up**
- Increase to 10-20 warmup emails/day
- Begin light cold outreach (5-10 emails/day per mailbox)
- Monitor bounce rates and spam complaints

**Week 5+: Full Operations**
- Warmup continues in background (20-30/day)
- Scale cold outreach to 30-50 emails/day per mailbox
- Keep warmup ON even during active campaigns

### 6.3 Warmup Tracking

| Mailbox             | Warmup Start | Week 1 Vol | Week 2 Vol | Week 3 Vol | Inbox Rate | Ready for Outreach |
|---------------------|-------------|------------|------------|------------|------------|-------------------|
| Saleshandy #1       |             |            |            |            |            | [ ]               |
| Saleshandy #2       |             |            |            |            |            | [ ]               |
| Namecheap #1        |             |            |            |            |            | [ ]               |
| Namecheap #2        |             |            |            |            |            | [ ]               |
| Namecheap #3        |             |            |            |            |            | [ ]               |
| Namecheap #4        |             |            |            |            |            | [ ]               |
| Namecheap #5        |             |            |            |            |            | [ ]               |

---

## 7. Sending Limits & Best Practices

### 7.1 Daily Sending Limits

| Provider              | Max Emails/Day (Per Mailbox) | Recommended Cold/Day | Warmup Emails/Day |
|-----------------------|------------------------------|----------------------|--------------------|
| Namecheap Private     | 500                          | 30-50                | 20-30              |
| Saleshandy Generated  | Varies by plan               | 30-50                | Auto-managed       |

**Total daily capacity (conservative):**
- 5 Namecheap accounts × 40 cold/day = **200 cold emails/day**
- Saleshandy mailboxes: additional **60-100 cold emails/day**
- **Total: ~260-300 cold emails/day**

### 7.2 Best Practices

**Sending:**
- Space emails at least 60-120 seconds apart
- Send during business hours (8am-6pm recipient's timezone)
- Use Saleshandy's send-time optimization
- Rotate mailboxes across sequences (Saleshandy handles this via sender rotation)

**Content:**
- Keep cold emails under 150 words
- Avoid spam trigger words (free, guarantee, act now, etc.)
- Use plain text or minimal HTML
- Personalize with {{firstName}}, {{companyName}}, etc.
- Include a clear, soft CTA (question, not a hard sell)
- Add an unsubscribe link or opt-out text

**Domain Health:**
- Monitor domain reputation at [Google Postmaster Tools](https://postmaster.google.com)
- Check blacklists weekly at [MXToolbox](https://mxtoolbox.com/blacklists.aspx)
- Keep bounce rate under 3%
- Keep spam complaint rate under 0.1%

**Mailbox Rotation:**
- Enable **Sender Rotation** in Saleshandy sequence settings
- Distribute sending load evenly across all mailboxes
- If one mailbox shows deliverability issues, pause it and investigate

---

## 8. Troubleshooting

### Common Issues

| Issue                        | Likely Cause                          | Fix                                                |
|------------------------------|---------------------------------------|-----------------------------------------------------|
| Emails landing in spam       | Missing/incorrect SPF, DKIM, DMARC   | Verify DNS records; check with MXToolbox            |
| High bounce rate (>3%)       | Bad lead data / old lists             | Verify emails before uploading; use email verifier  |
| Low open rates (<20%)        | Subject lines or deliverability       | A/B test subjects; check inbox placement            |
| Connection error in Saleshandy| Wrong SMTP/IMAP settings             | Verify server: mail.privateemail.com, ports 993/465 |
| Warmup not progressing       | Too aggressive ramp-up               | Reset warmup; start slower                          |
| Blacklisted domain           | Sending too fast / spam complaints    | Request delisting; pause sending; review content    |

### Useful Diagnostic Tools

- **MXToolbox:** [mxtoolbox.com](https://mxtoolbox.com) — DNS, blacklist, SMTP diagnostics
- **Mail-Tester:** [mail-tester.com](https://www.mail-tester.com) — Send a test email, get a spam score
- **Google Postmaster Tools:** [postmaster.google.com](https://postmaster.google.com) — Domain reputation with Gmail
- **Saleshandy Deliverability Score:** Built-in within Saleshandy dashboard

---

## Setup Completion Checklist

### Phase 1: Infrastructure
- [ ] Namecheap Private Email purchased (5 mailboxes)
- [ ] All 5 email accounts created with strong passwords
- [ ] SPF record added and verified
- [ ] DKIM record added and verified
- [ ] DMARC record added (p=none for monitoring)
- [ ] MX records confirmed
- [ ] Custom tracking domain configured

### Phase 2: Saleshandy Configuration
- [ ] Saleshandy account active with appropriate plan
- [ ] Saleshandy-generated mailboxes provisioned
- [ ] All 5 Namecheap accounts connected via SMTP/IMAP
- [ ] Custom tracking domain verified in Saleshandy
- [ ] Sender signatures/footers configured

### Phase 3: Warmup
- [ ] Warmup enabled on ALL mailboxes
- [ ] Warmup running for minimum 2 weeks before cold outreach
- [ ] Inbox placement rate >95% confirmed
- [ ] No mailboxes blacklisted

### Phase 4: Go Live
- [ ] First cold sequence created
- [ ] Sender rotation enabled
- [ ] Sending schedule configured (business hours)
- [ ] Unsubscribe/opt-out mechanism in place
- [ ] Monitoring dashboards set up (Postmaster Tools, MXToolbox alerts)

---

*Last updated: 2026-04-04*
*Trinity One Consulting — Outbound Marketing Infrastructure*

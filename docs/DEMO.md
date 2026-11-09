# 15-minute demo script

**Before the demo**

- Two browser profiles (or one normal + one private window): **Admin** (bootstrapped) and **Member** (added under Settings → People, signed up and verified).
- Start with an empty knowledge base, or seed everything except the handbook so you can upload it live.
- For the quota demo, use a second deployment/env with `MONTHLY_QUERY_LIMIT=3`, or a member who has already used most of their quota. (Changing the limit requires an API restart: `docker compose up -d api`.)
- Have `demo-documents/` open in Finder/Explorer for drag-and-drop.

| Time | Segment | What to show / say |
|---|---|---|
| 0–2 | **Architecture** | README diagram: one origin behind Nginx; Next.js UI; Express modular monolith (auth, users, documents, search, chat, ai, usage, audit); MongoDB Atlas; Clerk; Claude. Key choices: keyword search first, synchronous bounded ingestion, access control *inside* the query, atomic quotas. |
| 2–4 | **Admin upload** | Sign in as Admin → Overview metrics → **Upload Document** → drag `01-employee-handbook.md` → access *Everyone* → *Upload and index*. Point out the honest "Processing…" state, then the success alert with section count. Try uploading it again → **duplicate detected (409)**. Try a `.pdf` → rejected client-side and server-side. |
| 4–6 | **Document management** | **Documents** table: search, status and access filters, pagination. Open the handbook → indexed sections with heading paths (`Remote and Hybrid Work › Home Office Allowance`). Rename it; show the audit log under Settings. |
| 6–9 | **Member Q&A** | Sign in as Member → **Ask Assistant** → suggested question *"How many annual leave days do employees get?"* → answer cites **Annual Leave Policy › Entitlement**. Ask *"What should I do if I'm sick?"* and *"How do I roll back a production deployment?"*. Show Enter vs Shift+Enter, usage meter decrementing. |
| 9–11 | **Citations & no-answer** | Expand a source to show the excerpt. Ask *"What is the capital of France?"* → clearly styled **No answer found** (no AI call made — mention the relevance threshold). Ask *"Do we have a dress code?"* → retrieval finds Code of Conduct but the model returns `found=false` → no-answer. |
| 11–12 | **Admin-only isolation** | As Admin, upload `06-confidential-executive-compensation.md` as **Admin only**. Admin asks *"What is the executive bonus pool?"* → answer with citation. Member asks the same → no-answer. Mention the test that inspects the exact AI payload for members. Toggle the handbook to admin-only from the table → member immediately loses access to it. |
| 12–13 | **Usage limits** | Member at the limit: composer disabled, banner "You've reached your monthly question limit" with the **reset date**. Mention: atomic conditional increment in a transaction; 12 concurrent requests vs. limit 3 → exactly 3 succeed (test); failed AI calls are refunded once; retries use an idempotency key. |
| 13–15 | **Security, deployment, trade-offs** | Server-side JWT verification (signature, expiry, `azp`), role from DB, disabled users blocked (disable the member in Settings → their next request fails). Prompt-injection handling + citation validation. HTTPS/HSTS, rate limits, non-root containers, Atlas IP allow-list. Trade-offs: keyword vs. vector search (and the planned fix), synchronous ingestion, single-instance rate limiting. |

**Good questions to have ready**

- *"Can I work from another country?"* → Remote Work FAQ (plain-text upload) › Working Abroad
- *"What is the home office allowance?"* → Employee Handbook › Home Office Allowance
- *"When can we deploy to production?"* → Deployment Runbook › Deployment Windows
- *"How many unused leave days can I carry over?"* → Annual Leave Policy › Carry-Over
- *"Is the Rotterdam office closing?"* → admin: answered from the confidential doc; member: no-answer

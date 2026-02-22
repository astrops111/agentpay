# AgentPay MVP: What to Build First

## Recommended first build slice

Build **the Authorization + Billing safety core** first, with a thin API surface.

This gives the highest-risk, highest-value behavior early:

1. Hard caps (`$2,000`, `5 transactions`)
2. Billing gate at authorization time
3. Fail-safe default-to-decline decisions
4. Idempotent authorization handling

## Why this first

- It validates the core economic safety guarantees.
- It creates a deterministic decision engine you can expand behind.
- It de-risks issuer integration by proving the internal state machine first.

## Phase 1 deliverables

### 1) Data model baseline
- Users and user states
- Cards and card states
- Authorization attempts + idempotency keys
- Transactions and counters
- Billing accounts, invoices, usage records
- Audit logs and state transitions

### 2) API endpoints (minimum viable)
- `POST /authorize`
- `POST /suspend`
- `GET /usage`

### 3) Authorization rules engine
- Checks from PRD section 6.3.2 in deterministic order
- Decline on uncertainty
- Retry-once semantics for temporary failures

### 4) Billing validation gate
- Ensure billing account is active before approving authorization
- Enforce unpaid invoice and payment method checks

### 5) Counter update pipeline
- Update `transaction_count` and `total_spent` on successful capture
- Auto-suspend when count reaches 5

## What is now implemented in `db/`

- `schema.sql`: core relational model and constraints.
- `functions.sql`: PL/pgSQL precheck function `authorize_precheck(...)` with deterministic rule-order checks, idempotent replay behavior, and cap enforcement.
- `triggers.sql`: automatic `updated_at` maintenance and billing-to-card/user suspension invariant.
- `bootstrap.sql`: single entrypoint (`psql -f db/bootstrap.sql`) to initialize schema, functions, and triggers.

## Phase 2

- Dashboard overview and transactions APIs
- Billing management APIs
- Plan switching and invoice download flows

## Exit criteria for Phase 1

- No approvals when billing inactive
- No user exceeds 5 successful captures
- No user exceeds `$2,000` total spend
- Duplicate idempotency requests return consistent responses

# AgentPay – Product Requirements Document (MVP)

## 1. Product Overview

AgentPay enables AI agents to execute payments on behalf of users through tightly controlled virtual cards with built-in authorization guardrails and billing controls.

The system:

- Issues virtual cards (US only)
- Enforces hard spending and transaction limits
- Supports PRE_AUTH authorization flow
- Supports subscription and pay-per-use billing
- Provides a user dashboard
- Defaults to fail-safe decline behavior

---

## 2. MVP Constraints

| Constraint | Value |
|------------|--------|
| Region | United States only |
| 3DS | Not supported |
| Max transactions per user | 5 |
| Max total spend per user | $2,000 |
| One active authorization | Yes |
| Grace window | 2 minutes |
| Authorization latency | <1 second |
| Max scale | 10,000 users |
| Log retention | 180 days |

---

## 3. Goals

### Primary Goal
Allow AI agents to transact safely under strict user-defined rules while generating platform revenue.

### Success Metrics

- 100% rule-based decisioning
- <1s authorization time
- No overspending beyond $2,000 cap
- No more than 5 successful transactions per user
- <1% billing failure leakage

---

## 4. User Roles

### 4.1 End User
- Creates account
- Selects billing plan
- Activates AgentPay
- Reviews transactions
- Manages billing
- Can suspend card

### 4.2 AI Agent
- Requests transaction authorization
- Submits item-level metadata
- Receives decision

### 4.3 Admin
- View logs
- Suspend users
- Monitor billing health

---

## 5. Core System Components

1. User Service  
2. Card Issuing Service  
3. Authorization Engine  
4. Billing Service  
5. Invoice Engine  
6. Dashboard API  
7. Database  
8. Event Bus  

---

## 6. Functional Requirements

### 6.1 User Onboarding

Collect:

- Full name
- Email
- Phone
- Billing address
- SSN last 4 (if issuer requires)
- Consent to terms

Identity verification delegated to issuer.

User status created as:

`ACTIVE`

---

### 6.2 Virtual Card Issuance

Triggered when user activates AgentPay.

Card attributes:

- Virtual only
- US restricted
- Linked to user
- $2,000 max lifetime cap
- No 3DS
- One active authorization session

Card states:

- ACTIVE
- SUSPENDED
- EXPIRED
- TERMINATED

---

### 6.3 Authorization Engine

#### POST /authorize

```json
{
  "user_id": "...",
  "agent_id": "...",
  "amount": 150.00,
  "currency": "USD",
  "merchant_name": "...",
  "mcc": "...",
  "items": [],
  "metadata": {},
  "idempotency_key": "..."
}

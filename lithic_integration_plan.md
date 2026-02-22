# AgentPay with Lithic: System Design & Implementation Plan

This document outlines the architecture and workflows for **AgentPay**, an orchestration layer that allows AI agents to make purchases securely using Lithic virtual cards while keeping human-in-the-loop (HITL) control.

## System Overview

> [!TIP]
> **View Visual Flows**: Refer to the [System Diagrams](file:///C:/Users/TING/.gemini/antigravity/brain/32273fa3-5acc-46a4-9b49-eb01fdca9144/diagrams.md) for architecture and sequence visualizations.

AgentPay acts as a specialized "Financial Proxy." Instead of giving an agent a real credit card, the user grants the agent permission to request *ephemeral* virtual cards through AgentPay.

### Core Technology Stack (Proposed)
- **Issuer**: [Lithic](https://lithic.com/) (Cards, ACH, KYC)
- **PCI Safety**: [Lithic SDK/Tokenizer](https://docs.lithic.com/docs/tokenization) (Secure credential handling)
- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL
- **Notifications**: Telegram Bot / Mobile Push (for human approvals)

---

## 1. New User Onboarding Flow

| Step | Action | Endpoint / Service |
| :--- | :--- | :--- |
| **1. Registration** | User signs up for AgentPay. | Internal Auth Service |
| **2. KYC/KYB** | Lithic's built-in workflow is triggered. User submits details via a Lithic-hosted UI. | `POST /account_holders` (KYC_ADVANCED) |
| **3. Identity Verification** | Lithic processes verification (Asynchronous). | Webhook: `account_holder.verification` |
| **4. Funding Connection** | User connects bank via Plaid. Plaid provides a `processor_token`. | Plaid Link -> `POST /external_bank_accounts` |
| **5. Policy Setup** | User defines "Safety Rails" (e.g., "Max $100 per agent request", "No gambling MCCs"). | Internal DB (`policies` table) |
| **6. Agent Linking** | User generates an `Agent-Key` to use in the agent's plugin environment. | Internal Secret Management |

---

## 2. Authorization & Purchase Flow

### Sequential Workflow
1.  **Request**: Agent identifies a product and calls `POST /v1/agent/authorize` with `amount`, `merchant_name`, `purpose`, and `expected_url`.
2.  **Auto-Policy Check**: AgentPay checks internal policies.
    - If policy fails (e.g., amount too high) -> **REJECTED**.
3.  **HITL Trigger**: AgentPay sends a notification via **Telegram** or a Mobile Push app.
4.  **User Decision**:
    - **Approve**: User confirms the purchase.
    - **Decline**: Request is cancelled.
5.  **Virtual Card Provisioning**: AgentPay calls Lithic to create a `SINGLE_USE` virtual card.
    - **Spend Limit**: Set exactly to requested amount + 5% buffer.
    - **Merchant Lock**: (Optional) Use Lithic Auth Rules to lock to specified merchant.
6.  **Credential Delivery**: AgentPay uses the **Lithic Tokenizer** to provide cards to the agent.
7.  **Purchase**: Agent fills the checkout form.
8.  **Reconciliation**: Lithic sends a transaction webhook. AgentPay matches it to the request and logs the result.
9.  **Expiry**: Since the card is `SINGLE_USE`, it closes automatically after authorization.

---

## 3. Exception & Edge Case Handling

| Scenario | Handling Strategy |
| :--- | :--- |
| **KYC/KYB Pending** | User is blocked from ACH/Card actions until `ACCEPTED` webhook received. |
| **Funding Source** | Every transaction triggers an ACH debit from the connected bank. No pre-paid balance. |
| **Amount Mismatch** | If merchant charges > approved amount, Lithic declines via the card-level cap. |
| **Merchant Pre-Auth** | Some merchants do a $0/$1 hold. If using `SINGLE_USE`, the card will close. *Refinement*: Use `VIRTUAL` with `lifetime_txn_cap: 2` instead. |
| **Timeout (HITL)** | If user doesn't respond in $X$ minutes, the request expires and Agent is notified. |
| **Subscription Fraud** | Use `VIRTUAL` but with a very low `total_spend_cap` to prevent hidden recurring charges. |

---

## 4. Advanced Logic Considerations

### Handling Pre-Authorizations
Many e-commerce sites perform a "Zero-Dollar Auth" or a small hold to verify card validity before the actual charge.
- **Risk**: A `SINGLE_USE` card will close immediately after this $0 auth, causing the real purchase into fail.
- **Solution**: AgentPay should provision cards with a `lifetime_txn_cap = 2` and a `spend_limit` of `Requested + 10%`.

### PCI Safety & Agent Interface
Providing raw PAN/CVV to an AI Agent creates a security risk if the agent's logs are exposed.
- **Recommendation**: Implement a "Secure Browser Plugin" for the agent. Instead of the Agent receiving the card string, AgentPay pushes the card data to the plugin, which autofills the form on the specific `expected_url` provided in the request.

---

## 5. Compliance & Safety

- **AML Logging**: Every transaction record includes the specific Agent ID, the Prompt Context (why it was bought), and the User Approval ID.
- **Data Privacy**: The agent never sees the User's primary bank account. The card is isolated.
- **Audit Trails**: Full `state_changes` logging (similar to current `db/schema.sql` pattern).
- **Travel Rule Compliance**: Store merchant name and MCC for every origination to satisfy AML audit requirements.

---

## 6. Implementation Status
- [x] KYC: **Lithic Built-in**
- [x] PCI: **Lithic Tokenizer**
- [x] Funding: **ACH pull per transaction**
- [x] Approval: **Telegram / Mobile Push**

# AgentPay System Diagrams

This document visualizes the core flows and architecture of the AgentPay system.

## 1. System Architecture
This diagram showing the high-level orchestration between the User, Agent, AgentPay (Backend), and Lithic.

```mermaid
graph TD
    User((User))
    Agent[AI Agent]
    
    subgraph AgentPay_Platform [AgentPay Platform]
        API[API Gateway / Dashboard]
        DB[(PostgreSQL)]
        Policy[Policy Engine]
        Workflow[HITL Workflow Manager]
    end
    
    subgraph External_Services [External Services]
        Lithic[Lithic API]
        Plaid[Plaid / Bank Sync]
        KYC[KYC/KYB Vendor]
    end

    User -->|Registers / Approves| API
    Agent -->|Requests Card| API
    API --> DB
    API --> Policy
    API --> Workflow
    Workflow -->|Notify| User
    API -->|Provision Card| Lithic
    API -->|Connect Bank| Plaid
    API -->|Verify ID| KYC
```

---

## 2. New User Onboarding Flow
This sequence covers registration, KYC, and bank connection via Lithic/Plaid.

```mermaid
sequenceDiagram
    participant U as User
    participant AP as AgentPay
    participant L as Lithic
    participant P as Plaid/Bank

    U->>AP: Register Account
    AP->>L: Create Account Holder (POST /account_holders)
    L-->>AP: account_token (Status: PENDING)
    AP->>U: Redirect to KYC / Collect Data
    U->>L: Provide Identity Info
    L-->>AP: Webhook: Identification ACCEPTED
    
    U->>P: Login to Bank (Plaid Link)
    P-->>AP: processor_token
    AP->>L: Connect Funding (POST /external_bank_accounts)
    L-->>AP: Funding Source Validated
    
    AP->>U: Onboarding Complete (Setup Policies)
```

---

## 3. Purchase Authorization Flow (HITL)
The core loop where an agent requesting a card leads to a human-in-the-loop approval and ephemeral card issuance.

```mermaid
sequenceDiagram
    autonumber
    participant A as AI Agent
    participant AP as AgentPay
    participant U as User
    participant L as Lithic
    participant M as Merchant

    A->>AP: Auth Request (Amount, Merchant, Purpose)
    AP->>AP: Check Safety Policies (Hard Caps)
    
    alt Policy Failed
        AP-->>A: 403 Forbidden (Policy Violation)
    else Policy Passed
        AP->>U: Notify via Telegram/Push
        U->>AP: Approve Transaction (Inline Button)
        
        AP->>L: Create Card & Get Token
        L-->>AP: Secure Tokenized Card Data
        
        AP-->>A: Return Card via Lithic Tokenizer
        A->>M: Execute Purchase
        M->>L: Process Payment
        L->>AP: Webhook: Transaction Settled
        AP->>AP: Mark Request as Reconciled
        L->>L: Card Automatically Closes (Single Use)
    end
```

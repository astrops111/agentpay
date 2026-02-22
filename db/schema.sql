-- AgentPay MVP schema (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_status AS ENUM (
  'ACTIVE',
  'SUSPENDED',
  'SUSPENDED_BILLING',
  'CANCELED',
  'EXPIRED'
);

CREATE TYPE card_status AS ENUM (
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'TERMINATED'
);

CREATE TYPE billing_model AS ENUM (
  'SUBSCRIPTION',
  'PAY_PER_USE'
);

CREATE TYPE subscription_status AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'PAST_DUE',
  'CANCELED'
);

CREATE TYPE decision AS ENUM (
  'APPROVE',
  'DECLINE',
  'RETRY'
);

CREATE TYPE invoice_status AS ENUM (
  'PAID',
  'UNPAID',
  'FAILED'
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  billing_address JSONB NOT NULL,
  ssn_last4 CHAR(4),
  consent_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  status user_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cards (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issuer_card_token TEXT NOT NULL UNIQUE,
  last4 CHAR(4) NOT NULL,
  expires_at DATE NOT NULL,
  status card_status NOT NULL DEFAULT 'ACTIVE',
  region TEXT NOT NULL DEFAULT 'US',
  has_3ds BOOLEAN NOT NULL DEFAULT FALSE,
  lifetime_spend_cap NUMERIC(12,2) NOT NULL DEFAULT 2000.00,
  lifetime_txn_cap INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE billing_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  billing_model billing_model NOT NULL,
  subscription_status subscription_status NOT NULL DEFAULT 'INACTIVE',
  next_billing_date DATE,
  payment_method_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE authorization_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  merchant_name TEXT NOT NULL,
  mcc TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  decision decision NOT NULL,
  reason_code TEXT,
  remaining_limit NUMERIC(12,2) NOT NULL,
  remaining_transactions INTEGER NOT NULL,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, idempotency_key)
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  authorization_request_id UUID REFERENCES authorization_requests(id) ON DELETE SET NULL,
  merchant_name TEXT NOT NULL,
  mcc TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status TEXT NOT NULL,
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE usage_counters (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  transaction_count INTEGER NOT NULL DEFAULT 0 CHECK (transaction_count >= 0 AND transaction_count <= 5),
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_spent >= 0 AND total_spent <= 2000.00),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status invoice_status NOT NULL,
  payment_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE usage_records (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  billing_amount NUMERIC(12,2) NOT NULL CHECK (billing_amount >= 0),
  billed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transaction_id)
);

CREATE TABLE authorization_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'EXPIRED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE state_changes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason_code TEXT,
  changed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  agent_id TEXT,
  merchant TEXT,
  amount NUMERIC(12,2),
  decision decision,
  reason_code TEXT,
  latency_ms INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_authorization_requests_user_created
  ON authorization_requests(user_id, created_at DESC);
CREATE UNIQUE INDEX uq_authorization_sessions_single_open
  ON authorization_sessions(user_id)
  WHERE status = 'OPEN';
CREATE INDEX idx_transactions_user_created
  ON transactions(user_id, created_at DESC);
CREATE INDEX idx_invoices_user_created
  ON invoices(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_user_created
  ON audit_logs(user_id, created_at DESC);

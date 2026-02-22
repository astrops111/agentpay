-- AgentPay MVP authorization and state-management functions (PostgreSQL)

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_billing_card_invariant()
RETURNS TRIGGER AS $$
BEGIN
  -- Card cannot remain ACTIVE when billing is inactive/past due/canceled.
  IF NEW.subscription_status IN ('INACTIVE', 'PAST_DUE', 'CANCELED') THEN
    UPDATE cards
       SET status = 'SUSPENDED',
           updated_at = NOW()
     WHERE user_id = NEW.user_id
       AND status = 'ACTIVE';

    UPDATE users
       SET status = 'SUSPENDED_BILLING',
           updated_at = NOW()
     WHERE id = NEW.user_id
       AND status = 'ACTIVE';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION authorize_precheck(
  p_user_id UUID,
  p_agent_id TEXT,
  p_amount NUMERIC,
  p_currency CHAR(3),
  p_merchant_name TEXT,
  p_mcc TEXT,
  p_items JSONB,
  p_metadata JSONB,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  decision decision,
  reason_code TEXT,
  remaining_limit NUMERIC,
  remaining_transactions INTEGER,
  authorization_request_id UUID
) AS $$
DECLARE
  v_user_status user_status;
  v_card_status card_status;
  v_subscription_status subscription_status;
  v_payment_method_token TEXT;
  v_unpaid_invoices INTEGER;
  v_txn_count INTEGER;
  v_total_spent NUMERIC;
  v_existing authorization_requests%ROWTYPE;
  v_req_id UUID := gen_random_uuid();
BEGIN
  -- Idempotency short-circuit.
  SELECT *
    INTO v_existing
    FROM authorization_requests
   WHERE user_id = p_user_id
     AND idempotency_key = p_idempotency_key
   LIMIT 1;

  IF FOUND THEN
    RETURN QUERY
      SELECT v_existing.decision,
             COALESCE(v_existing.reason_code, 'IDEMPOTENT_REPLAY'),
             v_existing.remaining_limit,
             v_existing.remaining_transactions,
             v_existing.id;
    RETURN;
  END IF;

  IF p_currency <> 'USD' THEN
    RETURN QUERY SELECT 'DECLINE'::decision, 'UNSUPPORTED_CURRENCY', 0::NUMERIC, 0, NULL::UUID;
    RETURN;
  END IF;

  SELECT u.status
    INTO v_user_status
    FROM users u
   WHERE u.id = p_user_id;

  IF NOT FOUND OR v_user_status <> 'ACTIVE' THEN
    RETURN QUERY SELECT 'DECLINE'::decision, 'USER_NOT_ACTIVE', 0::NUMERIC, 0, NULL::UUID;
    RETURN;
  END IF;

  SELECT c.status
    INTO v_card_status
    FROM cards c
   WHERE c.user_id = p_user_id;

  IF NOT FOUND OR v_card_status <> 'ACTIVE' THEN
    RETURN QUERY SELECT 'DECLINE'::decision, 'CARD_NOT_ACTIVE', 0::NUMERIC, 0, NULL::UUID;
    RETURN;
  END IF;

  SELECT b.subscription_status, b.payment_method_token
    INTO v_subscription_status, v_payment_method_token
    FROM billing_accounts b
   WHERE b.user_id = p_user_id;

  IF NOT FOUND OR v_subscription_status <> 'ACTIVE' OR v_payment_method_token IS NULL THEN
    RETURN QUERY SELECT 'DECLINE'::decision, 'BILLING_INACTIVE', 0::NUMERIC, 0, NULL::UUID;
    RETURN;
  END IF;

  SELECT COUNT(*)
    INTO v_unpaid_invoices
    FROM invoices i
   WHERE i.user_id = p_user_id
     AND i.status IN ('UNPAID', 'FAILED');

  IF v_unpaid_invoices > 0 THEN
    RETURN QUERY SELECT 'DECLINE'::decision, 'UNPAID_INVOICE', 0::NUMERIC, 0, NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO usage_counters(user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT uc.transaction_count, uc.total_spent
    INTO v_txn_count, v_total_spent
    FROM usage_counters uc
   WHERE uc.user_id = p_user_id
   FOR UPDATE;

  IF v_txn_count >= 5 THEN
    RETURN QUERY SELECT 'DECLINE'::decision, 'TXN_CAP_REACHED', (2000 - v_total_spent), 0, NULL::UUID;
    RETURN;
  END IF;

  IF v_total_spent + p_amount > 2000 THEN
    RETURN QUERY SELECT 'DECLINE'::decision, 'SPEND_CAP_EXCEEDED', (2000 - v_total_spent), (5 - v_txn_count), NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO authorization_requests (
    id,
    user_id,
    agent_id,
    amount,
    currency,
    merchant_name,
    mcc,
    items,
    metadata,
    idempotency_key,
    decision,
    reason_code,
    remaining_limit,
    remaining_transactions,
    created_at
  )
  VALUES (
    v_req_id,
    p_user_id,
    p_agent_id,
    p_amount,
    p_currency,
    p_merchant_name,
    p_mcc,
    COALESCE(p_items, '[]'::jsonb),
    COALESCE(p_metadata, '{}'::jsonb),
    p_idempotency_key,
    'APPROVE',
    NULL,
    (2000 - (v_total_spent + p_amount)),
    (5 - (v_txn_count + 1)),
    NOW()
  );

  RETURN QUERY SELECT 'APPROVE'::decision, NULL::TEXT, (2000 - (v_total_spent + p_amount)), (5 - (v_txn_count + 1)), v_req_id;
END;
$$ LANGUAGE plpgsql;

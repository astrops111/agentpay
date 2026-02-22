-- Triggers for AgentPay MVP

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cards_updated_at
BEFORE UPDATE ON cards
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_billing_accounts_updated_at
BEFORE UPDATE ON billing_accounts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_billing_account_enforces_card_state
AFTER INSERT OR UPDATE OF subscription_status ON billing_accounts
FOR EACH ROW
EXECUTE FUNCTION enforce_billing_card_invariant();

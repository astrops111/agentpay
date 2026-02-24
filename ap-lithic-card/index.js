import Lithic from 'lithic';

export async function execute(args) {
  // 1. VALIDATE INPUT
  const amount = parseFloat(args.amount);
  if (isNaN(amount) || amount <= 0) {
    return "🚨 ERROR: You must provide a valid dollar amount (e.g. 25.00).";
  }

  const apiKey = process.env.LITHIC_API_KEY;
  if (!apiKey) {
    return "🚨 ERROR: LITHIC_API_KEY is missing from .env.";
  }

  // 2. INITIALIZE LITHIC CLIENT (sandbox)
  const client = new Lithic({ apiKey, environment: 'sandbox' });

  const amountCents = Math.round(amount * 100);

  try {
    // 3. CREATE A VIRTUAL CARD
    const card = await client.cards.create({
      type: 'VIRTUAL',
    });

    console.log(`[LITHIC] Created virtual card: ${card.token} (last four: ${card.last_four})`);

    // 4. SIMULATE AN AUTHORIZATION ON THE CARD
    const authResult = await client.transactions.simulateAuthorization({
      amount: amountCents,
      descriptor: 'AGENTPAY SKILL AUTH',
      pan: card.pan,
    });

    console.log(`[LITHIC] Simulated authorization: token=${authResult.token}, debugging=${authResult.debugging_request_id}`);

    // 5. RETRIEVE THE TRANSACTION DETAILS (may take a moment to propagate)
    let txn = null;
    if (authResult.token) {
      // Small delay to let the sandbox propagate the transaction
      await new Promise(r => setTimeout(r, 1000));
      try {
        txn = await client.transactions.retrieve(authResult.token);
      } catch (_e) {
        // Transaction may not be immediately available in sandbox — that's OK
        console.log(`[LITHIC] Transaction not yet available for retrieval (this is normal in sandbox).`);
      }
    }

    return [
      `✅ Card created and authorization simulated!`,
      ``,
      `📇 Card Details:`,
      `   Token:     ${card.token}`,
      `   Last Four: ${card.last_four}`,
      `   State:     ${card.state}`,
      `   Type:      ${card.type}`,
      `   PAN:       ${card.pan}`,
      `   CVV:       ${card.cvv}`,
      `   Exp:       ${card.exp_month}/${card.exp_year}`,
      ``,
      `💳 Authorization:`,
      `   Amount:    $${amount.toFixed(2)}`,
      `   Txn Token: ${authResult.token || 'N/A'}`,
      txn ? `   Status:    ${txn.status}` : null,
      txn ? `   Result:    ${txn.result}` : null,
      txn ? `   Created:   ${txn.created}` : null,
    ].filter(Boolean).join('\n');

  } catch (error) {
    console.error(`[LITHIC ERROR] ${error.message}`);
    return `🚨 FAILED: ${error.message}`;
  }
}

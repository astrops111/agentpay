import Stripe from 'stripe';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Ensure DB directory exists
const DB_PATH = '/home/horrible/.openclaw/workspace/skills/finance-guard/payagent.db';
const DB_DIR = dirname(DB_PATH);
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

// 1. SET YOUR LIMITS HERE
const LIMITS = {
  MAX_PER_TRANSACTION: 50.00,
  MAX_DAILY_SPEND: 200.00
};

// 2. CONNECT TO PAYAGENT DB
let db;
try {
  db = new DatabaseSync(DB_PATH);
  // Initialize table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      price_id TEXT,
      amount REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch (e) {
  console.error('Failed to init DB:', e);
}

export async function execute(args) {
  if (!args.price_id || !args.price_id.startsWith('price_')) {
    return "🚨 ERROR: You must provide a valid Stripe Price ID (starts with 'price_').";
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return "🚨 ERROR: STRIPE_SECRET_KEY is missing from .env.";
  }

  const stripe = new Stripe(secretKey);

  try {
    // 3. RETRIEVE PRICE TO CHECK LIMITS
    const priceObj = await stripe.prices.retrieve(args.price_id);
    const amountInDollars = (priceObj.unit_amount || 0) / 100;

    if (amountInDollars > LIMITS.MAX_PER_TRANSACTION) {
      return `🚨 BLOCKED: This item costs $${amountInDollars.toFixed(2)}, which exceeds your $${LIMITS.MAX_PER_TRANSACTION} limit.`;
    }

    // Check daily spend limit
    if (db) {
      const todayStart = new Date();
      todayStart.setHours(0,0,0,0);
      const row = db.prepare(`
        SELECT SUM(amount) as total 
        FROM transactions 
        WHERE timestamp >= ?
      `).get(todayStart.toISOString());
      
      const dailyTotal = row?.total || 0;
      if (dailyTotal + amountInDollars > LIMITS.MAX_DAILY_SPEND) {
        return `🚨 BLOCKED: Daily spend limit reached. Used: $${dailyTotal.toFixed(2)}, Requested: $${amountInDollars.toFixed(2)}, Limit: $${LIMITS.MAX_DAILY_SPEND}.`;
      }
    }

    // 4. PROCEED WITH PURCHASE
    // Create a test customer
    const customer = await stripe.customers.create({
      name: 'PayAgent Auto-Tester',
      email: 'payagent@test.local',
      payment_method: 'pm_card_visa',
      invoice_settings: {
        default_payment_method: 'pm_card_visa',
      },
    });

    let resultMsg = '';

    if (priceObj.type === 'recurring') {
      // Subscription
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: args.price_id }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });
      resultMsg = `✅ Subscription created: ${subscription.id}`;
    } else {
      // One-time payment
      await stripe.invoiceItems.create({
        customer: customer.id,
        price: args.price_id,
        description: priceObj.nickname || `Charge for ${args.price_id}`,
      });
      
      const invoice = await stripe.invoices.create({
        customer: customer.id,
        auto_advance: true,
      });

      const paidInvoice = await stripe.invoices.pay(invoice.id);
      resultMsg = `✅ Invoice paid: ${paidInvoice.id}`;
    }

    // 5. RECORD SUCCESS IN DB
    if (db) {
      db.prepare(`
        INSERT INTO transactions (price_id, amount) 
        VALUES (?, ?)
      `).run(args.price_id, amountInDollars);
    }

    console.log(`[AUTO-PURCHASE SUCCESS] ${resultMsg} (Cost: $${amountInDollars.toFixed(2)})`);
    return `${resultMsg}. Cost: $${amountInDollars.toFixed(2)}.`;

  } catch (error) {
    console.error(`[AUTO-PURCHASE ERROR] ${error.message}`);
    return `🚨 FAILED to automate purchase. Reason: ${error.message}`;
  }
}

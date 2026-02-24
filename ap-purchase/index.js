import puppeteer from 'puppeteer';
import Lithic from 'lithic';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function execute(args) {
  // 1. VALIDATE INPUT
  const url = args.url;
  if (!url || !url.includes('buy.stripe.com')) {
    return "🚨 ERROR: You must provide a valid Stripe payment link (buy.stripe.com/...).";
  }

  const apiKey = process.env.LITHIC_API_KEY;
  if (!apiKey) {
    return "🚨 ERROR: LITHIC_API_KEY is missing from .env.";
  }

  let browser;
  try {
    // 2. LAUNCH BROWSER & NAVIGATE
    console.log(`[AP-PURCHASE] Opening ${url}...`);
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // 3. SELECT USD CURRENCY
    console.log(`[AP-PURCHASE] Selecting USD currency...`);
    try {
      // Look for the USD button and click it
      await page.waitForSelector('button', { timeout: 5000 });
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes('$') && text.includes('USD') || (text.includes('$') && !text.includes('CA$'))) {
          await btn.click();
          await sleep(1000);
          break;
        }
      }
    } catch (e) {
      console.log(`[AP-PURCHASE] No currency selector found, proceeding with default.`);
    }

    // 4. SCRAPE THE TOTAL
    console.log(`[AP-PURCHASE] Scraping total...`);
    await sleep(500);

    // Try to get the total from the page — look for dollar amounts
    const totalText = await page.evaluate(() => {
      // Look for total in various places
      const allText = document.body.innerText;
      // Match USD amounts like $1.00, $25.50, etc. (not CA$)
      const matches = allText.match(/(?<![A-Z])(?<!\w)\$(\d+(?:,\d{3})*\.\d{2})/g);
      if (matches && matches.length > 0) {
        // Return the last match which is typically the total
        return matches[matches.length - 1];
      }
      return null;
    });

    if (!totalText) {
      await browser.close();
      return "🚨 ERROR: Could not detect the payment amount from the checkout page.";
    }

    const totalAmount = parseFloat(totalText.replace('$', '').replace(',', ''));
    console.log(`[AP-PURCHASE] Detected total: $${totalAmount.toFixed(2)}`);

    // 5. CREATE LITHIC VIRTUAL CARD
    console.log(`[AP-PURCHASE] Creating Lithic virtual card...`);
    const lithic = new Lithic({ apiKey, environment: 'sandbox' });

    const card = await lithic.cards.create({
      type: 'VIRTUAL',
    });

    console.log(`[AP-PURCHASE] Card created: ${card.token} (last four: ${card.last_four})`);

    // Simulate authorization for this amount
    const amountCents = Math.round(totalAmount * 100);
    const authResult = await lithic.transactions.simulateAuthorization({
      amount: amountCents,
      descriptor: 'STRIPE CHECKOUT',
      pan: card.pan,
    });
    console.log(`[AP-PURCHASE] Authorization simulated: ${authResult.token}`);

    // 6. FILL CHECKOUT FORM
    console.log(`[AP-PURCHASE] Filling checkout form...`);
    console.log(`[AP-PURCHASE] Using PAN: ${card.pan}, CVV: ${card.cvv}, Exp: ${card.exp_month}/${card.exp_year}`);

    // Email
    await page.waitForSelector('#email', { timeout: 5000 });
    await page.type('#email', 'agentpay@test.local', { delay: 50 });

    // Card Number
    await page.waitForSelector('#cardNumber', { timeout: 5000 });
    await page.type('#cardNumber', card.pan, { delay: 50 });

    // Expiry (MM/YY)
    const expMonth = String(card.exp_month).padStart(2, '0');
    const expYear = String(card.exp_year).slice(-2);
    await page.waitForSelector('#cardExpiry', { timeout: 5000 });
    await page.type('#cardExpiry', `${expMonth}${expYear}`, { delay: 50 });

    // CVC
    await page.waitForSelector('#cardCvc', { timeout: 5000 });
    await page.type('#cardCvc', card.cvv, { delay: 50 });

    // Cardholder Name
    await page.waitForSelector('#billingName', { timeout: 5000 });
    await page.type('#billingName', 'AgentPay Bot', { delay: 50 });

    // Country — select US
    await page.waitForSelector('#billingCountry', { timeout: 5000 });
    await page.select('#billingCountry', 'US');
    await sleep(1000);

    // Zip code (may appear after selecting US)
    try {
      await page.waitForSelector('#billingPostalCode', { timeout: 3000 });
      await page.type('#billingPostalCode', '10001', { delay: 50 });
    } catch (_e) {
      // Postal code field may not be required
    }

    console.log(`[AP-PURCHASE] Form filled. Submitting payment...`);

    // 7. CLICK PAY
    const payButton = await page.$('button.SubmitButton');
    if (!payButton) {
      // Fallback: find button with "Pay" text
      const allButtons = await page.$$('button');
      for (const btn of allButtons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes('Pay')) {
          await btn.click();
          break;
        }
      }
    } else {
      await payButton.click();
    }

    // 8. WAIT FOR USER TO SOLVE CAPTCHA (if present)
    console.log(`\n🛑 [AP-PURCHASE] If a CAPTCHA appeared, solve it now in the browser window.`);
    console.log(`   Press ENTER here when done (or after payment completes)...\n`);
    await new Promise(resolve => {
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.pause();
        resolve();
      });
    });
    console.log(`[AP-PURCHASE] Checking payment result...`);
    await sleep(2000);

    // Check for success or error
    const resultText = await page.evaluate(() => document.body.innerText);
    const isSuccess = resultText.includes('success') ||
      resultText.includes('Thank you') ||
      resultText.includes('confirmed') ||
      resultText.includes('receipt');
    const isDeclined = resultText.includes('declined') ||
      resultText.includes('failed') ||
      resultText.includes('error') ||
      resultText.includes('unable');

    // Take a screenshot for proof
    const screenshotPath = './purchase_result.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[AP-PURCHASE] Screenshot saved: ${screenshotPath}`);

    await browser.close();

    // 9. RETURN RESULTS
    const status = isSuccess ? '✅ SUCCESS' : isDeclined ? '❌ DECLINED' : '⚠️ UNKNOWN';

    return [
      `${status} — Purchase attempt completed`,
      ``,
      `📦 Order:`,
      `   URL:    ${url}`,
      `   Total:  $${totalAmount.toFixed(2)}`,
      ``,
      `📇 Lithic Card Used:`,
      `   Token:     ${card.token}`,
      `   Last Four: ${card.last_four}`,
      `   PAN:       ${card.pan}`,
      `   Exp:       ${expMonth}/${expYear}`,
      ``,
      `💳 Authorization:`,
      `   Txn Token: ${authResult.token || 'N/A'}`,
      ``,
      `📸 Screenshot: ${screenshotPath}`,
    ].join('\n');

  } catch (error) {
    if (browser) await browser.close();
    console.error(`[AP-PURCHASE ERROR] ${error.message}`);
    return `🚨 FAILED: ${error.message}`;
  }
}

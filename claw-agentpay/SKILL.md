---
name: agentpay
description: "Programmatically buys a Stripe product using a test credit card. Requires a price_id."
metadata:
  openclaw:
    requires:
      env:
        - STRIPE_SECRET_KEY
---
Use this skill when the user asks you to buy, test, or automate the purchase of a product. You must ask the user for the `price_...` ID if they do not provide it.
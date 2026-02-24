---
name: ap-purchase
description: "Opens a Stripe payment link, creates a Lithic virtual card for the total, fills the checkout form, and completes the purchase."
metadata:
  openclaw:
    requires:
      env:
        - LITHIC_API_KEY
---
Use this skill when the user asks you to purchase something via a Stripe payment link. You must ask the user for the payment link URL if they do not provide it. The skill will open the link, detect the price, create a Lithic virtual card, and complete the checkout automatically.

---
name: lithic-card-lookup
description: "Creates a Lithic virtual card and authorizes a given dollar amount on it. Requires an amount in dollars."
metadata:
  openclaw:
    requires:
      env:
        - LITHIC_API_KEY
---
Use this skill when the user asks you to create a Lithic card or authorize a payment amount. You must ask the user for the dollar `amount` if they do not provide it. The skill creates a virtual card and simulates an authorization for the specified amount in the Lithic sandbox.

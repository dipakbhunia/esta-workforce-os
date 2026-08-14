# Plan catalog boundaries

Plans are provider-neutral commercial product definitions. They do not represent a tenant subscription, trial, measured usage, payment, tax, or invoice.

Future subscriptions must snapshot the accepted plan code/name, billing interval, currency, price, seat basis, entitlements, and limits. Editing a catalog plan must never rewrite historical subscription or invoice terms. Negotiated pricing, seats, entitlements, storage, and other limits belong to subscription overrides rather than cloned plans.

Future tenant access is authenticated access plus RBAC permission plus company subscription entitlement. Super Administrators administering the platform are outside tenant commercial entitlement checks. Monitoring enforcement must eventually protect both administrative/read APIs and device registration, heartbeat, activity, and screenshot ingestion; UI gating alone is insufficient.

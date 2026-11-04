# Independent Twilio retirement mitigation candidate

Base: d1f14a9685f5bec831fed1399ae7b1b20dd720ec, materialized locally as 0eb5333. This patch is separate from the larger lead-tracking release.

## Effect
- All six Twilio callback routes return HTTP 410 for GET and POST before parsing or writing data.
- The test-send endpoint returns HTTP 410.
- Explicit and default-selected Twilio SMS sends fail locally without a network request. No automatic Telnyx substitution is added.
- Twilio readiness reports retired/not configured, even if old credentials remain present.
- No SDK dependency, secret, new URL setting, database migration or live provider call is required.
- This candidate has no re-enable switch. Any transitional re-enable requires a separately reviewed signed-callback build, not restoring unsigned handlers.

## Consequences and review gates
This intentionally stops LeadCommand's Twilio voice handler, recordings/transcriptions, inbound SMS classification/opt-outs, delivery-status ingestion, fallback handlers and test SMS. Already-in-flight callbacks are rejected; this patch does not recall in-flight messages or cancel provider-side work. Late STOP requests would not be processed by the retired handlers. Confirm no outstanding Twilio campaigns/voice dependencies or supply a separately approved suppression-monitoring transition before release.

This does not cancel a Twilio subscription, delete recordings/history, change phone-number routing, revoke credentials, alter DNS/provider settings, or establish that other Ghost products do not use Twilio. Existing stored records remain untouched. Inventory affected numbers, pending provider work and other product dependencies separately; do not expose secrets during metadata checks.

## Validation and release decision
Run node --import tsx --test src/lib/twilio-retirement.test.ts and TypeScript/lint checks in an isolated checkout. Apply-check against the exact original base. No migration is included.

NO-GO for production until an operator explicitly approves this retirement release and confirms dependency/callback consequences. GO only for local review and isolated staging verification. A missing production AuthToken does not weaken the deny behavior because this patch never reads it.

Rollback would restore known unsigned callback exposure and old send behavior. Do not blindly revert to the vulnerable version; choose a signed, separately reviewed transitional version if a live dependency requires temporary compatibility.

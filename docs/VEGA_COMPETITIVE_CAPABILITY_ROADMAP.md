# Vega Competitive Capability Roadmap

Vega is the AI Sales Director inside Ghost Lead Command, a product of Ghost AI Solutions. This roadmap documents competitor-inspired capability categories without copying competitor source code, design, proprietary wording, agent names, or protected branding.

## Capability Groups

- Vega Discover: company, contact, local-market, referral, and partner-service discovery.
- Vega Signal: intent, engagement, social, review, website, CRM, and account-level signal intelligence.
- Vega Reach: permitted outbound email and approved follow-up workflows with sender-health protection.
- Vega Engage: inbound conversations, reply qualification, human takeover, and approved response workflows.
- Vega Convert: phone assist, call outcomes, booking handoffs, meeting tracking, proposals, and CRM notes.
- Vega Intelligence: source quality, production proof, experiments, campaign learning, economics, and recommendations.

The live capability registry is `src/lib/vega-capabilities.ts`.

## Product Boundaries

- Vega builds and converts pipeline.
- GEO findings may become Vega sales signals, but Vega does not clone GEO execution features.
- Echo and marketing-generation tools may supply campaign assets, but Vega owns acquisition orchestration.
- Social platforms are signal and task inputs unless an authorized integration explicitly permits messaging.

## Phase A Foundation

Phase A adds the architecture needed for a safer autonomous sales director:

- `IntentSignal` records with evidence, attribution, idempotency, recency, expiration, and person/account scope.
- Intent scoring with half-life decay, repeated-signal accumulation, weak-signal suppression, explainable evidence, and blockers.
- Next Best Channel selection with exactly one primary action.
- Provider-neutral adapter interfaces.
- Source-quality scoring with minimum sample-size protection.
- Controlled experiment proposals that cannot silently replace strategy.
- Plan entitlements and feature flags.

## Social Signal Compliance

Supported inputs:

- Customer-provided LinkedIn URLs or records.
- CSV exports.
- CRM imports.
- Authorized webhooks and approved connectors.
- Manual Slack-submitted evidence.
- Publicly accessible data where lawful and permitted.

Vega must not scrape protected platforms, bypass access controls, automate social actions through unauthorized account emulation, or represent unsupported integrations as active.

## Inbound Conversion Direction

Vega Engage should process website chat, contact forms, inbound email, SMS where configured, WhatsApp where configured, referral intake, QR contact-card intake, and API/webhook intake. AI replies must use approved playbooks, support human takeover, and preserve a full audit trail.

## Channel Policy

Channel permissions are independent. Email permission does not imply SMS, WhatsApp, LinkedIn, or phone permission. Each campaign should carry a `CommunicationPolicy` that defines allowed channels, consent rules, quiet hours, cooldowns, automatic-reply limits, opt-out language, and human-approval rules.

## Learning Authority

Vega may autonomously suppress bad contacts, reduce sender risk, prioritize positive engagement, reschedule callbacks, prevent duplicates, and stop sequences after replies or bookings.

Vega must request approval before materially changing target market, territory, central offer, qualification thresholds, active ICP, daily volume, new channels, or client strategy.

## Agency Architecture

The Phase A schema introduces agency portfolio foundations without exposing full white-label reselling by default:

- `AgencyAccount`
- `AgencyMembership`
- `AgencyClientWorkspace`
- `AgencyBrandConfiguration`

White-label behavior remains entitlement-gated.

## Rollout

New capabilities are progressively enabled:

1. Internal Ghost workspace.
2. One partner-service campaign.
3. Selected managed client.
4. Controlled beta.
5. Broader availability.

Every rollout stage needs rollback controls and production proof reporting.

## Remaining Phases

- Phase B: warm-signal acquisition, social/import lanes, signal UI, account aggregation.
- Phase C: inbound conversion and calendar-confirmed qualification.
- Phase D: approved messaging channels, consent records, and multi-channel reporting.
- Phase E: lookalike models, controlled experiments, offer/source attribution, economics.
- Phase F: agency portfolio, client workspace provisioning, agency roles, and reseller billing foundation.

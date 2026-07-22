# Vega Channel Compliance

Vega must grow pipeline without covert surveillance, unauthorized scraping, or cross-channel consent assumptions.

## Permitted Inputs

- First-party website events and contact forms.
- Customer-provided lead files, CRM records, URLs, screenshots, or exports.
- Authorized APIs and webhooks.
- Approved enrichment, email, SMS, calendar, CRM, social-signal, and analytics providers.
- Publicly accessible business information where lawful and permitted.
- Manual operator notes and Slack-submitted evidence.

## Prohibited Behavior

- Scraping protected platforms in violation of terms.
- Bypassing platform access controls.
- Automating LinkedIn/social messages through unauthorized account emulation.
- Claiming a competitor or social platform is integrated when it is not.
- Inferring sensitive personal characteristics.
- Enriching records with prohibited or unnecessary sensitive data.
- Counting opens, clicks, phone tasks, meeting requests, proposals, or voicemail as closed revenue.

## Channel Rules

- Cold outbound email requires sender-health checks, suppression, contact-quality gating, and campaign policy.
- Inbound email may be handled through approved reply policy and human takeover.
- Outbound SMS requires explicit policy and consent. Email availability is not SMS consent.
- Inbound SMS can be processed only when the configured provider and opt-out handling are active.
- WhatsApp is inbound or approved-provider only until policy, consent, and templates are configured.
- Website chat uses approved qualification playbooks and escalation rules.
- LinkedIn and social channels produce manual tasks unless an authorized integration explicitly permits the action.
- Contact forms should respect target-site policies and rate limits.
- Phone calls require caller assignment, outcome logging, callback controls, and suppression.

## Opt-Outs and Human Takeover

Stop, unsubscribe, wrong-person, and not-interested signals must stop relevant sequences quickly. When a human takes ownership, AI replies pause until ownership is released.

## Audit Requirements

Every automated or assisted action should record:

- Workspace and campaign.
- Lead/contact/account.
- Channel and provider.
- Policy decision.
- Source evidence.
- Operator or agent.
- Outcome.
- External IDs where applicable.
- Timestamp.

## Rollout Defaults

External workspaces start conservative. New social, SMS, WhatsApp, website-chat, auto-booking, experiment, agency, and lookalike capabilities stay disabled unless feature flags, entitlements, credentials, and campaign policy are present.

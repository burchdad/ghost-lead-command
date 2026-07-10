# Ghost Lead Command

Ghost Lead Command is the unified sales operating cockpit for Ghost AI Solutions.

It is designed to connect the pieces already built across the Ghost repos into one lead-to-cash workflow:

- import or sync leads
- revive dead CRM contacts
- score and prioritize opportunities
- generate outreach
- prepare calls
- build proposals
- demo deployable AI agents
- track pipeline, won revenue, and retained services

## Current MVP

This first pass is a clickable dashboard that mimics the AI consultant "mission control" workflow from the Loom:

- Command dashboard with money metrics and next best action
- Fresh lead sourcing screen for People Data Labs or the Ghost Lead Intelligence Agent
- Built-in Google Maps sourcing through SerpAPI, with website email/phone extraction
- Saved sourcing campaigns with score thresholds and daily limits
- Suppression guardrails for stop/unsubscribe/domain/company blocks
- Outreach approval queue before email or SMS sends
- Reply inbox with lightweight hot/nurture/objection/stop classification
- Analytics for sources, replies, queue state, pipeline, and won revenue
- Integration health checks for PDL, Ghost Lead Agent, SendGrid, Telnyx, and Twilio
- GhostCRM sync adapter for pushing qualified leads into the CRM source of truth
- Lead pipeline by stage
- Dead lead revival system
- Campaign copy generator
- Outreach console
- Call prep and proposal stack
- Agent and prompt library
- Prisma-backed local database with seeded Ghost AI Solutions data
- API routes for leads, campaigns, proposals, library templates, CSV import preview, and AI-assisted generation
- Provider-agnostic outreach queue for SendGrid email, Telnyx SMS, and optional Twilio SMS fallback
- Editable lead detail panel with score, value, next action, stage controls, and timeline
- Reply classification that saves inbound replies as interactions
- Lead-to-proposal generation tied to the selected opportunity

## API Surface

```text
GET  /api/leads
POST /api/leads
GET  /api/leads/:id
PATCH /api/leads/:id
POST /api/leads/:id/interactions
POST /api/leads/:id/proposal
GET  /api/campaigns
POST /api/campaigns
GET  /api/proposals
POST /api/proposals
GET  /api/library
POST /api/import/preview
GET  /api/source/search
POST /api/source/search
POST /api/source/intake
GET  /api/source/campaigns
POST /api/source/campaigns
POST /api/source/campaigns/:id/run
GET  /api/outreach/status
POST /api/outreach/send
GET  /api/outreach/queue
POST /api/outreach/queue
POST /api/outreach/queue/:id/approve
POST /api/outreach/queue/:id/reject
GET  /api/replies
POST /api/replies
POST /api/sendgrid/events
GET  /api/suppression
POST /api/suppression
GET  /api/analytics
GET  /api/health/integrations
GET  /api/crm/status
POST /api/crm/sync
POST /api/ai/generate
```

`/api/ai/generate` uses `OPENAI_API_KEY` when present and falls back to local sales templates when no key is configured.
`/api/source/search` uses `PDL_API_KEY`, `SERPAPI_API_KEY`, or `GHOST_LEAD_AGENT_SEARCH_URL` when configured and falls back to mock data for local workflow testing.
`/api/source/intake` is the central webhook for external lead intelligence sources such as ghostai.solutions, Google Places/search collectors, LinkedIn exports, social listeners, Clay, Apollo, or Apify actors.
`/api/sendgrid/events` consumes SendGrid event webhooks and suppresses bounced, dropped, unsubscribed, and spam-report addresses.
`/api/outreach/send` runs in `OUTREACH_SEND_MODE=dry-run` by default so touches are saved without accidentally texting or emailing anyone.

## Central Source Intake

Point outside lead intelligence systems at:

```http
POST /api/source/intake
Authorization: Bearer <LEAD_INTAKE_SECRET>
Content-Type: application/json
```

Example payload:

```json
{
  "source": "ghostai.solutions lead intelligence",
  "autoQueue": true,
  "autoSend": false,
  "queueLimit": 10,
  "leads": [
    {
      "name": "Jane Buyer",
      "title": "Founder",
      "companyName": "Acme Growth",
      "email": "jane@example.com",
      "phone": "+15555550123",
      "website": "https://example.com",
      "niche": "B2B SaaS",
      "location": "United States",
      "intentSignals": [
        "LinkedIn growth hiring signal",
        "Google search result matched ICP",
        "website has demo CTA but no instant follow-up"
      ],
      "signalSummary": "growth hiring signal; ICP matched; demo follow-up leak"
    }
  ]
}
```

Set `autoSend` to `true` only when `OUTREACH_SEND_MODE=live`, `SENDGRID_API_KEY`, and `SENDGRID_FROM_EMAIL` are configured and you want intake leads to attempt live first-touch email immediately.

## SendGrid Event Suppression

Point SendGrid Event Webhook at:

```http
POST /api/sendgrid/events?token=<SENDGRID_EVENT_SECRET>
Content-Type: application/json
```

The route records bounce, dropped, spam report, unsubscribe, and group unsubscribe events in the suppression list, lowers the matched lead score, and marks active email queue items failed so the operator stops retrying bad addresses.

## Built-In Google Source

Select `Google Maps` on the Source screen to run SerpAPI-backed business discovery. The source normalizes Google Maps results into Lead Command leads, adds signals such as reviews, rating, phone path, website audit availability, and attempts to extract a public email/phone from the company website plus common contact pages.

## Existing Ghost Assets To Fold In

- `ghost_mission_control`: command dashboard, execution routing, agent telemetry
- `ghostcrm`: CRM structure, pipeline, integrations
- `ghostbot-chat`: lead capture, UTM tracking, lead scoring, Slack/Sheets/Zapier
- `relateos`: relationship priority scoring and suggested messages
- `content-scrapper`: audit and intelligence workflows
- `ghost-enterprise-template`: client site/admin delivery pattern
- `ai_sales_funnel`: packaged offer positioning

## Next Build Milestones

1. Add authenticated workspaces and client accounts.
2. Add dedupe and suppression checks before bulk importing sourced contacts.
3. Add the custom CRM adapter as the source of truth for contacts, stages, and attribution.
4. Add approved live sending through SendGrid and Telnyx, with Twilio as a fallback route.
5. Add proposal export and revenue attribution.
6. Add client install/delivery checklist per won deal.
7. Add dashboard filters for source, niche, stage, and priority.
8. Add deployment path for Vercel + managed Postgres.

## Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Local Database

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

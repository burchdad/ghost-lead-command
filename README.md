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
GET  /api/suppression
POST /api/suppression
GET  /api/analytics
GET  /api/health/integrations
GET  /api/crm/status
POST /api/crm/sync
POST /api/ai/generate
```

`/api/ai/generate` uses `OPENAI_API_KEY` when present and falls back to local sales templates when no key is configured.
`/api/source/search` uses `PDL_API_KEY` or `GHOST_LEAD_AGENT_SEARCH_URL` when configured and falls back to mock data for local workflow testing.
`/api/outreach/send` runs in `OUTREACH_SEND_MODE=dry-run` by default so touches are saved without accidentally texting or emailing anyone.

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

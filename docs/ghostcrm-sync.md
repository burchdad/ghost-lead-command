# GhostCRM Sync

Lead Command is designed to push qualified leads into GhostCRM instead of becoming the long-term CRM itself.

## Lead Command Env

```txt
GHOSTCRM_SYNC_URL=https://your-ghostcrm-domain.com/api/lead-command/sync
GHOSTCRM_API_KEY=your-shared-service-token
GHOSTCRM_ORGANIZATION_ID=your-ghostcrm-org-id
```

Until `GHOSTCRM_SYNC_URL` and `GHOSTCRM_API_KEY` are set, sync runs in dry-run mode and records a timeline event on the Lead Command lead.

## Preferred Target: GhostCRM Core

This workspace includes a new `ghostcrm-core` service intended to replace the Supabase-bound CRM core for live data.

Point Lead Command at:

```txt
GHOSTCRM_SYNC_URL=https://your-ghostcrm-core.up.railway.app/api/lead-command/sync
GHOSTCRM_API_KEY=<GHOSTCRM_CORE_API_KEY>
```

## Expected Endpoint

The endpoint should expose a narrow bearer-token API:

```http
POST /api/lead-command/sync
Authorization: Bearer your-shared-service-token
Content-Type: application/json

{
  "lead": {
    "externalId": "lead-command-id",
    "organizationId": "ghostcrm-org-id",
    "title": "Maya Collins",
    "firstName": "Maya",
    "lastName": "Collins",
    "email": "maya@example.com",
    "phone": "+15551234567",
    "company": "BrightPath Med Spa",
    "source": "People Data Labs",
    "stage": "qualified",
    "priority": "high",
    "value": 5400,
    "leadScore": 92,
    "description": "Next action from Lead Command",
    "tags": ["ghost-lead-command", "Wellness"],
    "customFields": {
      "niche": "Wellness",
      "lastTouch": "Just now",
      "commandStatus": "active"
    }
  }
}
```

The endpoint should upsert by `externalId` or email within the organization, then return the GhostCRM lead id and status.

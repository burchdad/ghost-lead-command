import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClientCampaignDigestEmail, isLikelyEmail } from "@/lib/client-campaign-updates";

describe("client campaign update emails", () => {
  it("formats a sales-manager lead brief with actions and notable leads", () => {
    const email = buildClientCampaignDigestEmail({
      clientName: "Naks Exterior Services",
      campaignName: "Commercial exterior cleaning - Tyler",
      recipientEmail: "sales@naks.example",
      generatedAt: "2026-07-30T14:00:00.000Z",
      summary: "Vega found commercial prospects and queued phone follow-up for the sales manager.",
      metrics: {
        leadsFound: 30,
        qualified: 18,
        emailsSent: 8,
        callTasksDue: 10,
        warmLeads: 2,
      },
      humanActions: ["Call ABC Property Management", "Follow up with Tyler Medical Plaza"],
      notableLeads: [
        {
          companyName: "ABC Property Management",
          contactName: "Operations Manager",
          phone: "903-555-0100",
          nextAction: "Call today",
          reason: "Property manager fit for recurring window cleaning.",
        },
      ],
    });

    assert.match(email.subject, /Naks Exterior Services Lead Brief/);
    assert.match(email.text, /Calls due: 10/);
    assert.match(email.text, /Call ABC Property Management/);
    assert.match(email.text, /recurring window cleaning/);
  });

  it("validates the lead update recipient email", () => {
    assert.equal(isLikelyEmail("sales@naks.example"), true);
    assert.equal(isLikelyEmail("sales manager"), false);
  });
});

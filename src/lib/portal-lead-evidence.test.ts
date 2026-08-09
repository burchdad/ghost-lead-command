import assert from "node:assert/strict";
import test from "node:test";
import { buildPortalLeadEvidence } from "./portal-lead-evidence";

test("portal lead evidence exposes actual phone, website, and source proof", () => {
  const evidence = buildPortalLeadEvidence({
    source: "Google Maps via SerpAPI",
    score: 91,
    contact: {
      email: null,
      phone: "(903) 555-0123",
      role: "Owner or Growth Operator",
    },
    company: {
      website: "ranchhvac.example",
      crmSource: "Google Maps via SerpAPI",
    },
    customFields: {
      sourceProvider: "lead command:google-maps:Google Maps via SerpAPI",
      sourceUrl: "https://maps.google.com/example",
      intentSignals: [
        "Google Maps business matched search intent",
        "website available for offer audit",
        "phone path available for follow-up",
      ],
    },
  });

  assert.equal(evidence.email.status, "needs_enrichment");
  assert.equal(evidence.email.canSend, false);
  assert.equal(evidence.phone.number, "(903) 555-0123");
  assert.equal(evidence.phone.display, "(903) 555-0123");
  assert.equal(evidence.phone.canCall, true);
  assert.equal(evidence.website.url, "https://ranchhvac.example");
  assert.equal(evidence.website.display, "https://ranchhvac.example");
  assert.equal(evidence.source.sourceUrl, "https://maps.google.com/example");
  assert.ok(evidence.source.verificationCount >= 5);
  assert.ok(evidence.source.evidence.includes("Phone path on contact"));
});

test("portal lead evidence explains missing contact paths without pretending they are actionable", () => {
  const evidence = buildPortalLeadEvidence({
    source: "Apollo",
    contact: null,
    company: null,
    customFields: {
      intentSignals: ["ICP match"],
    },
  });

  assert.equal(evidence.email.display, "Email blocked until a verified address is found");
  assert.equal(evidence.phone.display, "No callable phone captured yet");
  assert.equal(evidence.website.display, "No website captured yet");
  assert.equal(evidence.source.confidence, "single-source-plus-context");
});

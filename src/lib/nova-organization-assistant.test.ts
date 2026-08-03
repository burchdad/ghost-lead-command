import assert from "node:assert/strict";
import test from "node:test";
import { parseNovaOrganizationInstruction } from "./nova-organization-assistant";

test("parses setter natural-language lead intake", () => {
  const result = parseNovaOrganizationInstruction(
    "Nova, new lead: John Smith at ABC Roofing, 903-555-1212, john@abcroofing.com, wants a roof quote next week, setter Alex",
  );

  assert.equal(result.intent, "lead_intake");
  assert.equal(result.contactName, "John Smith");
  assert.equal(result.companyName, "ABC Roofing");
  assert.equal(result.email, "john@abcroofing.com");
  assert.equal(result.phone, "903-555-1212");
  assert.equal(result.setter, "Alex");
  assert.match(result.service || "", /roof quote/);
});

test("parses calendar handoff instruction", () => {
  const result = parseNovaOrganizationInstruction("Nova, book ABC Roofing with Alex tomorrow at 2pm for a discovery call");

  assert.equal(result.intent, "calendar_update");
  assert.equal(result.companyName, "ABC Roofing");
  assert.match(result.appointmentText || "", /tomorrow at 2pm/);
});

test("parses end-of-day report instruction", () => {
  const result = parseNovaOrganizationInstruction("Nova, send end of day report to alex@example.com for Alex and the setters");

  assert.equal(result.intent, "eod_report");
  assert.equal(result.reportRecipient, "alex@example.com");
  assert.match(result.reportAudience || "", /Alex/);
});

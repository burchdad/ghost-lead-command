import assert from "node:assert/strict";
import test from "node:test";
import { priorityFromScore, scoreWaitlist, segmentWaitlist } from "./waitlist-qualification.ts";

const detailedChallenge =
  "We need a steadier way to find high-intent prospects, personalize outbound, and keep follow-up from falling through the cracks after the first reply.";

test("scores a strong founder beta tester as high priority", () => {
  const input = {
    betaInterest: "Yes, I want to actively test and provide feedback",
    role: "Founder",
    monthlyLeadVolume: "501-1,000",
    currentTools: ["Apollo", "LinkedIn Sales Navigator"],
    biggestChallenge: detailedChallenge,
    phone: "555-555-5555",
    companyWebsite: "https://example.com",
  };

  const score = scoreWaitlist(input);
  assert.equal(score, 100);
  assert.equal(priorityFromScore(score), "high");
  assert.equal(segmentWaitlist(input, score), "Founding Design Partner Candidate");
});

test("keeps low-volume update-only contestants in general waitlist", () => {
  const input = {
    betaInterest: "No, just keep me updated",
    role: "Marketing coordinator",
    monthlyLeadVolume: "Under 50",
    currentTools: ["None"],
    biggestChallenge: "Mostly curious.",
  };

  const score = scoreWaitlist(input);
  assert.equal(score, 0);
  assert.equal(priorityFromScore(score), "low");
  assert.equal(segmentWaitlist(input, score), "General Waitlist");
});

test("classifies open testers with real process as private beta candidates", () => {
  const input = {
    betaInterest: "Maybe, tell me more",
    role: "Sales Director",
    monthlyLeadVolume: "101-500",
    currentTools: ["HubSpot", "Manual outreach"],
    biggestChallenge: detailedChallenge,
  };

  const score = scoreWaitlist(input);
  assert.equal(score, 70);
  assert.equal(priorityFromScore(score), "medium");
  assert.equal(segmentWaitlist(input, score), "Private Beta Candidate");
});

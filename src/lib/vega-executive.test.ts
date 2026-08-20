import assert from "node:assert/strict";
import test from "node:test";
import { classifyVegaExecutiveRequest } from "@/lib/vega-executive";

test("classifies grounded lead ranking questions", () => {
  assert.deepEqual(classifyVegaExecutiveRequest("Which 10 leads are most likely to buy?"), {
    intent: "rank_leads",
    limit: 10,
    companyNames: [],
  });
});

test("classifies team and sales-memory questions", () => {
  assert.equal(classifyVegaExecutiveRequest("What is my team working today?").intent, "team_work");
  assert.equal(classifyVegaExecutiveRequest("Which source is converting best?").intent, "sales_memory");
});

test("keeps write requests outside the reasoning layer", () => {
  assert.equal(classifyVegaExecutiveRequest("Put the best five into Alex's queue").intent, "unsupported_action");
});

test("defaults ambiguous conversation to a grounded pipeline answer", () => {
  assert.equal(classifyVegaExecutiveRequest("Tell me what I should know this morning").intent, "pipeline_status");
});

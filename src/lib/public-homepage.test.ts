import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicPromptExamples, publicVegaPlans } from "./public-homepage.ts";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const formSource = readFileSync(new URL("../components/HomepageCommandForm.tsx", import.meta.url), "utf8");
const publicSource = `${pageSource}\n${JSON.stringify(publicVegaPlans)}`;

test("public homepage has four shared Vega product plans with pricing orientation", () => {
  assert.equal(publicVegaPlans.length, 4);
  assert.deepEqual(
    publicVegaPlans.map((plan) => plan.code),
    ["vega_scout", "vega_reach", "vega_convert", "vega_managed"],
  );
  for (const plan of publicVegaPlans) {
    assert.match(plan.priceLabel, /Starting at|Custom based on/);
    assert.ok(plan.vegaHandles.length > 20);
    assert.ok(plan.customerHandles.length > 20);
    assert.ok(plan.outcome.length > 20);
  }
});

test("homepage examples populate the editable command input before onboarding", () => {
  assert.equal(publicPromptExamples.length, 3);
  assert.match(formSource, /setPrompt\(example\.text\)/);
  assert.match(formSource, /example command selected/);
  assert.match(formSource, /prompt/);
  assert.doesNotMatch(formSource, /api\/source|api\/agent\/run/);
});

test("public homepage uses customer-facing copy and hides internal operator names", () => {
  assert.match(pageSource, /Tell Vega who you want to sell to/);
  assert.match(pageSource, /Start with a conversation, not a complicated form/);
  assert.match(publicSource, /Vega Managed/);
  assert.match(pageSource, /Internal Ghost AI Solutions operating data/);
  assert.doesNotMatch(pageSource, /\bStephen\b|\bNova\b|\bVA\b/);
});

test("homepage navigation and CTAs route into onboarding without live sourcing", () => {
  assert.match(pageSource, /id="how-it-works"/);
  assert.match(pageSource, /id="solutions"/);
  assert.match(pageSource, /id="plans"/);
  assert.match(pageSource, /id="results"/);
  assert.match(pageSource, /Start my Vega consultation/);
  assert.match(formSource, /\/onboarding\/ai/);
  assert.doesNotMatch(pageSource, /api\/source|api\/outreach\/send|api\/agent\/run/);
});

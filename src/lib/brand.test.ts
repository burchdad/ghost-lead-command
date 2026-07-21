import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { brand, publicMetadata } from "../config/brand.ts";
import { vegaAssets } from "../config/vega-assets.ts";
import { publicVegaPlans } from "./public-homepage.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const onboardingSource = readFileSync(new URL("../components/VegaCommercialOnboarding.tsx", import.meta.url), "utf8");
const vegaComponentSource = readFileSync(new URL("../components/vega/index.tsx", import.meta.url), "utf8");
const rootLayoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const onboardingPageSource = readFileSync(new URL("../app/onboarding/ai/page.tsx", import.meta.url), "utf8");
const docsSource = [
  readFileSync(new URL("../../docs/VEGA_DESIGN_SYSTEM.md", import.meta.url), "utf8"),
  readFileSync(new URL("../../docs/BRAND_NAMING_STATUS.md", import.meta.url), "utf8"),
].join("\n");
const publicSource = [pageSource, onboardingSource, vegaComponentSource, rootLayoutSource, onboardingPageSource, docsSource].join("\n");

test("brand config separates company, product, and Vega director roles", () => {
  assert.equal(brand.companyName, "Ghost AI Solutions");
  assert.equal(brand.productName, "Ghost Lead Command");
  assert.equal(brand.aiDirectorName, "Vega");
  assert.equal(brand.aiDirectorTitle, "AI Sales Director");
  assert.notEqual(brand.companyName, brand.aiDirectorName);
  assert.match(brand.legalAttributionText, /Vega is the AI Sales Director within Ghost Lead Command/);
});

test("public metadata is generated from centralized brand language", () => {
  assert.equal(publicMetadata.title, "Ghost Lead Command | AI Customer Acquisition Directed by Vega");
  assert.match(publicMetadata.description, /AI customer-acquisition platform by Ghost AI Solutions/);
  assert.match(rootLayoutSource, /publicMetadata/);
  assert.match(onboardingPageSource, /brand\.aiDirectorName/);
});

test("public surfaces include Ghost AI attribution and avoid trademark claims", () => {
  assert.match(publicSource, /A product of Ghost AI Solutions/);
  assert.match(publicSource, /Ghost Lead Command is a product of Ghost AI Solutions/);
  assert.doesNotMatch(publicSource, /Vega, Inc|Vega Corporation|Vega LLC|Trademark|Registered|[™®]/);
});

test("Vega components power the homepage and onboarding identity", () => {
  assert.match(pageSource, /VegaDirectorPanel/);
  assert.match(pageSource, /VegaPlanCard/);
  assert.match(pageSource, /VegaMessageBubble/);
  assert.match(onboardingSource, /VegaMessageBubble/);
  assert.match(onboardingSource, /VegaIdentity/);
  assert.match(onboardingSource, /GhostProductAttribution/);
  assert.match(vegaComponentSource, /vegaAssets\.neutral/);
});

test("plan pricing and recommendation label remain shared config data", () => {
  const convert = publicVegaPlans.find((plan) => plan.code === "vega_convert");
  const managed = publicVegaPlans.find((plan) => plan.code === "vega_managed");
  assert.equal(convert?.label, "Full conversion workflow");
  assert.match(convert?.priceLabel || "", /Starting at/);
  assert.match(managed?.priceLabel || "", /Custom based on/);
});

test("asset registry paths resolve to public files", () => {
  for (const assetPath of Object.values(vegaAssets)) {
    assert.ok(assetPath.startsWith("/"), `${assetPath} should be root-relative`);
    assert.ok(existsSync(join(root, "public", assetPath.slice(1))), `${assetPath} should exist in public`);
  }
});

test("public homepage hides internal operator names and keeps future rename configurable", () => {
  assert.doesNotMatch(pageSource, /\bStephen\b|\bNova\b|\bVA\b/);
  assert.match(pageSource, /brand\.productName/);
  assert.match(pageSource, /brand\.legalAttributionText/);
  assert.doesNotMatch(pageSource, /Vega Lead Command/);
});

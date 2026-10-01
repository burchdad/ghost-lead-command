import assert from "node:assert/strict";
import test from "node:test";
import { searchFreshLeads } from "./sourcing";
import type { SourceLead } from "./sourcing";
import { mapsStart, nextMapsStart } from "./source-pagination";
import { callSourceDecision } from "./call-source-policy";

test("Maps pagination uses bounded offsets and never follows arbitrary next URLs", () => {
  assert.equal(mapsStart("20"), 20);
  assert.throws(() => mapsStart("bad"));
  assert.throws(() => mapsStart("120"));
  assert.equal(nextMapsStart("https://serpapi.com/search.json?start=40", 20), "40");
  assert.equal(nextMapsStart("https://serpapi.com/search.json?start=20", 20), null);
  assert.equal(nextMapsStart(undefined, 0), null);
});

test("call readiness does not require email or named buyer and honors channel suppression", () => {
  const lead = { companyName: "Example HVAC", phone: "+1 (903) 555-0100", email: "", website: "https://example.com", score: 65, buyerFit: "Unclear" } as SourceLead;
  assert.equal(callSourceDecision(lead, []), "call-ready");
  assert.equal(callSourceDecision(lead, [{ type: "phone", value: "9035550100" }]), "suppressed");
  assert.equal(callSourceDecision(lead, [{ type: "company", value: "example hvac" }]), "suppressed");
  assert.equal(callSourceDecision(lead, [{ type: "domain", value: "example.com" }]), "suppressed");
  assert.equal(callSourceDecision(lead, [{ type: "email", value: "bounced@example.com" }]), "call-ready");
  assert.equal(callSourceDecision({ ...lead, phone: "123" }, []), "missing-usable-phone");
  assert.equal(callSourceDecision({ ...lead, buyerFit: "Vendor risk" }, []), "poor-fit");
});

test("Google Maps returns a real next offset and keeps phone sourcing independent of email enrichment", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.SERPAPI_API_KEY;
  process.env.SERPAPI_API_KEY = "test";
  global.fetch = (async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "serpapi.com");
    assert.equal(url.searchParams.get("start"), "20");
    assert.equal(url.searchParams.has("next_page_token"), false);
    return Response.json({ local_results: [{ place_id: "test1", title: "Example HVAC", phone: "9035550100", website: "https://example.com", address: "Tyler, Texas" }], serpapi_pagination: { next: "https://serpapi.com/search.json?start=40" } });
  }) as typeof fetch;
  try {
    const result = await searchFreshLeads({ provider: "google-maps", query: "HVAC", location: "Tyler, Texas", size: 50, scrollToken: "20", mode: "call-ready" });
    assert.equal(result.scrollToken, "40");
    assert.equal(result.leads[0].phone, "9035550100");
    assert.equal(result.leads[0].email, "");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SERPAPI_API_KEY; else process.env.SERPAPI_API_KEY = originalKey;
  }
});

test("Apollo source search normalizes people into Ghost Director source leads", async () => {
  const originalApiKey = process.env.APOLLO_API_KEY;
  const originalEnrichLimit = process.env.APOLLO_ENRICH_LIMIT;
  const originalFetch = global.fetch;
  const calls: { url: string; body: unknown }[] = [];

  process.env.APOLLO_API_KEY = "test-apollo-key";
  process.env.APOLLO_ENRICH_LIMIT = "1";
  global.fetch = (async (input, init) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (String(input).includes("/people/match")) {
      return Response.json({
        person: {
          id: "person_1",
          email: "owner@example.com",
          email_status: "verified",
        },
      });
    }

    return Response.json({
      people: [
        {
          id: "person_1",
          name: "Jamie Owner",
          title: "Owner",
          organization: {
            name: "Example Services",
            website_url: "https://example.com",
            industry: "Facilities Services",
            city: "Tyler",
            state: "Texas",
          },
        },
      ],
      pagination: { total_entries: 1, page: 1, total_pages: 1 },
    });
  }) as typeof fetch;

  try {
    const result = await searchFreshLeads({
      provider: "apollo",
      query: "commercial cleaning companies",
      location: "Tyler, Texas",
      size: 10,
      titles: ["Owner"],
    });

    assert.equal(result.provider, "apollo");
    assert.equal(result.dryRun, false);
    assert.equal(calls[0]?.url, "https://api.apollo.io/api/v1/mixed_people/api_search");
    assert.deepEqual(calls[0]?.body, {
      q_keywords: "commercial cleaning companies",
      person_titles: ["Owner"],
      person_locations: ["Tyler, Texas"],
      organization_locations: ["Tyler, Texas"],
      contact_email_status: ["verified"],
      per_page: 10,
      page: 1,
    });
    assert.equal(result.leads[0]?.source, "Apollo");
    assert.equal(result.leads[0]?.email, "owner@example.com");
    assert.equal(result.leads[0]?.companyName, "Example Services");
  } finally {
    if (originalApiKey === undefined) delete process.env.APOLLO_API_KEY;
    else process.env.APOLLO_API_KEY = originalApiKey;
    if (originalEnrichLimit === undefined) delete process.env.APOLLO_ENRICH_LIMIT;
    else process.env.APOLLO_ENRICH_LIMIT = originalEnrichLimit;
    global.fetch = originalFetch;
  }
});

test("Facebook business discovery corroborates public Pages with Google Maps locations", async () => {
  const originalApiKey = process.env.SERPAPI_API_KEY;
  const originalFetch = global.fetch;
  const calls: URL[] = [];

  process.env.SERPAPI_API_KEY = "test-serp-key";
  global.fetch = (async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.searchParams.get("engine") === "google_maps") {
      return Response.json({
        local_results: [
          {
            place_id: "place_1",
            title: "Naks Exterior Services",
            type: "Commercial cleaning service",
            phone: "(903) 555-0199",
            address: "Tyler, TX 75701",
            rating: 4.9,
            reviews: 42,
            link: "https://maps.google.com/?cid=123",
          },
        ],
      });
    }

    return Response.json({
      organic_results: [
        {
          title: "A promotional post from Naks Exterior Services",
          link: "https://www.facebook.com/naksexteriorservices/posts/123456789/",
        },
        {
          position: 1,
          title: "Naks Exterior Services | Facebook",
          link: "https://www.facebook.com/naksexteriorservices/",
          snippet: "Commercial exterior cleaning in Tyler, Texas.",
        },
      ],
    });
  }) as typeof fetch;

  try {
    const result = await searchFreshLeads({
      provider: "facebook-business",
      query: "commercial window cleaning",
      location: "Tyler, Texas",
      industries: ["Commercial Cleaning"],
      size: 10,
    });

    assert.equal(result.provider, "facebook-business");
    assert.equal(result.dryRun, false);
    assert.equal(result.total, 1);
    assert.equal(result.leads[0]?.companyName, "Naks Exterior Services");
    assert.equal(result.leads[0]?.phone, "(903) 555-0199");
    assert.equal(result.leads[0]?.location, "Tyler, TX 75701");
    assert.equal(result.leads[0]?.sourceUrl, "https://www.facebook.com/naksexteriorservices/");
    assert.match(result.leads[0]?.source || "", /Facebook business Page \+ Google Maps/);
    assert.ok(result.leads[0]?.intentSignals.includes("business identity and location corroborated by Google Maps"));
    assert.equal(calls.some((url) => url.searchParams.get("engine") === "google_maps"), true);
    assert.equal(calls.some((url) => url.searchParams.get("engine") === "google" && url.searchParams.get("q")?.includes("site:facebook.com")), true);
  } finally {
    if (originalApiKey === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  }
});

test("unmatched Facebook business Pages remain research-only", async () => {
  const originalApiKey = process.env.SERPAPI_API_KEY;
  const originalFetch = global.fetch;

  process.env.SERPAPI_API_KEY = "test-serp-key";
  global.fetch = (async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get("engine") === "google_maps") return Response.json({ local_results: [] });
    return Response.json({
      organic_results: [
        {
          title: "East Texas Property Care | Facebook",
          link: "https://www.facebook.com/easttexaspropertycare/",
        },
      ],
    });
  }) as typeof fetch;

  try {
    const result = await searchFreshLeads({
      provider: "facebook-business",
      query: "commercial property services",
      location: "Tyler, Texas",
      size: 10,
    });

    assert.equal(result.leads.length, 0);
    assert.ok("reviewLeads" in result);
    if (!("reviewLeads" in result)) return;
    assert.equal(result.reviewLeads?.length, 1);
    assert.equal(result.reviewLeads?.[0]?.companyName, "East Texas Property Care");
    assert.equal(result.reviewLeads?.[0]?.confidence, "needs cross-source verification");
    assert.equal(result.reviewLeads?.[0]?.email, "");
    assert.equal(result.reviewLeads?.[0]?.phone, "");
  } finally {
    if (originalApiKey === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  }
});

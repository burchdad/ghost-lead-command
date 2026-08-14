import assert from "node:assert/strict";
import test from "node:test";
import { searchFreshLeads } from "./sourcing";

test("Apollo source search normalizes people into Vega source leads", async () => {
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

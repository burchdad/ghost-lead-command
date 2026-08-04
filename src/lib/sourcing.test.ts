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

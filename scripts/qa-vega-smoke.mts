import fs from "node:fs";
import path from "node:path";

type Check = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

type OnboardingFact = {
  key?: string;
  value?: string;
};

const checks: Check[] = [];
const liveSource = process.argv.includes("--live-source");

for (const file of [".env.production.local", ".env.local", ".env.vercel.production"]) {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    Object.assign(process.env, parseEnvFile(fs.readFileSync(filePath, "utf8")));
  }
}

function parseEnvFile(content: string) {
  const values: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function add(name: string, status: Check["status"], detail: string) {
  checks.push({ name, status, detail });
}

function scrub(text: unknown) {
  return String(text || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/pplx-[A-Za-z0-9._-]+/g, "pplx-[redacted]")
    .replace(/SG\.[A-Za-z0-9._-]+/g, "SG.[redacted]")
    .slice(0, 700);
}

function isOnboardingFact(value: unknown): value is OnboardingFact {
  return !!value && typeof value === "object" && "key" in value;
}

function factValue(facts: unknown[], key: string) {
  for (const fact of facts) {
    if (isOnboardingFact(fact) && fact.key === key && typeof fact.value === "string") {
      return fact.value;
    }
  }
  return undefined;
}

function reviewLeadCount(result: unknown) {
  if (!result || typeof result !== "object" || !("reviewLeads" in result)) return 0;
  const reviewLeads = (result as { reviewLeads?: unknown }).reviewLeads;
  return Array.isArray(reviewLeads) ? reviewLeads.length : 0;
}

async function run() {
  const [{ getPrisma }, { getDefaultWorkspace }, { ensureLeadCommandCoreSchema }, { getSourcingStatus, searchFreshLeads }] =
    await Promise.all([
      import("../src/lib/prisma"),
      import("../src/lib/workspace"),
      import("../src/lib/lead-command-schema"),
      import("../src/lib/sourcing"),
    ]);
  const [
    { ensureVegaOnboardingSchema },
    { startCommercialOnboarding },
    { getSourceScorecard },
    { getWarmLeadPriorityReport, getBookingDiagnosisReport },
    { runVegaConversionAudit },
  ] = await Promise.all([
    import("../src/lib/vega-onboarding-schema"),
    import("../src/lib/vega-launch-team"),
    import("../src/lib/source-scorecard"),
    import("../src/lib/warm-leads"),
    import("../src/lib/conversion-audit"),
  ]);

  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  await ensureLeadCommandCoreSchema(workspace.id);
  await ensureVegaOnboardingSchema(prisma);
  add("schema guards", "pass", `Core and Vega onboarding schema guards completed for workspace ${workspace.name}.`);

  const status = getSourcingStatus();
  add(
    "provider configuration",
    status.apolloConfigured && status.googleMapsConfigured ? "pass" : "warn",
    `PDL=${status.pdlConfigured}, Apollo=${status.apolloConfigured}, Google Maps=${status.googleMapsConfigured}, GhostLeadAgent=${status.ghostLeadAgentConfigured}.`,
  );

  const session = await startCommercialOnboarding({
    visitorId: `qa-vega-${Date.now()}`,
    message:
      "Naks Exterior Services wants commercial window cleaning and exterior cleaning contracts around Tyler, Texas. Send daily lead updates and call tasks to sales@naks.com. The sales manager will handle phone follow-up.",
  });
  if (!session) {
    add("commercial onboarding", "fail", "No onboarding session was returned.");
    return;
  }
  const facts = Array.isArray(session.collectedFacts) ? session.collectedFacts : [];
  const salesEmail = factValue(facts, "salesUpdateRecipientEmail");
  const service = factValue(facts, "serviceOrProduct");
  add(
    "commercial onboarding",
    salesEmail === "sales@naks.com" && /window cleaning/i.test(String(service)) ? "pass" : "fail",
    `Captured ${facts.length} facts; sales update email=${salesEmail || "missing"}; service=${service || "missing"}.`,
  );

  const [scorecard, warm, booking, conversion] = await Promise.all([
    getSourceScorecard(),
    getWarmLeadPriorityReport({ limit: 5, createEvent: false }),
    getBookingDiagnosisReport({ createEvent: false }),
    runVegaConversionAudit({ days: 7, createEvent: false }),
  ]);
  add("source scorecard", "pass", `${scorecard.rows.length} sources evaluated; top source=${scorecard.summary.topSource || "none"}.`);
  add("warm lead report", "pass", `${warm.leads.length} warm leads ranked. ${warm.summary}`);
  add("booking diagnosis", "pass", booking.summary);
  add("conversion audit", conversion.gaps.length ? "warn" : "pass", `${conversion.summary} Gaps=${conversion.gaps.length}.`);

  if (liveSource) {
    if (status.apolloConfigured) {
      const apollo = await searchFreshLeads({
        provider: "apollo",
        query: "property managers commercial cleaning exterior services",
        location: "Tyler, Texas",
        industries: ["commercial real estate", "facilities services", "property management"],
        titles: ["Property Manager", "Facilities Manager", "Operations Manager", "Owner"],
        size: 1,
      });
      add(
        "apollo live source",
        apollo.message?.match(/returned 4\d\d|returned 5\d\d|not configured/i) ? "fail" : "pass",
        `total=${apollo.total}; leads=${apollo.leads.length}; review=${reviewLeadCount(apollo)}; message=${scrub(apollo.message || "ok")}.`,
      );
    } else {
      add("apollo live source", "warn", "Skipped because APOLLO_API_KEY is not configured.");
    }

    if (status.googleMapsConfigured) {
      const maps = await searchFreshLeads({
        provider: "google-maps",
        query: "commercial property managers office buildings dealerships",
        location: "Tyler, Texas",
        industries: ["commercial cleaning", "property management"],
        size: 3,
      });
      add(
        "google maps live source",
        maps.message?.match(/returned 4\d\d|returned 5\d\d|not configured/i) ? "fail" : "pass",
        `total=${maps.total}; leads=${maps.leads.length}; review=${reviewLeadCount(maps)}; message=${scrub(maps.message || "ok")}.`,
      );
    } else {
      add("google maps live source", "warn", "Skipped because SERPAPI_API_KEY is not configured.");
    }
  } else {
    add("live source reads", "warn", "Skipped. Re-run with --live-source for tiny Apollo/Google Maps read-only provider checks.");
  }
}

await run().catch((error) => {
  add("qa harness", "fail", scrub(error instanceof Error ? error.message : error));
});

for (const check of checks) {
  const mark = check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL";
  console.log(`${mark} ${check.name}: ${check.detail}`);
}

const failed = checks.filter((check) => check.status === "fail");
process.exit(failed.length ? 1 : 0);

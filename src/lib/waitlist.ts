import type { Prisma, Lead } from "@prisma/client";
import { pushLeadToGhostCrm } from "@/lib/ghostcrm";
import { sendEmail } from "@/lib/outreach";
import { getPrisma } from "@/lib/prisma";
import { notifySlackWaitlistCandidate } from "@/lib/slack";
import {
  betaInterestOptions,
  currentToolsOptions,
  highLeadVolume,
  hasRealPlatform,
  isActiveBetaInterest,
  monthlyLeadVolumeOptions,
  priorityFromScore,
  QualificationSegment,
  roleIsDecisionMaker,
  scoreWaitlist,
  segmentWaitlist,
  usesCompetitorPlatform,
} from "@/lib/waitlist-qualification";
import { getDefaultWorkspace } from "@/lib/workspace";

export { betaInterestOptions, currentToolsOptions, monthlyLeadVolumeOptions, priorityFromScore, scoreWaitlist, segmentWaitlist };

export type WaitlistInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  companyName: string;
  companyWebsite?: string;
  role: string;
  biggestChallenge: string;
  currentTools: string[];
  otherTool?: string;
  monthlyLeadVolume: string;
  betaInterest: string;
  additionalNotes?: string;
  consent: boolean;
  website?: string;
  attribution: WaitlistAttribution;
};

export type WaitlistAttribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referralCode?: string;
  source?: string;
  signupPage?: string;
  referringUrl?: string;
  userAgent?: string;
  ipAddress?: string;
};

type ValidationResult =
  | { ok: true; value: WaitlistInput }
  | { ok: false; errors: Record<string, string> };

function clean(value: unknown, maxLength = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanLong(value: unknown, maxLength = 3000) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

export function normalizeEmail(value: unknown) {
  return clean(value, 254).toLowerCase();
}

export function normalizeUrlValue(value: unknown) {
  const raw = clean(value, 300);
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function domainFromUrl(value: string) {
  if (!value) return "";
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isDisposableEmail(value: string) {
  const domain = value.split("@").pop() || "";
  return [
    "mailinator.com",
    "10minutemail.com",
    "guerrillamail.com",
    "tempmail.com",
    "yopmail.com",
    "example.com",
  ].includes(domain);
}

function includesOption<T extends readonly string[]>(options: T, value: string): value is T[number] {
  return options.includes(value as T[number]);
}

export function validateWaitlistPayload(payload: unknown, attribution: WaitlistAttribution): ValidationResult {
  const body = (payload || {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const honeypot = clean(body.website);
  if (honeypot) errors.website = "Submission could not be accepted.";

  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const email = normalizeEmail(body.email);
  const phone = clean(body.phone, 40);
  const companyName = clean(body.companyName, 160);
  const companyWebsite = normalizeUrlValue(body.companyWebsite);
  const role = clean(body.role, 160);
  const biggestChallenge = cleanLong(body.biggestChallenge, 2000);
  const additionalNotes = cleanLong(body.additionalNotes, 2000);
  const currentTools = Array.isArray(body.currentTools)
    ? body.currentTools.map((tool) => clean(tool, 80)).filter(Boolean)
    : [];
  const otherTool = clean(body.otherTool, 80);
  const monthlyLeadVolume = clean(body.monthlyLeadVolume, 40);
  const betaInterest = clean(body.betaInterest, 120);
  const consent = body.consent === true || body.consent === "true";

  if (!firstName) errors.firstName = "First name is required.";
  if (!lastName) errors.lastName = "Last name is required.";
  if (!isEmail(email)) errors.email = "Enter a valid business email.";
  if (isDisposableEmail(email)) errors.email = "Please use a non-disposable email address.";
  if (!companyName) errors.companyName = "Company name is required.";
  if (!role) errors.role = "Role or job title is required.";
  if (biggestChallenge.length < 12) errors.biggestChallenge = "Tell us a little more about the challenge.";
  if (!currentTools.length) errors.currentTools = "Select at least one current tool.";
  if (currentTools.some((tool) => !includesOption(currentToolsOptions, tool))) {
    errors.currentTools = "Select only supported tool options.";
  }
  if (currentTools.includes("Other") && !otherTool) errors.otherTool = "Add the other tool name.";
  if (!includesOption(monthlyLeadVolumeOptions, monthlyLeadVolume)) errors.monthlyLeadVolume = "Select monthly lead volume.";
  if (!includesOption(betaInterestOptions, betaInterest)) errors.betaInterest = "Select beta testing interest.";
  if (!consent) errors.consent = "Consent is required.";

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      email,
      phone,
      companyName,
      companyWebsite,
      role,
      biggestChallenge,
      currentTools: otherTool ? [...currentTools.filter((tool) => tool !== "Other"), `Other: ${otherTool}`] : currentTools,
      otherTool,
      monthlyLeadVolume,
      betaInterest,
      additionalNotes,
      consent,
      attribution,
    },
  };
}

function mergeTags(existing: Prisma.JsonValue | null | undefined, next: string[]) {
  const current = Array.isArray(existing) ? existing.filter((tag): tag is string => typeof tag === "string") : [];
  return [...new Set([...current, ...next])];
}

function mergeCustomFields(existing: Prisma.JsonValue | null | undefined, next: Record<string, unknown>) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? existing as Record<string, unknown> : {};
  return { ...base, ...next };
}

function buildTags(input: WaitlistInput, segment: QualificationSegment) {
  const tags = ["Vega Waitlist Contestant", "Early Access", "Vega", segment];
  if (isActiveBetaInterest(input.betaInterest)) tags.push("Active Beta Interest");
  if (highLeadVolume(input.monthlyLeadVolume)) tags.push("High Lead Volume");
  if (/\bagency\b/i.test(`${input.role} ${input.companyName}`)) tags.push("Agency");
  if (/\bsales|revenue|growth|business development|bdr|sdr\b/i.test(input.role)) tags.push("Sales Team");
  if (usesCompetitorPlatform(input.currentTools)) tags.push("Uses Competitor Platform");
  if (input.attribution.utmContent === "vega_vs_gojiberry" || input.attribution.utmMedium === "infographic") {
    tags.push("Comparison Infographic Signup");
  }
  return tags;
}

function qualificationReason(input: WaitlistInput, score: number, segment: QualificationSegment) {
  return [
    `${segment} at score ${score}.`,
    roleIsDecisionMaker(input.role) ? "Decision-maker role." : "",
    highLeadVolume(input.monthlyLeadVolume) ? "Meaningful lead volume." : "",
    isActiveBetaInterest(input.betaInterest) ? "Actively wants to beta test." : "",
    hasRealPlatform(input.currentTools) ? "Existing lead-generation process or tooling." : "",
  ].filter(Boolean).join(" ");
}

function buildCustomFields(input: WaitlistInput, score: number, segment: QualificationSegment, originalJoinedAt: Date) {
  const now = new Date();
  return {
    waitlistProduct: "Vega",
    waitlistStatus: "active",
    signupSource: input.attribution.utmContent === "vega_vs_gojiberry" ? "comparison-infographic-qr" : "public-waitlist",
    signupPage: input.attribution.signupPage || "",
    originalJoinedAt: originalJoinedAt.toISOString(),
    latestSubmissionAt: now.toISOString(),
    currentTools: input.currentTools,
    monthlyLeadVolume: input.monthlyLeadVolume,
    biggestChallenge: input.biggestChallenge,
    betaInterest: input.betaInterest,
    companyWebsite: input.companyWebsite || "",
    additionalNotes: input.additionalNotes || "",
    utmSource: input.attribution.utmSource || "",
    utmMedium: input.attribution.utmMedium || "",
    utmCampaign: input.attribution.utmCampaign || "",
    utmContent: input.attribution.utmContent || "",
    utmTerm: input.attribution.utmTerm || "",
    referralCode: input.attribution.referralCode || "",
    referringUrl: input.attribution.referringUrl || "",
    qualificationSegment: segment,
    qualificationReason: qualificationReason(input, score, segment),
    consentVersion: "vega-waitlist-v1",
    consentedAt: now.toISOString(),
    confirmationEmailStatus: "pending",
  };
}

function interactionBody(input: WaitlistInput, segment: QualificationSegment, score: number) {
  return [
    "Vega waitlist signup received.",
    "",
    `Name: ${input.firstName} ${input.lastName}`,
    `Company: ${input.companyName}`,
    `Role: ${input.role}`,
    `Email: ${input.email}`,
    input.phone ? `Phone: ${input.phone}` : "",
    input.companyWebsite ? `Website: ${input.companyWebsite}` : "",
    `Current tools: ${input.currentTools.join(", ")}`,
    `Monthly lead volume: ${input.monthlyLeadVolume}`,
    `Beta interest: ${input.betaInterest}`,
    `Biggest challenge: ${input.biggestChallenge}`,
    `Segment: ${segment}`,
    `Score: ${score}`,
    input.attribution.utmContent === "vega_vs_gojiberry"
      ? "Source: Vega vs GojiBerry comparison infographic"
      : `Source: ${input.attribution.source || "Vega waitlist"}`,
  ].filter(Boolean).join("\n");
}

function leadTitle(input: WaitlistInput) {
  return `Vega Waitlist - ${input.companyName || `${input.firstName} ${input.lastName}`}`;
}

function nextActionForPriority(priority: string) {
  if (priority === "high") return "Personally review for founding design partner outreach.";
  if (priority === "medium") return "Review for private beta invitation.";
  return "Keep in Vega product update nurture.";
}

function shouldUpdate(existing: string | null | undefined, next: string | undefined) {
  return Boolean(next && (!existing || next.length > existing.length));
}

export function attributionFromRequest(request: Request) {
  const url = new URL(request.url);
  const header = (name: string) => request.headers.get(name) || "";
  const forwardedFor = header("x-forwarded-for").split(",")[0]?.trim();
  return {
    utmSource: clean(url.searchParams.get("utm_source"), 120),
    utmMedium: clean(url.searchParams.get("utm_medium"), 120),
    utmCampaign: clean(url.searchParams.get("utm_campaign"), 160),
    utmContent: clean(url.searchParams.get("utm_content"), 160),
    utmTerm: clean(url.searchParams.get("utm_term"), 160),
    referralCode: clean(url.searchParams.get("ref"), 120),
    source: clean(url.searchParams.get("source"), 120),
    signupPage: url.toString(),
    referringUrl: clean(header("referer"), 500),
    userAgent: clean(header("user-agent"), 500),
    ipAddress: forwardedFor || header("x-real-ip"),
  };
}

async function sendConfirmationEmail(input: WaitlistInput) {
  return sendEmail({
    to: input.email,
    subject: "You're on the Vega early-access waitlist",
    text: [
      `Hi ${input.firstName},`,
      "",
      "Thanks for joining the Vega early-access waitlist.",
      "Vega will review early-access contestants and prioritize businesses that can actively test the platform and provide meaningful feedback.",
      "Selected contestants may receive beta or founding design-partner invitations, but access, pricing, and pilot availability are not guaranteed.",
      "",
      "Public Vega page: https://leadgen.ghostai.solutions/",
      "",
      "You can unsubscribe or update communication preferences using the unsubscribe path included in future product emails.",
    ].join("\n"),
  });
}

export async function submitWaitlist(input: WaitlistInput) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const score = scoreWaitlist(input);
  const segment = segmentWaitlist(input, score);
  const priority = priorityFromScore(score);
  const now = new Date();
  const domain = domainFromUrl(input.companyWebsite || "");
  const tags = buildTags(input, segment);
  const fullName = `${input.firstName} ${input.lastName}`.trim();

  const result = await prisma.$transaction(async (tx) => {
    const submission = await tx.waitlistSubmission.create({
      data: {
        workspaceId: workspace.id,
        email: input.email,
        payload: input as unknown as Prisma.InputJsonValue,
        status: "received",
      },
    });

    const companyMatches: Prisma.CompanyWhereInput[] = [
      { name: { equals: input.companyName, mode: "insensitive" } },
    ];
    if (domain) companyMatches.push({ domain: { equals: domain, mode: "insensitive" } });
    if (input.companyWebsite) companyMatches.push({ website: { equals: input.companyWebsite, mode: "insensitive" } });

    let company = await tx.company.findFirst({
      where: {
        workspaceId: workspace.id,
        OR: companyMatches,
      },
    });

    if (!company) {
      company = await tx.company.create({
        data: {
          workspaceId: workspace.id,
          name: input.companyName,
          niche: "Vega Waitlist",
          website: input.companyWebsite || null,
          domain: domain || null,
          crmSource: "Vega Waitlist",
        },
      });
    } else {
      company = await tx.company.update({
        where: { id: company.id },
        data: {
          website: shouldUpdate(company.website, input.companyWebsite) ? input.companyWebsite : company.website,
          domain: company.domain || domain || null,
          crmSource: company.crmSource || "Vega Waitlist",
        },
      });
    }

    let contact = await tx.contact.findFirst({
      where: { workspaceId: workspace.id, email: input.email },
    });

    if (!contact) {
      contact = await tx.contact.create({
        data: {
          workspaceId: workspace.id,
          companyId: company.id,
          name: fullName,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone || null,
          role: input.role,
          title: input.role,
          source: "Vega Waitlist",
        },
      });
    } else {
      contact = await tx.contact.update({
        where: { id: contact.id },
        data: {
          companyId: contact.companyId || company.id,
          name: shouldUpdate(contact.name, fullName) ? fullName : contact.name,
          firstName: contact.firstName || input.firstName,
          lastName: contact.lastName || input.lastName,
          phone: shouldUpdate(contact.phone, input.phone) ? input.phone : contact.phone,
          role: shouldUpdate(contact.role, input.role) ? input.role : contact.role,
          title: shouldUpdate(contact.title, input.role) ? input.role : contact.title,
          source: contact.source || "Vega Waitlist",
        },
      });
    }

    const existingLead = await tx.lead.findFirst({
      where: {
        workspaceId: workspace.id,
        contactId: contact.id,
        source: "vega-waitlist",
        status: "active",
      },
      orderBy: { createdAt: "asc" },
    });
    const originalJoinedAt = existingLead?.createdAt || now;
    const customFields = buildCustomFields(input, score, segment, originalJoinedAt);
    const nextAction = nextActionForPriority(priority);

    const leadData = {
      companyId: company.id,
      contactId: contact.id,
      name: fullName,
      title: leadTitle(input),
      description: input.biggestChallenge,
      companyName: company.name,
      niche: "Vega Waitlist",
      stage: "waitlist",
      priority,
      score,
      leadScore: score,
      value: 0,
      source: "vega-waitlist",
      lastTouch: existingLead ? "Waitlist resubmitted" : "Waitlist signup",
      nextAction,
      tags: mergeTags(existingLead?.tags, tags) as Prisma.InputJsonValue,
      customFields: mergeCustomFields(existingLead?.customFields, customFields) as Prisma.InputJsonValue,
      crmSyncStatus: "pending",
    };

    const lead = existingLead
      ? await tx.lead.update({ where: { id: existingLead.id }, data: leadData })
      : await tx.lead.create({
          data: {
            workspaceId: workspace.id,
            ...leadData,
          },
        });

    await tx.interaction.create({
      data: {
        leadId: lead.id,
        contactId: contact.id,
        channel: "web-form",
        direction: "inbound",
        classification: existingLead ? "vega-waitlist-resubmission" : "vega-waitlist-signup",
        body: interactionBody(input, segment, score),
        metadata: {
          form: input,
          attribution: input.attribution,
          score,
          segment,
          priority,
          resubmission: Boolean(existingLead),
        } as Prisma.InputJsonValue,
      },
    });

    await tx.waitlistSubmission.update({
      where: { id: submission.id },
      data: {
        status: "stored",
        crmContactId: contact.id,
        crmLeadId: lead.id,
      },
    });

    return { submissionId: submission.id, contact, lead, segment, score, priority };
  });

  const [crmResult, emailResult, slackResult] = await Promise.allSettled([
    pushLeadToGhostCrm(result.lead as Lead),
    sendConfirmationEmail(input),
    result.priority === "high" || result.segment === "Founding Design Partner Candidate"
      ? notifySlackWaitlistCandidate({
          name: fullName,
          company: input.companyName,
          role: input.role,
          score: result.score,
          segment: result.segment,
          monthlyLeadVolume: input.monthlyLeadVolume,
          tools: input.currentTools,
          challenge: input.biggestChallenge,
          nextAction: nextActionForPriority(result.priority),
        })
      : Promise.resolve({ configured: false, sent: false, message: "Priority below Slack notification threshold." }),
  ]);

  const crm = crmResult.status === "fulfilled" ? crmResult.value : { status: "failed" as const, message: "GhostCRM sync failed." };
  const email = emailResult.status === "fulfilled" ? emailResult.value : { status: "failed" as const, message: "Confirmation email failed." };
  const slack = slackResult.status === "fulfilled" ? slackResult.value : { sent: false, message: "Slack notification failed." };
  const synced = crm.status === "synced";

  await prisma.lead.update({
    where: { id: result.lead.id },
    data: {
      crmSyncStatus: synced ? "synced" : crm.status === "queued" ? "queued" : "failed",
      crmSyncedAt: synced ? new Date() : null,
      customFields: mergeCustomFields(result.lead.customFields, {
        confirmationEmailStatus: email.status,
        confirmationEmailMessage: email.message || "",
        slackNotificationSent: Boolean(slack.sent),
        crmSyncMessage: crm.message || "",
      }) as Prisma.InputJsonValue,
    },
  });

  await prisma.waitlistSubmission.update({
    where: { id: result.submissionId },
    data: {
      status: synced ? "synced" : "awaiting_crm_sync",
      syncedAt: synced ? new Date() : null,
      error: synced ? null : crm.message || null,
    },
  });

  return {
    ok: true,
    score: result.score,
    segment: result.segment,
    priority: result.priority,
    crmStatus: synced ? "synced" : "awaiting_crm_sync",
    emailStatus: email.status,
    slackSent: Boolean(slack.sent),
  };
}

export async function getWaitlistDashboard() {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const leads = await prisma.lead.findMany({
    where: { workspaceId: workspace.id, source: "vega-waitlist", status: "active" },
    orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
    include: {
      contact: true,
      company: true,
      interactions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const enriched = leads.map((lead) => {
    const customFields = lead.customFields && typeof lead.customFields === "object" && !Array.isArray(lead.customFields)
      ? lead.customFields as Record<string, unknown>
      : {};
    const tags = Array.isArray(lead.tags) ? lead.tags.filter((tag): tag is string => typeof tag === "string") : [];
    return { ...lead, waitlistFields: customFields, waitlistTags: tags };
  });

  return {
    summary: {
      total: leads.length,
      founding: enriched.filter((lead) => lead.waitlistTags.includes("Founding Design Partner Candidate")).length,
      privateBeta: enriched.filter((lead) => lead.waitlistTags.includes("Private Beta Candidate")).length,
      general: enriched.filter((lead) => lead.waitlistTags.includes("General Waitlist")).length,
      activeBetaInterest: enriched.filter((lead) => lead.waitlistTags.includes("Active Beta Interest")).length,
      addedLast7Days: enriched.filter((lead) => lead.createdAt >= last7).length,
    },
    leads: enriched,
  };
}

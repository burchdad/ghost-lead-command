import { createAutomationEvent, createBookingTaskForLead, pushReadyBookingTasks, runDueSequenceSteps } from "@/lib/automation";
import { runAdaptiveLearningLoop } from "@/lib/adaptive-learning";
import { computeConversionLearning } from "@/lib/conversion-learning";
import { runIntentFeedScout } from "@/lib/intent-feed";
import { runLinkedInContentSignalAgent } from "@/lib/linkedin-content-signals";
import { listLinkedInEvents } from "@/lib/linkedin-products";
import { runLinkedInTaskLane } from "@/lib/linkedin-task-lane";
import { improveOfferCopy } from "@/lib/offer-copy-brain";
import { sanitizeCustomerMessage, sanitizeInternalReason, sanitizeSubject } from "@/lib/message-sanitizer";
import { getOperatorQueueCapacity } from "@/lib/operator-policy";
import { getPrisma } from "@/lib/prisma";
import { runReplyConversionSweep } from "@/lib/replies";
import { runSocialIntentScout } from "@/lib/social-intent";
import { addSuppressionRecord, findSuppressionMatch } from "@/lib/suppression";
import { getDefaultWorkspace } from "@/lib/workspace";

export type VegaSpecialistKind =
  | "contact-path"
  | "booking"
  | "deliverability"
  | "copy-chief"
  | "cadence"
  | "intent-feed"
  | "learning-loop"
  | "social-intent"
  | "linkedin-content"
  | "linkedin-events"
  | "linkedin-tasks"
  | "waitlist"
  | "full-team";

type SpecialistResult = {
  kind: VegaSpecialistKind;
  title: string;
  status: "done" | "needs_review" | "blocked";
  summary: string;
  metrics: Record<string, number | string | boolean>;
  nextMove: string;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function domainFromEmail(email?: string | null) {
  const value = clean(email).toLowerCase();
  return value.includes("@") ? value.split("@").pop() || "" : "";
}

function normalizeWebsite(value?: string | null) {
  return clean(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .toLowerCase();
}

function contactPathBody(input: {
  companyName: string;
  contactName: string;
  website?: string | null;
  phone?: string | null;
  nextAction?: string | null;
}) {
  const website = clean(input.website);
  const phone = clean(input.phone);
  const paths = [
    website ? `Website/contact form: ${website}` : "",
    phone ? `Call path: ${phone}` : "",
    website ? `Likely email patterns to verify: info@${normalizeWebsite(website)}, sales@${normalizeWebsite(website)}` : "",
  ].filter(Boolean);

  return [
    `Manual contact-path task for ${input.companyName}.`,
    `Target contact: ${input.contactName}.`,
    ...paths,
    input.nextAction ? `Context: ${input.nextAction}` : "",
    "Vega move: verify a direct email, use the website form, or call the business before moving this lead into email outreach.",
  ].filter(Boolean).join("\n");
}

export async function runContactPathAgent(input: { limit?: number; itemId?: string } = {}): Promise<SpecialistResult> {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(25, Math.max(1, Number(input.limit || 10)));
  const manualItems = await prisma.outreachQueueItem.findMany({
    where: input.itemId
      ? { workspaceId: workspace.id, id: input.itemId, status: "pending" }
      : { workspaceId: workspace.id, status: "pending", channel: { in: ["manual", "research"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { lead: { include: { contact: true, company: true } } },
  });

  let refreshed = 0;
  let suppressed = 0;
  let missingPath = 0;

  for (const item of manualItems) {
    const lead = item.lead;
    if (!lead) continue;
    const suppression = await findSuppressionMatch({
      email: lead.contact?.email,
      phone: lead.contact?.phone,
      domain: lead.company?.website,
      companyName: lead.companyName,
    });

    if (suppression) {
      suppressed += 1;
      await prisma.outreachQueueItem.update({
        where: { id: item.id },
        data: { status: "rejected", rejectedAt: new Date(), reason: `Suppressed: ${suppression.reason}` },
      });
      continue;
    }

    if (!lead.contact?.phone && !lead.company?.website) {
      missingPath += 1;
      await prisma.outreachQueueItem.update({
        where: { id: item.id },
        data: { reason: "Vega contact-path blocked: no phone, website, or email is available yet." },
      });
      continue;
    }

    await prisma.outreachQueueItem.update({
      where: { id: item.id },
      data: {
        channel: "manual",
        provider: "phone-website",
        subject: `Manual contact path for ${lead.companyName}`,
        body: contactPathBody({
          companyName: lead.companyName,
          contactName: lead.name,
          website: lead.company?.website,
          phone: lead.contact?.phone,
          nextAction: lead.nextAction,
        }),
        reason: "Vega Contact Path Agent refreshed this manual task for operator action.",
      },
    });
    refreshed += 1;
  }

  await createAutomationEvent({
    title: "Vega Contact Path Agent sweep",
    detail: `Reviewed ${manualItems.length} manual contact tasks. Refreshed ${refreshed}, suppressed ${suppressed}, blocked ${missingPath}.`,
    status: refreshed ? "done" : manualItems.length ? "needs_review" : "blocked",
    type: "agent",
    payload: { reviewed: manualItems.length, refreshed, suppressed, missingPath },
  });

  return {
    kind: "contact-path",
    title: "Contact Path Agent",
    status: refreshed ? "done" : manualItems.length ? "needs_review" : "blocked",
    summary: manualItems.length
      ? `Reviewed ${manualItems.length} manual contact tasks and refreshed ${refreshed}.`
      : "No manual contact-path tasks are waiting.",
    metrics: { reviewed: manualItems.length, refreshed, suppressed, missingPath },
    nextMove: refreshed
      ? "Stephen or Vega should work refreshed manual paths, then add verified emails before email outreach."
      : "Run more Google Maps/PDL sourcing or loosen manual-path intake only if volume is needed.",
  };
}

export async function runBookingConciergeAgent(input: { limit?: number } = {}): Promise<SpecialistResult> {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(25, Math.max(1, Number(input.limit || 10)));
  const handoff = await pushReadyBookingTasks({ limit });
  const replies = await prisma.reply.findMany({
    where: {
      workspaceId: workspace.id,
      leadId: { not: null },
      classification: { in: ["booked", "hot"] },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { lead: true },
  });

  let ready = 0;
  let blocked = 0;
  let potentialClients = 0;

  for (const reply of replies) {
    if (!reply.leadId || !reply.lead) continue;
    const booking = await createBookingTaskForLead({
      leadId: reply.leadId,
      replyBody: reply.body,
      classification: reply.classification,
    });
    if (!booking) continue;

    if (booking.blocked) {
      blocked += 1;
      if (!["Confirmed Opportunity", "Potential Client", "Call Booked", "Proposal Sent", "Won"].includes(reply.lead.stage)) {
        await prisma.lead.update({
          where: { id: reply.leadId },
          data: {
            stage: "Confirmed Opportunity",
            nextAction: "Hot reply needs booking handoff, but calendar or meeting-link config is incomplete.",
          },
        });
        potentialClients += 1;
      }
    } else {
      ready += 1;
      await prisma.lead.update({
        where: { id: reply.leadId },
        data: {
          stage: "Confirmed Opportunity",
          nextAction:
            reply.classification === "booked"
              ? "Prospect asked for time. Push booking handoff; move to Call Booked only after calendar is scheduled."
              : "Send booking options and move to Call Booked after a time is confirmed.",
        },
      });
    }
  }

  await createAutomationEvent({
    title: "Vega Booking Concierge sweep",
    detail: `Pushed ${handoff.reviewed} ready booking tasks. Queued ${handoff.queued}, already pending ${handoff.alreadyPending}, scheduled ${handoff.scheduled}, blocked ${handoff.blocked}. Reviewed ${replies.length} hot/booked replies. Booking ready ${ready}, blocked ${blocked}.`,
    status: handoff.queued || handoff.scheduled || handoff.alreadyPending || ready ? "done" : replies.length || handoff.reviewed ? "needs_review" : "blocked",
    type: "booking",
    payload: { reviewed: replies.length, ready, blocked, potentialClients, handoff },
  });

  return {
    kind: "booking",
    title: "Booking Concierge Agent",
    status: handoff.queued || handoff.scheduled || handoff.alreadyPending || ready ? "done" : replies.length || handoff.reviewed ? "needs_review" : "blocked",
    summary: handoff.reviewed || replies.length
      ? `Pushed ${handoff.reviewed} ready booking tasks: ${handoff.queued} queued for approval, ${handoff.alreadyPending} already pending, ${handoff.scheduled} scheduled, ${handoff.blocked} blocked. Reviewed ${replies.length} hot/booked replies; ${ready} new booking tasks are ready.`
      : "No ready booking tasks or hot/booked replies are waiting for booking handoff.",
    metrics: {
      reviewed: replies.length,
      ready,
      blocked,
      potentialClients,
      handoffReviewed: handoff.reviewed,
      handoffQueued: handoff.queued,
      handoffAlreadyPending: handoff.alreadyPending,
      handoffScheduled: handoff.scheduled,
      handoffBlocked: handoff.blocked,
    },
    nextMove: blocked
      ? "Finish meeting-link/calendar config so booked replies stop getting stuck."
      : handoff.queued
        ? "Approve/send the queued booking handoff emails, then watch replies for confirmed times."
        : "Use Vega, work replies after every send batch; booked replies should now move cleanly.",
  };
}

export async function runDeliverabilityGovernor(input: { limit?: number } = {}): Promise<SpecialistResult> {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(100, Math.max(10, Number(input.limit || 50)));
  const failedItems = await prisma.outreachQueueItem.findMany({
    where: { workspaceId: workspace.id, status: "failed", channel: "email" },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { lead: { include: { contact: true, company: true } } },
  });
  const pendingEmail = await prisma.outreachQueueItem.findMany({
    where: { workspaceId: workspace.id, status: "pending", channel: "email" },
    include: { lead: { include: { contact: true, company: true } } },
    take: 250,
  });

  let suppressionsAdded = 0;
  let pendingRejected = 0;
  const failedDomains = new Map<string, number>();

  for (const item of failedItems) {
    const email = item.lead?.contact?.email || "";
    const domain = domainFromEmail(email);
    if (domain) failedDomains.set(domain, (failedDomains.get(domain) || 0) + 1);
    if (email) {
      await addSuppressionRecord({
        type: "email",
        value: email,
        reason: item.reason || "Failed email send",
        source: "vega-deliverability",
      }).then(() => {
        suppressionsAdded += 1;
      }).catch(() => undefined);
    }
  }

  for (const item of pendingEmail) {
    const lead = item.lead;
    if (!lead) continue;
    const suppression = await findSuppressionMatch({
      email: lead.contact?.email,
      phone: lead.contact?.phone,
      domain: lead.company?.website,
      companyName: lead.companyName,
    });
    if (!suppression) continue;
    await prisma.outreachQueueItem.update({
      where: { id: item.id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        reason: `Vega Deliverability Governor rejected suppressed contact: ${suppression.reason}`,
      },
    });
    pendingRejected += 1;
  }

  const noisyDomains = [...failedDomains.entries()].filter(([, count]) => count >= 2).map(([domain]) => domain);
  await createAutomationEvent({
    title: "Vega Deliverability Governor sweep",
    detail: `Reviewed ${failedItems.length} failed sends. Added/confirmed ${suppressionsAdded} suppressions and rejected ${pendingRejected} risky pending emails.`,
    status: failedItems.length || pendingRejected ? "done" : "needs_review",
    type: "sendgrid",
    payload: { failed: failedItems.length, suppressionsAdded, pendingRejected, noisyDomains },
  });

  return {
    kind: "deliverability",
    title: "Deliverability Governor",
    status: failedItems.length || pendingRejected ? "done" : "needs_review",
    summary: `Protected sending by reviewing ${failedItems.length} failed sends and rejecting ${pendingRejected} risky pending emails.`,
    metrics: { failed: failedItems.length, suppressionsAdded, pendingRejected, noisyDomains: noisyDomains.length },
    nextMove: noisyDomains.length
      ? `Watch noisy domains before scaling: ${noisyDomains.slice(0, 4).join(", ")}.`
      : "Keep volume controlled and approve only email-ready leads with clear buyer signals.",
  };
}

export async function runCopyChiefAgent(input: { limit?: number } = {}): Promise<SpecialistResult> {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(25, Math.max(1, Number(input.limit || 10)));
  const items = await prisma.outreachQueueItem.findMany({
    where: { workspaceId: workspace.id, status: "pending", channel: "email" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { lead: true },
  });

  let reviewed = 0;
  let rewritten = 0;
  let approved = 0;
  let averageScore = 0;

  for (const item of items) {
    if (!item.lead) continue;
    reviewed += 1;
    const copy = improveOfferCopy({
      subject: item.subject,
      body: item.body,
      lead: {
        name: item.lead.name,
        companyName: item.lead.companyName,
        niche: item.lead.niche,
        source: item.lead.source,
        nextAction: item.lead.nextAction,
        score: item.lead.score,
        value: item.lead.value,
      },
      mode: "rewrite",
    });
    averageScore += copy.scorecard.total;
    if (copy.repaired || copy.subject !== item.subject || copy.body !== item.body) {
      rewritten += 1;
      await prisma.outreachQueueItem.update({
        where: { id: item.id },
        data: {
          subject: sanitizeSubject(copy.subject),
          body: sanitizeCustomerMessage(copy.body, { channel: "email" }),
          reason: sanitizeInternalReason(`Vega Copy Chief reviewed and improved this draft. ${copy.reason}`),
        },
      });
    } else {
      approved += 1;
      await prisma.outreachQueueItem.update({
        where: { id: item.id },
        data: {
          reason: sanitizeInternalReason(`Vega Copy Chief approved this draft. ${copy.reason}`),
        },
      });
    }
  }

  const score = reviewed ? Math.round(averageScore / reviewed) : 0;
  await createAutomationEvent({
    title: "Vega Copy Chief sweep",
    detail: `Reviewed ${reviewed} pending email drafts. Rewrote ${rewritten}; approved ${approved}; average score ${score}.`,
    status: reviewed ? "done" : "blocked",
    type: "agent",
    payload: { reviewed, rewritten, approved, averageScore: score },
  });

  return {
    kind: "copy-chief",
    title: "Copy Chief Agent",
    status: reviewed ? "done" : "blocked",
    summary: reviewed
      ? `Reviewed ${reviewed} drafts. Rewrote ${rewritten}; average offer-copy score ${score}.`
      : "No pending email drafts are waiting for copy QA.",
    metrics: { reviewed, rewritten, approved, averageScore: score },
    nextMove: reviewed ? "Approve the best reviewed drafts, then watch reply quality by niche." : "Source more email-ready leads before running copy QA again.",
  };
}

export async function runCadenceOrchestrator(input: { limit?: number } = {}): Promise<SpecialistResult> {
  const workspace = await getDefaultWorkspace();
  const capacity = await getOperatorQueueCapacity(workspace.id);
  const result = await runDueSequenceSteps({ limit: input.limit || 8 });
  await createAutomationEvent({
    title: "Vega Cadence Orchestrator sweep",
    detail: `Queued ${result.queued} due follow-up steps, skipped ${result.skipped}. Capacity ${capacity.capacity}.`,
    status: result.queued ? "done" : result.blocked ? "blocked" : "needs_review",
    type: "sequence",
    payload: { result, capacity },
  });

  return {
    kind: "cadence",
    title: "Cadence Orchestrator",
    status: result.queued ? "done" : result.blocked ? "blocked" : "needs_review",
    summary: `Queued ${result.queued} due follow-up steps and skipped ${result.skipped}.`,
    metrics: { queued: result.queued, skipped: result.skipped, senderCapacity: capacity.capacity, executiveReview: capacity.usage.executiveReviewPending },
    nextMove: result.blocked
      ? capacity.blockedReasons.join(" ") || "Cadence is blocked by sender capacity."
      : "Let Vega send safe follow-ups and reserve review time for exception accounts.",
  };
}

export async function runIntentFeedAgent(input: { limit?: number; enrich?: boolean } = {}): Promise<SpecialistResult> {
  const result = await runIntentFeedScout({
    limit: input.limit || 15,
    enrich: input.enrich !== false,
  });
  const top = result.items[0];
  const emailReady = result.items.filter((item) => item.contactability === "email").length;
  const manualReady = result.items.filter((item) => item.contactability === "phone" || item.contactability === "website").length;
  const linkedinSignals = result.items.filter((item) => item.signalType === "linkedin-social").length;
  return {
    kind: "intent-feed",
    title: "Intent Signal Feed Agent",
    status: result.items.length ? "done" : "blocked",
    summary: result.items.length
      ? `Ranked ${result.items.length} warm-signal leads. Top account: ${top?.companyName || "none"} at ${top?.signalScore || 0}.`
      : "No active leads were available for intent ranking.",
    metrics: {
      ranked: result.items.length,
      emailReady,
      manualReady,
      linkedinSignals,
      perplexity: result.perplexity.configured,
    },
    nextMove: top
      ? `${top.companyName}: ${top.nextMove} Signal: ${top.signalSummary.slice(0, 160)}`
      : "Source fresh leads, then refresh the intent feed.",
  };
}

export async function runLinkedInTaskAgent(input: { limit?: number } = {}): Promise<SpecialistResult> {
  const result = await runLinkedInTaskLane({ limit: input.limit || 10 });
  return {
    kind: "linkedin-tasks",
    title: "LinkedIn Task Agent",
    status: result.queued ? "done" : result.reviewed ? "needs_review" : "blocked",
    summary: result.message,
    metrics: {
      reviewed: result.reviewed,
      queued: result.queued,
      alreadyPending: result.alreadyPending,
      skipped: result.skipped,
    },
    nextMove: result.queued
      ? "Work the LinkedIn task cards manually from the Queue board, then record replies for Vega."
      : "Paste more Sales Navigator rows or run the intent feed to surface social-fit accounts.",
  };
}

export async function runLinkedInContentAgent(input: { limit?: number } = {}): Promise<SpecialistResult> {
  const result = await runLinkedInContentSignalAgent({ limit: input.limit || 10, queue: true });
  return {
    kind: "linkedin-content",
    title: "Echo-to-Vega Content Signal Agent",
    status: result.queued || result.matched ? "done" : result.reviewed ? "needs_review" : "blocked",
    summary: result.message,
    metrics: {
      reviewed: result.reviewed,
      matched: result.matched,
      queued: result.queued,
      alreadyQueued: result.alreadyQueued,
    },
    nextMove: result.queued
      ? "Work the LinkedIn content-signal tasks manually, then record any replies so Vega can classify and book."
      : "Have Echo hand Vega post reactors, commenters, impressions, or click rows so Vega can rank content-sourced prospects.",
  };
}

export async function runLinkedInEventsAgent(input: { limit?: number } = {}): Promise<SpecialistResult> {
  const result = await listLinkedInEvents({ count: input.limit || 10, leadGenOnly: false });
  const leadGen = result.ok ? await listLinkedInEvents({ count: input.limit || 10, leadGenOnly: true }).catch(() => null) : null;
  return {
    kind: "linkedin-events",
    title: "LinkedIn Events Agent",
    status: result.ok ? "done" : "blocked",
    summary: result.ok
      ? `Checked LinkedIn Events Management. Found ${result.events.length} organizer events and ${leadGen?.events.length || 0} lead-gen-enabled events.`
      : result.message,
    metrics: {
      events: result.events.length,
      leadGenEvents: leadGen?.events.length || 0,
      eventsReady: result.status.ready.eventsManagement,
      leadSyncReady: result.status.ready.leadSync,
    },
    nextMove: result.ok
      ? "Use event topics and attendees/forms as intent context; keep Lead Sync pending until LinkedIn approves it."
      : result.status.nextSteps.join(" ") || "Finish LinkedIn token and organization configuration.",
  };
}

export async function runWaitlistReviewAgent(input: { limit?: number } = {}): Promise<SpecialistResult> {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(25, Math.max(1, Number(input.limit || 10)));
  const contestants = await prisma.lead.findMany({
    where: { workspaceId: workspace.id, source: "vega-waitlist", status: "active" },
    orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
    take: limit,
    include: { contact: true, interactions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  let flaggedIncomplete = 0;
  let suspicious = 0;
  let highPriority = 0;
  const top = contestants.slice(0, 5).map((lead) => {
    const fields = lead.customFields && typeof lead.customFields === "object" && !Array.isArray(lead.customFields)
      ? lead.customFields as Record<string, unknown>
      : {};
    const missing = [lead.contact?.phone ? "" : "phone", fields.companyWebsite ? "" : "website"].filter(Boolean);
    if (lead.score >= 80) highPriority += 1;
    if (lead.score >= 80 && missing.length) flaggedIncomplete += 1;
    if (!lead.contact?.email || lead.contact.email.includes("+")) suspicious += 1;
    return `${lead.name} at ${lead.companyName} (${lead.score}, ${fields.qualificationSegment || lead.priority || "waitlist"})`;
  });

  const nextMove = highPriority
    ? "Personally review the top founding design partner candidates before any product-update nurture."
    : contestants.length
      ? "Review private beta candidates and keep lower-score contestants in Vega product update nurture."
      : "No Vega waitlist contestants are ready for review yet.";

  await createAutomationEvent({
    title: "Vega Waitlist Specialist review",
    detail: contestants.length ? `Reviewed ${contestants.length} waitlist contestants. Top: ${top.join("; ")}` : "No active Vega waitlist contestants found.",
    status: contestants.length ? "done" : "blocked",
    type: "agent",
    payload: { reviewed: contestants.length, highPriority, flaggedIncomplete, suspicious, top },
  });

  return {
    kind: "waitlist",
    title: "Waitlist Specialist",
    status: contestants.length ? "done" : "blocked",
    summary: contestants.length
      ? `Reviewed ${contestants.length} Vega waitlist contestants. High priority ${highPriority}; incomplete high-value records ${flaggedIncomplete}; suspicious ${suspicious}.`
      : "No Vega waitlist contestants are waiting yet.",
    metrics: { reviewed: contestants.length, highPriority, flaggedIncomplete, suspicious, top: top.join(" | ") || "none" },
    nextMove,
  };
}

export async function runLearningLoopAgent(input: { limit?: number } = {}): Promise<SpecialistResult> {
  const result = await runAdaptiveLearningLoop({ activate: true, limit: input.limit || 3 });
  const topSource = result.learning.sources[0];
  const topSignal = result.learning.signals[0];
  return {
    kind: "learning-loop",
    title: "Adaptive Learning Agent",
    status: "done",
    summary: `Tuned source plays from live outcomes. GojiBerry gap estimate now ${result.learning.summary.gojiBerryCloseness}.`,
    metrics: {
      replyRate: `${result.learning.summary.overallReplyRate}%`,
      senderHealth: result.learning.summary.senderHealth,
      bounceRate: `${result.learning.summary.bounceRate}%`,
      socialCoverage: `${result.learning.summary.socialSignalCoverage}%`,
      recommendedPlays: result.recommendedPlayIds.length,
      created: result.created.length,
      refreshed: result.refreshed.length,
      topSource: topSource?.key || "none",
      topSignal: topSignal?.key || "none",
    },
    nextMove: result.learning.nextActions[0] || result.message,
  };
}

export async function runSocialIntentAgent(input: { limit?: number } = {}): Promise<SpecialistResult> {
  const result = await runSocialIntentScout({
    limit: input.limit || 15,
    commit: true,
    autoQueue: true,
    autoSend: false,
  });
  const skipped = Object.entries(result.skipped)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(", ");
  return {
    kind: "social-intent",
    title: "Social Intent Scout",
    status: result.imported || result.queued || result.qualified.length ? "done" : "blocked",
    summary: `Ran ${result.runs.length} social/competitor plays. Qualified ${result.qualified.length}, imported ${result.imported}, queued ${result.queued}.`,
    metrics: {
      qualified: result.qualified.length,
      imported: result.imported,
      queued: result.queued,
      skipped: skipped || "none",
    },
    nextMove: result.queued
      ? "Review the newly queued social-intent drafts, then approve a small batch and watch replies."
      : "If skipped records are mostly duplicates or missing contact paths, run LinkedIn tasks and contact-path enrichment next.",
  };
}

export async function runVegaSpecialist(kind: VegaSpecialistKind, input: { limit?: number } = {}) {
  if (kind === "contact-path") return runContactPathAgent(input);
  if (kind === "booking") return runBookingConciergeAgent(input);
  if (kind === "deliverability") return runDeliverabilityGovernor(input);
  if (kind === "copy-chief") return runCopyChiefAgent(input);
  if (kind === "cadence") return runCadenceOrchestrator(input);
  if (kind === "intent-feed") return runIntentFeedAgent({ ...input, enrich: true });
  if (kind === "learning-loop") return runLearningLoopAgent(input);
  if (kind === "social-intent") return runSocialIntentAgent(input);
  if (kind === "linkedin-content") return runLinkedInContentAgent(input);
  if (kind === "linkedin-events") return runLinkedInEventsAgent(input);
  if (kind === "linkedin-tasks") return runLinkedInTaskAgent(input);
  if (kind === "waitlist") return runWaitlistReviewAgent(input);
  return runVegaSpecialistTeam(input);
}

export async function runVegaSpecialistTeam(input: { limit?: number } = {}) {
  const [learning, intent, linkedin, linkedinContent, copy, cadence, replies, booking, contact, deliverability] = await Promise.all([
    computeConversionLearning(),
    runIntentFeedAgent({ limit: 10, enrich: false }),
    runLinkedInTaskAgent({ limit: 5 }),
    runLinkedInContentAgent({ limit: 5 }),
    runCopyChiefAgent({ limit: input.limit || 10 }),
    runCadenceOrchestrator({ limit: input.limit || 8 }),
    runReplyConversionSweep({ limit: input.limit || 10, lookbackHours: 168 }),
    runBookingConciergeAgent({ limit: input.limit || 10 }),
    runContactPathAgent({ limit: input.limit || 10 }),
    runDeliverabilityGovernor({ limit: 50 }),
  ]);

  const queued = cadence.metrics.queued as number;
  const responseDrafts = replies.queued;
  const bookingReady = booking.metrics.ready as number;
  const status = queued || responseDrafts || bookingReady || copy.metrics.reviewed ? "done" : "needs_review";
  const summary = [
    `Copy reviewed ${copy.metrics.reviewed}.`,
    `Cadence queued ${queued}.`,
    `Reply drafts queued ${responseDrafts}.`,
    `Booking ready ${bookingReady}.`,
    `Intent leads ranked ${intent.metrics.ranked}.`,
    `LinkedIn tasks queued ${linkedin.metrics.queued}.`,
    `LinkedIn content tasks queued ${linkedinContent.metrics.queued}.`,
    `Learning closeness ${learning.summary.gojiBerryCloseness}.`,
    `Manual paths refreshed ${contact.metrics.refreshed}.`,
    `Risky emails rejected ${deliverability.metrics.pendingRejected}.`,
  ].join(" ");

  await createAutomationEvent({
    title: "Vega specialist team sweep",
    detail: summary,
    status,
    type: "agent",
    payload: { learning, intent, linkedin, linkedinContent, copy, cadence, replies, booking, contact, deliverability },
  });

  return {
    kind: "full-team" as const,
    title: "Vega Specialist Team",
    status,
    summary,
    metrics: {
      copyReviewed: copy.metrics.reviewed as number,
      cadenceQueued: queued,
      replyDrafts: responseDrafts,
      bookingReady,
      gojiBerryCloseness: learning.summary.gojiBerryCloseness,
      intentRanked: intent.metrics.ranked as number,
      linkedinQueued: linkedin.metrics.queued as number,
      linkedinContentQueued: linkedinContent.metrics.queued as number,
      recommendedPlays: learning.summary.recommendedPlayIds.join(", "),
      manualRefreshed: contact.metrics.refreshed as number,
      riskyRejected: deliverability.metrics.pendingRejected as number,
    },
    nextMove: bookingReady
      ? "Work booking-ready leads first, then approve reviewed drafts."
      : "Approve reviewed drafts, run a focused source sprint, and keep reply sweeps active.",
    specialists: { learning, intent, linkedin, linkedinContent, copy, cadence, replies, booking, contact, deliverability },
  };
}

export function classifyVegaSpecialistRequest(text: string): VegaSpecialistKind | null {
  const normalized = clean(text).toLowerCase();
  if (!normalized) return null;
  if (/\b(?:full team|specialists?|all agents|run team|bring vega online|work everything)\b/.test(normalized)) return "full-team";
  if (/\b(?:contact path|manual path|manual tasks?|find emails?|enrich contacts?|phone website)\b/.test(normalized)) return "contact-path";
  if (/\b(?:push bookings?|booking concierge|booked calls?|calendar handoff|appointment)\b/.test(normalized)) return "booking";
  if (/\b(?:deliverability|bounces?|suppress|reputation|failed sends?|protect sending)\b/.test(normalized)) return "deliverability";
  if (/\b(?:copy chief|rewrite|copy qa|improve emails?|offer copy|hormozi|nepq|chatgpt copy|chatgpt rewrite|email wording|dm wording|fb dm|facebook dm|linkedin dm)\b/.test(normalized)) return "copy-chief";
  if (/\b(?:cadence|sequence|due follow[-\s]?ups?|follow[-\s]?up queue|next touches)\b/.test(normalized)) return "cadence";
  if (/\b(?:intent feed|signal feed|warm signals?|perplexity|web intel|sonar|research feed)\b/.test(normalized)) return "intent-feed";
  if (/\b(?:learning loop|self[-\s]?tune|adaptive learning|optimi[sz]e sources?|source learning|campaign learning|what'?s working|gojiberry gap)\b/.test(normalized)) return "learning-loop";
  if (/\b(?:social intent|competitor signals?|competitor engagement|scout social|social scout|linkedin signals?|social signals?)\b/.test(normalized)) return "social-intent";
  if (/\b(?:echo handoff|echo signals?|linkedin content|post impressions?|post engagement|content signals?|reactors?|commenters?|pressmaster|impressions? leads?)\b/.test(normalized)) return "linkedin-content";
  if (/\b(?:linkedin events?|event management|events api|lead gen events?)\b/.test(normalized)) return "linkedin-events";
  if (/\b(?:linkedin tasks?|sales nav tasks?|linkedin lane|sales navigator tasks?|social dm|linkedin dm|linkedin dms|inmail|inmails|connection requests?)\b/.test(normalized)) return "linkedin-tasks";
  if (/\b(?:waitlist|early access|beta candidates?|contestants?|design partners?)\b/.test(normalized)) return "waitlist";
  return null;
}

export function specialistSlackSummary(result: Awaited<ReturnType<typeof runVegaSpecialist>>) {
  const metrics = Object.entries(result.metrics)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
  return `${result.title}: ${result.summary}${metrics ? ` Metrics: ${metrics}.` : ""} Next: ${result.nextMove}`;
}

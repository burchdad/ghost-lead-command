import { NextBestChannel, Prisma, SocialSignalTier } from "@prisma/client";
import { createAutomationEvent } from "@/lib/automation";
import { sanitizeCustomerMessage, sanitizeInternalReason, sanitizeSubject } from "@/lib/message-sanitizer";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export type LinkedInEngagementRow = {
  postUrl?: string;
  postTitle?: string;
  postImpressions?: number;
  postClicks?: number;
  postReactions?: number;
  postComments?: number;
  engagementType?: string;
  engagerName?: string;
  engagerTitle?: string;
  engagerCompany?: string;
  engagerProfileUrl?: string;
  sourceUrl?: string;
  raw?: Record<string, unknown>;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function slug(value: string) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function engagementScore(row: LinkedInEngagementRow) {
  const type = clean(row.engagementType).toLowerCase();
  const title = clean(row.engagerTitle).toLowerCase();
  const company = clean(row.engagerCompany);
  const profile = clean(row.engagerProfileUrl);
  let score = 20;
  if (/comment|reply/.test(type)) score += 35;
  if (/share|repost/.test(type)) score += 30;
  if (/reaction|like|celebrate|support|insightful|curious/.test(type)) score += 18;
  if (profile) score += 10;
  if (company) score += 12;
  if (/founder|owner|ceo|president|principal|partner/.test(title)) score += 20;
  if (/growth|sales|revenue|marketing|operations|manager|director|vp/.test(title)) score += 14;
  score += Math.min(10, Math.floor(numberValue(row.postClicks) / 10));
  score += Math.min(8, Math.floor(numberValue(row.postComments) / 2));
  score += Math.min(6, Math.floor(numberValue(row.postReactions) / 10));
  return Math.max(0, Math.min(100, score));
}

function tierForScore(score: number) {
  if (score >= 85) return SocialSignalTier.VERY_HIGH;
  if (score >= 70) return SocialSignalTier.HIGH;
  if (score >= 55) return SocialSignalTier.MEDIUM;
  return SocialSignalTier.LOW;
}

function taskBody(row: LinkedInEngagementRow, score: number) {
  const name = clean(row.engagerName) || "there";
  const first = name.split(/\s+/)[0] || "there";
  const company = clean(row.engagerCompany) || "their company";
  const post = clean(row.postTitle) || "your LinkedIn post";
  const type = clean(row.engagementType) || "engaged";
  return sanitizeCustomerMessage(
    [
      `LinkedIn content-signal task for ${name} at ${company}.`,
      `Signal score: ${score}. Engagement: ${type}. Source post: ${post}.`,
      clean(row.engagerProfileUrl) ? `Profile: ${row.engagerProfileUrl}` : "",
      clean(row.sourceUrl || row.postUrl) ? `Source: ${row.sourceUrl || row.postUrl}` : "",
      "",
      "Connection note / InMail opener:",
      `${first}, noticed you engaged around ${post}. I am mapping teams where warm social signals can turn into real booked conversations instead of getting lost after the post. Worth connecting?`,
      "",
      "Follow-up after accepted:",
      `${first}, quick context: Vega tracks post engagement, enriches the right accounts, and routes the best ones into email, phone, or booking follow-up. If ${company} is trying to turn attention into appointments, I can show the workflow I would run.`,
      "",
      "Operator move: send manually through Sales Navigator, LinkedIn DM, or InMail. Record any reply in Lead Command so Vega can classify, follow up, and book.",
    ].filter(Boolean).join("\n"),
    { channel: "manual" },
  );
}

function rowPayload(row: LinkedInEngagementRow): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(row.raw || row)) as Prisma.InputJsonValue;
}

async function ensurePostWatch(row: LinkedInEngagementRow) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const postUrl = clean(row.postUrl || row.sourceUrl) || `manual-linkedin-post:${slug(row.postTitle || "untitled")}`;
  return prisma.socialPostWatch.upsert({
    where: {
      workspaceId_platform_postUrl: {
        workspaceId: workspace.id,
        platform: "linkedin",
        postUrl,
      },
    },
    update: {
      watchReason: sanitizeInternalReason(
        `Content signal watch refreshed. Impressions ${numberValue(row.postImpressions)}, clicks ${numberValue(row.postClicks)}, comments ${numberValue(row.postComments)}.`,
      ) || "LinkedIn content signal watch refreshed.",
      active: true,
    },
    create: {
      workspaceId: workspace.id,
      platform: "linkedin",
      postUrl,
      watchReason: sanitizeInternalReason(
        `Track LinkedIn post engagement as a warm lead source. Impressions ${numberValue(row.postImpressions)}, clicks ${numberValue(row.postClicks)}, comments ${numberValue(row.postComments)}.`,
      ) || "Track LinkedIn post engagement as a warm lead source.",
      createdBy: "vega-content-signal-agent",
    },
  });
}

export async function ingestLinkedInEngagementRows(rows: LinkedInEngagementRow[]) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const post = await ensurePostWatch(row);
    const idempotencyKey = [
      "linkedin-content",
      post.id,
      slug(row.engagementType || "engagement"),
      slug(row.engagerProfileUrl || row.engagerName || row.engagerCompany || "unknown"),
    ].join(":");
    const existing = await prisma.socialEngagementEvent.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: workspace.id,
          idempotencyKey,
        },
      },
      select: { id: true },
    });
    await prisma.socialEngagementEvent.upsert({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId: workspace.id,
          idempotencyKey,
        },
      },
      update: {
        engagementType: clean(row.engagementType) || "engagement",
        engagerName: clean(row.engagerName) || null,
        engagerTitle: clean(row.engagerTitle) || null,
        engagerCompany: clean(row.engagerCompany) || null,
        engagerProfileUrl: clean(row.engagerProfileUrl) || null,
        sourceUrl: clean(row.sourceUrl || row.postUrl) || null,
        rawPayload: rowPayload(row),
      },
      create: {
        workspaceId: workspace.id,
        postWatchId: post.id,
        platform: "linkedin",
        engagementType: clean(row.engagementType) || "engagement",
        engagerName: clean(row.engagerName) || null,
        engagerTitle: clean(row.engagerTitle) || null,
        engagerCompany: clean(row.engagerCompany) || null,
        engagerProfileUrl: clean(row.engagerProfileUrl) || null,
        sourceUrl: clean(row.sourceUrl || row.postUrl) || null,
        rawPayload: rowPayload(row),
        idempotencyKey,
      },
    });
    if (existing) updated += 1;
    else imported += 1;
  }

  await createAutomationEvent({
    title: "LinkedIn content signal rows ingested",
    detail: `Imported ${imported}, updated ${updated}, received ${rows.length} LinkedIn content-signal rows.`,
    status: rows.length ? "done" : "blocked",
    type: "linkedin",
    payload: { imported, updated, received: rows.length },
  });

  return { imported, updated, received: rows.length };
}

export async function runLinkedInContentSignalAgent(input: { limit?: number; queue?: boolean } = {}) {
  const prisma = getPrisma();
  const workspace = await getDefaultWorkspace();
  const limit = Math.min(25, Math.max(1, Number(input.limit || 10)));
  const queue = input.queue !== false;
  const events = await prisma.socialEngagementEvent.findMany({
    where: { workspaceId: workspace.id, platform: "linkedin" },
    orderBy: { observedAt: "desc" },
    take: Math.max(100, limit * 6),
    include: { matches: true, postWatch: true },
  });

  let reviewed = 0;
  let matched = 0;
  let queued = 0;
  let alreadyQueued = 0;
  const top: { name: string; company: string; score: number; action: string }[] = [];

  for (const event of events) {
    if (queued >= limit) break;
    const row: LinkedInEngagementRow = {
      postUrl: event.postWatch?.postUrl || event.sourceUrl || "",
      postTitle: event.postWatch?.watchReason || "LinkedIn content",
      engagementType: event.engagementType,
      engagerName: event.engagerName || "",
      engagerTitle: event.engagerTitle || "",
      engagerCompany: event.engagerCompany || "",
      engagerProfileUrl: event.engagerProfileUrl || "",
      sourceUrl: event.sourceUrl || "",
      raw: event.rawPayload && typeof event.rawPayload === "object" && !Array.isArray(event.rawPayload)
        ? event.rawPayload as Record<string, unknown>
        : undefined,
    };
    const score = engagementScore(row);
    reviewed += 1;
    if (score < 55) continue;
    matched += 1;

    await prisma.socialSignalMatch.upsert({
      where: { id: event.matches[0]?.id || `missing-${event.id}` },
      update: {
        tier: tierForScore(score),
        icpMatched: score >= 55,
        recommendedAction: NextBestChannel.LINKEDIN_MANUAL_TASK,
        scoreImpact: score,
        reasons: [
          `${event.engagementType || "engagement"} on tracked LinkedIn content`,
          event.engagerTitle ? `role: ${event.engagerTitle}` : "role unknown",
          event.engagerCompany ? `company: ${event.engagerCompany}` : "company unknown",
        ],
      },
      create: {
        workspaceId: workspace.id,
        eventId: event.id,
        tier: tierForScore(score),
        icpMatched: score >= 55,
        recommendedAction: NextBestChannel.LINKEDIN_MANUAL_TASK,
        scoreImpact: score,
        reasons: [
          `${event.engagementType || "engagement"} on tracked LinkedIn content`,
          event.engagerTitle ? `role: ${event.engagerTitle}` : "role unknown",
          event.engagerCompany ? `company: ${event.engagerCompany}` : "company unknown",
        ],
      },
    });

    if (!queue) continue;
    const name = clean(event.engagerName) || "LinkedIn engager";
    const company = clean(event.engagerCompany) || "unknown company";
    const subject = sanitizeSubject(`LinkedIn content signal: ${name} at ${company}`);
    const existing = await prisma.outreachQueueItem.findFirst({
      where: {
        workspaceId: workspace.id,
        channel: "linkedin",
        provider: "linkedin-content-signal-manual",
        subject,
        status: { in: ["pending", "queued", "sent"] },
      },
    });
    if (existing) {
      alreadyQueued += 1;
      continue;
    }
    await prisma.outreachQueueItem.create({
      data: {
        workspaceId: workspace.id,
        channel: "linkedin",
        provider: "linkedin-content-signal-manual",
        subject,
        body: taskBody(row, score),
        status: "pending",
        scheduledFor: new Date(),
        reason: sanitizeInternalReason("Vega queued this because a tracked LinkedIn content engagement created a warm social signal."),
      },
    });
    queued += 1;
    top.push({ name, company, score, action: "Manual Sales Navigator, DM, or InMail task queued." });
  }

  await createAutomationEvent({
    title: "Vega LinkedIn Content Signal Agent sweep",
    detail: `Reviewed ${reviewed} LinkedIn engagements, matched ${matched}, queued ${queued} manual LinkedIn tasks.`,
    status: matched ? "done" : reviewed ? "needs_review" : "blocked",
    type: "linkedin",
    payload: { reviewed, matched, queued, alreadyQueued, top },
  });

  return {
    ok: true,
    reviewed,
    matched,
    queued,
    alreadyQueued,
    top,
    message: queued
      ? `Queued ${queued} LinkedIn content-signal tasks from post engagement.`
      : matched
        ? `Matched ${matched} LinkedIn content signals; ${alreadyQueued} already had tasks.`
        : "No LinkedIn post/impression engagement signals are ready yet.",
  };
}

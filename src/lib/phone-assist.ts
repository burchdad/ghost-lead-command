import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export const PHONE_ASSIST_PROVIDERS = ["phone-after-email", "phone-website"] as const;

export const PHONE_ASSIST_ACTIVE_STATUSES = [
  "pending",
  "call_no_answer",
  "voicemail_left",
  "gatekeeper",
  "callback_requested",
  "interested",
  "info_requested",
  "send_information",
  "meeting_requested",
] as const;

export const PHONE_ASSIST_COMPLETED_STATUSES = [
  "called",
  "call_no_answer",
  "voicemail_left",
  "gatekeeper",
  "wrong_person",
  "callback_requested",
  "interested",
  "info_requested",
  "send_information",
  "meeting_requested",
  "meeting_booked",
  "not_interested",
  "suppressed",
] as const;

export const PHONE_ASSIST_CLOSED_STATUSES = [
  "meeting_booked",
  "not_interested",
  "suppressed",
  "wrong_person",
  "rejected",
  "failed",
] as const;

type PhoneAssistItemBase = {
  id: string;
  provider: string;
  channel: string;
  status: string;
  body: string;
  scheduledFor: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PhoneAssistItem = Prisma.OutreachQueueItemGetPayload<{
  include: { lead: { include: { contact: true; company: true } } };
}>;

export type PhoneAssistClassification<T extends PhoneAssistItemBase = PhoneAssistItemBase> = {
  all: T[];
  created: T[];
  active: T[];
  actionable: T[];
  scheduledLater: T[];
  dueNow: T[];
  overdue: T[];
  callbackDue: T[];
  interestedFollowUp: T[];
  completed: T[];
  closed: T[];
  missingDueTime: T[];
  excludedByStatus: T[];
  excludedByCampaign: T[];
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function inRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function hasPhoneAssistProvider(item: PhoneAssistItemBase) {
  return item.channel === "manual" && PHONE_ASSIST_PROVIDERS.includes(item.provider as (typeof PHONE_ASSIST_PROVIDERS)[number]);
}

function uniqueById<T extends PhoneAssistItemBase>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function classifyPhoneAssistTasks<T extends PhoneAssistItemBase>(
  items: T[],
  input: { now?: Date; createdStart?: Date; createdEnd?: Date; campaignName?: string } = {},
): PhoneAssistClassification<T> {
  const now = input.now || new Date();
  const todayStart = startOfDay(now);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const createdStart = input.createdStart || todayStart;
  const createdEnd = input.createdEnd || todayEnd;
  const campaignPattern = input.campaignName ? new RegExp(input.campaignName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

  const all = items.filter(hasPhoneAssistProvider);
  const created = all.filter((item) => inRange(item.createdAt, createdStart, createdEnd));
  const excludedByCampaign = campaignPattern ? all.filter((item) => !campaignPattern.test(item.body)) : [];
  const scoped = campaignPattern ? all.filter((item) => campaignPattern.test(item.body)) : all;
  const closed = scoped.filter((item) => PHONE_ASSIST_CLOSED_STATUSES.includes(item.status as (typeof PHONE_ASSIST_CLOSED_STATUSES)[number]));
  const active = scoped.filter((item) => PHONE_ASSIST_ACTIVE_STATUSES.includes(item.status as (typeof PHONE_ASSIST_ACTIVE_STATUSES)[number]));
  const missingDueTime = active.filter((item) => !item.scheduledFor);
  const scheduledLater = active.filter((item) => item.scheduledFor && item.scheduledFor > now);
  const dueNow = active.filter((item) => item.scheduledFor && item.scheduledFor <= now);
  const overdue = active.filter((item) => item.scheduledFor && item.scheduledFor < now);
  const callbackDue = active.filter((item) => item.status === "callback_requested" && (!item.scheduledFor || item.scheduledFor <= now));
  const interestedFollowUp = active.filter((item) => ["interested", "info_requested", "send_information", "meeting_requested"].includes(item.status));
  const completed = scoped.filter((item) => PHONE_ASSIST_COMPLETED_STATUSES.includes(item.status as (typeof PHONE_ASSIST_COMPLETED_STATUSES)[number]));
  const excludedByStatus = scoped.filter((item) => !active.includes(item) && !closed.includes(item) && !completed.includes(item));
  const actionable = uniqueById([...dueNow, ...callbackDue, ...interestedFollowUp, ...missingDueTime]);

  return {
    all: scoped,
    created,
    active,
    actionable,
    scheduledLater,
    dueNow,
    overdue,
    callbackDue,
    interestedFollowUp,
    completed,
    closed,
    missingDueTime,
    excludedByStatus,
    excludedByCampaign,
  };
}

export async function repairMissingPhoneAssistSchedules(input: {
  workspaceId: string;
  now?: Date;
  delayHours?: number;
}) {
  const prisma = getPrisma();
  const delayHours = Math.min(24, Math.max(1, Math.round(Number(input.delayHours || process.env.VEGA_PHONE_FOLLOWUP_DELAY_HOURS || 3))));
  const pendingMissing = await prisma.outreachQueueItem.findMany({
    where: {
      workspaceId: input.workspaceId,
      channel: "manual",
      provider: { in: [...PHONE_ASSIST_PROVIDERS] },
      status: { in: [...PHONE_ASSIST_ACTIVE_STATUSES] },
      scheduledFor: null,
    },
    select: { id: true, createdAt: true },
    take: 100,
  });

  for (const task of pendingMissing) {
    const scheduledFor = new Date(task.createdAt.getTime() + delayHours * 60 * 60 * 1000);
    await prisma.outreachQueueItem.update({
      where: { id: task.id },
      data: {
        scheduledFor,
        reason: `Vega repaired missing phone-assist schedule using createdAt + ${delayHours}h.`,
      },
    });
  }

  return { repaired: pendingMissing.length };
}

export async function getActionablePhoneTasks(input: {
  workspaceId: string;
  now?: Date;
  limit?: number;
  createdStart?: Date;
  createdEnd?: Date;
}): Promise<PhoneAssistClassification<PhoneAssistItem>> {
  const prisma = getPrisma();
  const items = await prisma.outreachQueueItem.findMany({
    where: {
      workspaceId: input.workspaceId,
      channel: "manual",
      provider: { in: [...PHONE_ASSIST_PROVIDERS] },
    },
    include: { lead: { include: { contact: true, company: true } } },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: input.limit || 1000,
  });

  return classifyPhoneAssistTasks(items, {
    now: input.now,
    createdStart: input.createdStart,
    createdEnd: input.createdEnd,
  });
}

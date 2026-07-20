"use client";

import {
  ArrowRight,
  Bot,
  Brain,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  DatabaseZap,
  FileText,
  Flame,
  Gauge,
  Inbox,
  Layers3,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  PhoneCall,
  PlayCircle,
  Radar,
  Rocket,
  Send,
  Sparkles,
  Target,
  Upload,
  WalletCards,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Stage =
  | "Imported"
  | "Contacted"
  | "Networking Contact"
  | "Potential Client"
  | "Referral Partner"
  | "Vendor"
  | "Friend of Business"
  | "Replied"
  | "Call Booked"
  | "Proposal Sent"
  | "Won";

type Lead = {
  id?: string;
  opportunityId?: string;
  name: string;
  company: string;
  niche: string;
  stage: Stage;
  score: number;
  value: number;
  source: string;
  lastTouch: string;
  next: string;
  interactions?: Interaction[];
};

type Interaction = {
  id: string;
  channel: string;
  direction: string;
  body: string;
  classification?: string | null;
  createdAt: string;
};

type AgentTemplate = {
  id?: string;
  name: string;
  source: string;
  use: string;
  price: string;
};

type PromptTemplate = {
  id?: string;
  title?: string;
  body: string;
  category?: string;
};

type ImportPreview = {
  name: string;
  companyName: string;
  email: string;
  phone: string;
  niche: string;
  source: string;
  score: number;
};

type OutreachStatus = {
  mode: "live" | "dry-run";
  smsProvider: "telnyx" | "twilio";
  sendgridConfigured: boolean;
  telnyxConfigured: boolean;
  twilioConfigured: boolean;
};

type SourceLead = {
  id: string;
  name: string;
  companyName: string;
  title: string;
  email: string;
  phone: string;
  niche: string;
  location: string;
  source: string;
  website?: string;
  sourceUrl?: string;
  score: number;
  confidence: string;
  buyerFit: string;
  intentSignals?: string[];
  signalSummary?: string;
};

type SourcingStatus = {
  pdlConfigured: boolean;
  ghostLeadAgentConfigured: boolean;
  googleMapsConfigured: boolean;
  mockSourceEnabled: boolean;
  maxPreviewSize: number;
};

type SourceCampaign = {
  id: string;
  name: string;
  provider: "pdl" | "ghost-lead-agent" | "google-maps";
  query: string;
  location?: string | null;
  industries?: string | null;
  titles?: string | null;
  dailyLimit: number;
  scoreThreshold: number;
  status: string;
  lastRunAt?: string | null;
};

type QueueItem = {
  id: string;
  channel: string;
  provider: string;
  subject?: string | null;
  body: string;
  status: string;
  reason?: string | null;
  createdAt: string;
  lead?: (Partial<Lead> & { companyName?: string }) | null;
};

type ReplyItem = {
  id: string;
  channel: string;
  from: string;
  body: string;
  classification: string;
  source: string;
  createdAt: string;
  lead?: Lead | null;
};

type SuppressionItem = {
  id: string;
  type: string;
  value: string;
  reason: string;
  source: string;
  createdAt: string;
};

type AnalyticsPayload = {
  totals: {
    leads: number;
    sent: number;
    replies: number;
    hotReplies: number;
    proposals: number;
    pipeline: number;
    won: number;
    replyRate: number;
    hotRate: number;
  };
  sourceBreakdown: Record<string, number>;
  nicheAttribution?: Record<string, { leads: number; queued: number; replies: number; booked: number; pipeline: number }>;
  funnel?: Record<string, number>;
  suppressedOrFailed?: number;
  queueByStatus: Record<string, number>;
  repliesByClass: Record<string, number>;
  sourceScorecard?: {
    summary: {
      sources: number;
      scaleReady: number;
      needsFix: number;
      topSource: string;
      weakestSource: string;
      recommendation: string;
    };
    rows: {
      source: string;
      leads: number;
      pending: number;
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      failed: number;
      replies: number;
      hotReplies: number;
      booked: number;
      pipeline: number;
      deliveryRate: number;
      openRate: number;
      clickRate: number;
      replyRate: number;
      hotRate: number;
      failRate: number;
      score: number;
      verdict: string;
      nextMove: string;
    }[];
  };
};

type IntegrationPayloadValue = string | number | boolean | null | undefined | Record<string, string | number | boolean | null | undefined>;
type IntegrationPayload = Record<string, Record<string, IntegrationPayloadValue>>;

type ActionToast = {
  phase: "loading" | "success" | "error";
  title: string;
  detail: string;
};

type AutomationEvent = {
  id: string;
  title: string;
  detail: string;
  status: "done" | "blocked" | "planned";
  type?: string;
  createdAt: string;
};

type AgentControlCard = {
  id: string;
  name: string;
  role: string;
  status: "running" | "ready" | "needs-work" | "blocked";
  health: string;
  detail: string;
  lastEvent?: {
    title: string;
    detail: string;
    status: string;
    at: string;
    age: string;
  } | null;
  nextRun?: string;
  actionLabel?: string;
  actionView?: string;
  metrics: Record<string, string | number>;
  blockers: string[];
};

type LeadGenDirector = {
  name: string;
  mandate: string;
  status: "running" | "ready" | "needs-work" | "blocked";
  health: string;
  nextMove: string;
  lastEvent?: {
    title: string;
    detail: string;
    status: string;
    at: string;
    age: string;
  } | null;
  blockers: string[];
  metrics: Record<string, string | number>;
};

type AgentControlRoom = {
  director?: LeadGenDirector;
  missionControl?: {
    nova: {
      configured: boolean;
      cSuiteConfigured?: boolean;
      cSuiteChannel?: string;
      targetAgent: string;
      sourceAgent?: string;
      channel: string;
      detail: string;
    };
    peers: {
      name: string;
      role: string;
      status: string;
      detail: string;
    }[];
  };
  summary: {
    ready: number;
    total: number;
    blocked: number;
    mode: string;
    crmRoute: string;
    recommendation: string;
  };
  agents: AgentControlCard[];
};

type LeadGenDirectorResult = {
  ok: boolean;
  summary: {
    found: number;
    qualified: number;
    queued: number;
    pendingApprovals: number;
    sentOrQueued: number;
    hotReplies: number;
    bookedCalls: number;
    bookingReady: boolean;
    nextMove: string;
  };
  specialists: {
    id: string;
    name: string;
    role: string;
    status: "done" | "blocked" | "skipped";
    provider?: string;
    found?: number;
    qualified?: number;
    queued?: number;
    message: string;
  }[];
};

type NovaBriefResult = {
  ok: boolean;
  posted: boolean;
  postStatus: string;
  targetAgent: string;
  brief: string;
  metrics: {
    leadsToday: number;
    pending: number;
    sentOrQueued: number;
    replies: number;
    booked: number;
  };
  nextMove: string;
};

type LeadCommandAuditResult = {
  ok: boolean;
  executiveSummary: string;
  bottleneck: string;
  nextMove: string;
  gojiBerryPosition: string;
  metrics: {
    leads: number;
    leadsToday: number;
    pending: number;
    sentOrQueued: number;
    sent: number;
    replies: number;
    repliesToday: number;
    booked: number;
    failed: number;
    suppressions: number;
  };
  agents: { name: string; status: string; detail: string; owner: string }[];
  slack?: { sent?: boolean; message?: string } | null;
};

type LearningRow = {
  key: string;
  leads: number;
  queued: number;
  sent: number;
  failed: number;
  replies: number;
  hot: number;
  booked: number;
  pipeline: number;
  replyRate: number;
  hotRate: number;
  failureRate: number;
  quality: string;
};

type LearningLoop = {
  summary: {
    leads: number;
    sentOrQueued: number;
    replies: number;
    hot: number;
    failed: number;
    overallReplyRate: number;
    gojiBerryCloseness: string;
  };
  sources: LearningRow[];
  niches: LearningRow[];
  signals: LearningRow[];
  examples: { company: string; source: string; signal: string; score: number; stage: string }[];
  recommendations: string[];
  gaps: string[];
};

type SignalCollectorResult = {
  commit: boolean;
  runs: { playId: string; name: string; provider: string; found: number; qualified: number; message?: string | null }[];
  qualified: SourceLead[];
  imported: number;
  queued: number;
  skipped: Record<string, number>;
};

type VegaSpecialistKind =
  | "contact-path"
  | "booking"
  | "deliverability"
  | "copy-chief"
  | "cadence"
  | "intent-feed"
  | "learning-loop"
  | "social-intent"
  | "linkedin-events"
  | "linkedin-tasks"
  | "waitlist"
  | "full-team";

type VegaSpecialistResult = {
  kind: VegaSpecialistKind;
  title: string;
  status: "done" | "needs_review" | "blocked";
  summary: string;
  metrics: Record<string, string | number | boolean>;
  nextMove: string;
};

type VegaClosingSprintResult = {
  ok: boolean;
  mode: "closing-sprint";
  bottleneck: string;
  summary: string;
  after: {
    targetCloses: number;
    targetBooked: number;
    leadsThisWeek: number;
    sentThisWeek: number;
    repliesThisWeek: number;
    hotRepliesThisWeek: number;
    bookedCalls: number;
    wonDeals: number;
    pendingApprovals: number;
    sendgridReady: number;
    manualTasks: number;
    failedSends: number;
  };
  actions: { name: string; status: string; detail: string }[];
  nextMoves: string[];
  autoApproved: boolean;
};

type SalesNavResult = {
  commit: boolean;
  enrich: boolean;
  provider?: string;
  model?: string;
  parsed: number;
  qualified: number;
  contactable: number;
  needsContact: number;
  preview: SourceLead[];
  rawCsv?: string;
  imported: number;
  queued: number;
  skipped: Record<string, number>;
  pdlEnrichment: boolean;
};

type BookingTask = {
  id: string;
  status: string;
  meetingTitle: string;
  meetingLink?: string | null;
  calendarProvider?: string | null;
  ownerEmail?: string | null;
  durationMinutes: number;
  scheduledFor?: string | null;
  prepNotes: string;
  createdAt: string;
  lead?: (Partial<Lead> & { companyName?: string; nextAction?: string }) | null;
};

type WaitlistContestant = {
  id: string;
  name: string;
  companyName: string;
  priority?: string | null;
  score: number;
  crmSyncStatus?: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: {
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    title?: string | null;
  } | null;
  waitlistTags: string[];
  waitlistFields: Record<string, unknown>;
  interactions?: { createdAt: string; body: string; classification?: string | null }[];
};

type WaitlistDashboard = {
  summary: {
    total: number;
    founding: number;
    privateBeta: number;
    general: number;
    activeBetaInterest: number;
    addedLast7Days: number;
  };
  leads: WaitlistContestant[];
};

function formatIntegrationValue(value: IntegrationPayloadValue): string {
  if (value == null) return "missing";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value || "missing";

  return Object.entries(value)
    .map(([nestedKey, nestedValue]) => `${nestedKey} ${formatIntegrationValue(nestedValue)}`)
    .join(", ");
}

function formatIntegrationStatus(status: Record<string, IntegrationPayloadValue>) {
  return Object.entries(status)
    .map(([key, value]) => `${key}: ${formatIntegrationValue(value)}`)
    .join(" · ");
}

function agentStatusClass(status: AgentControlCard["status"]) {
  if (status === "ready") return "border-[#d8ff5f]/45 bg-[#d8ff5f]/10 text-[#d8ff5f]";
  if (status === "needs-work") return "border-[#83d0c2]/40 bg-[#83d0c2]/10 text-[#83d0c2]";
  if (status === "running") return "border-white/35 bg-white/10 text-white";
  return "border-[#ff6b6b]/40 bg-[#ff6b6b]/10 text-[#ffb3b3]";
}

function agentDotClass(status: AgentControlCard["status"]) {
  if (status === "ready") return "bg-[#d8ff5f]";
  if (status === "needs-work") return "bg-[#83d0c2]";
  if (status === "running") return "bg-white";
  return "bg-[#ff6b6b]";
}

type SequenceQueueStep = {
  id: string;
  stepNumber: number;
  dayOffset: number;
  channel: string;
  provider?: string | null;
  subject?: string | null;
  body: string;
  status: string;
  createdAt: string;
  lead?: (Partial<Lead> & { companyName?: string; nextAction?: string }) | null;
};

type QueueBoardCard = {
  id: string;
  kind: "queue" | "sequence" | "reply" | "booking" | "lead";
  title: string;
  subtitle?: string;
  detail: string;
  status: string;
  meta: string[];
  createdAt?: string;
  leadId?: string;
  lead?: (Partial<Lead> & { companyName?: string; nextAction?: string }) | null;
  queueItem?: QueueItem;
};

const seedLeads: Lead[] = [
  {
    name: "Maya Collins",
    company: "BrightPath Med Spa",
    niche: "Wellness",
    stage: "Replied",
    score: 92,
    value: 5400,
    source: "Dead lead import",
    lastTouch: "18m ago",
    next: "Send revival case study and book audit call.",
  },
  {
    name: "Drew Landry",
    company: "Bayou Home Services",
    niche: "HVAC",
    stage: "Call Booked",
    score: 88,
    value: 7200,
    source: "Ghostbot",
    lastTouch: "42m ago",
    next: "Prep missed-call text-back demo.",
  },
  {
    name: "Nia Porter",
    company: "Porter Dental Group",
    niche: "Dental",
    stage: "Proposal Sent",
    score: 83,
    value: 9600,
    source: "Custom CRM sync",
    lastTouch: "2h ago",
    next: "Follow up with ROI guarantee option.",
  },
  {
    name: "Luis Rojas",
    company: "Rojas Auto Detail",
    niche: "Local services",
    stage: "Contacted",
    score: 76,
    value: 3000,
    source: "CSV upload",
    lastTouch: "3h ago",
    next: "Second touch with 15-minute booking CTA.",
  },
  {
    name: "Erin Vale",
    company: "Vale Leadership Lab",
    niche: "Consulting",
    stage: "Won",
    score: 95,
    value: 12500,
    source: "Referral",
    lastTouch: "Today",
    next: "Install Ghostbot and start week-one revival.",
  },
  {
    name: "Owen Price",
    company: "Price Consulting",
    niche: "B2B services",
    stage: "Imported",
    score: 64,
    value: 4200,
    source: "Legacy list",
    lastTouch: "Never",
    next: "Run first reactivation opener.",
  },
];

const sampleCsv = `name,company,email,phone,niche,source
Sam Hill,Hill Roofing,sam@example.com,555-1111,Roofing,old crm
Jenna Park,Park Family Dental,jenna@example.com,555-2222,Dental,dead crm list
Chris Wade,Wade HVAC,chris@example.com,555-3333,HVAC,old estimate list`;

const sampleSalesNavPaste = `Name,Title,Company,Industry,Location,LinkedIn URL,Notes
Morgan Reed,Founder,Northstar RevOps,B2B Services,Austin TX,https://www.linkedin.com/in/morgan-reed,Posted about outbound pipeline quality
Alex Carter,VP Sales,Atlas Automation,Software,Dallas TX,https://www.linkedin.com/in/alex-carter,Hiring SDRs and scaling demos
Priya Shah,Head of Growth,LaunchGrid Labs,SaaS,United States,https://www.linkedin.com/in/priya-shah,Engaged with competitor content`;

const stages: Stage[] = [
  "Imported",
  "Contacted",
  "Networking Contact",
  "Potential Client",
  "Referral Partner",
  "Vendor",
  "Friend of Business",
  "Replied",
  "Call Booked",
  "Proposal Sent",
  "Won",
];

const relationshipStages: Stage[] = [
  "Networking Contact",
  "Potential Client",
  "Referral Partner",
  "Vendor",
  "Friend of Business",
];

const revivalSteps = [
  {
    title: "Import old list",
    detail: "CSV now, custom CRM adapter next.",
    metric: "1,248 leads",
    icon: Upload,
  },
  {
    title: "Segment by intent",
    detail: "Sort by niche, recency, past offer, and reply likelihood.",
    metric: "312 hot",
    icon: DatabaseZap,
  },
  {
    title: "Launch revival",
    detail: "Generate SMS and email paths with manual approval.",
    metric: "17.8% reply",
    icon: Rocket,
  },
  {
    title: "Book and attribute",
    detail: "Track booked calls, proposals, won revenue, and rev share.",
    metric: "$38.7k pipe",
    icon: WalletCards,
  },
];

const seedAgentTemplates: AgentTemplate[] = [
  {
    name: "Dead Lead Revival Agent",
    source: "ghostbot-chat + relateos",
    use: "Reactivates old CRM records and classifies replies.",
    price: "$2,500 setup",
  },
  {
    name: "AI Website Audit Agent",
    source: "content-scrapper",
    use: "Builds pain-point proof for the sales call.",
    price: "$1,500 setup",
  },
  {
    name: "Missed Call Text-Back Bot",
    source: "GhostVoice + ghostcrm",
    use: "Captures calls that local businesses are wasting.",
    price: "$500/mo",
  },
  {
    name: "Authority Site + Admin",
    source: "ghost-enterprise-template",
    use: "Ships the client-facing delivery portal.",
    price: "$5,000 build",
  },
];

const seedPrompts: PromptTemplate[] = [
  { body: "Write a three-touch revival sequence for old HVAC estimate requests." },
  {
    body: "Summarize this lead before the sales call with pain, money angle, and demo hook.",
  },
  { body: "Turn this discovery call into a two-option AI automation proposal." },
  { body: "Classify this reply as hot, nurture, objection, booked, or dead." },
];

const nav = [
  { id: "dashboard", label: "Command", icon: Gauge },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "source", label: "Source", icon: Target },
  { id: "pipeline", label: "Pipeline", icon: Layers3 },
  { id: "waitlist", label: "Vega Waitlist", icon: Users },
  { id: "relationships", label: "QR Relationships", icon: Radar },
  { id: "revival", label: "Revival", icon: Flame },
  { id: "outreach", label: "Outreach", icon: Send },
  { id: "queue", label: "Queue", icon: ClipboardList },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "analytics", label: "Analytics", icon: Brain },
  { id: "readiness", label: "Readiness", icon: CheckCircle2 },
  { id: "proposal", label: "Proposal", icon: FileText },
  { id: "library", label: "Library", icon: Bot },
];

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function publicQueueReason(item: QueueItem) {
  const reason = item.reason?.trim();
  if (!reason) return "";
  if (/ai operator|openai|lead command approval workflow|prepared for operator approval/i.test(reason)) {
    return item.status === "pending" ? "Waiting for operator approval." : "";
  }
  return reason;
}

function boardLeadName(lead?: (Partial<Lead> & { companyName?: string }) | null) {
  return lead?.company || lead?.companyName || "Unassigned lead";
}

function boardContactName(lead?: (Partial<Lead> & { companyName?: string }) | null) {
  return lead?.name || "Unknown contact";
}

function compactText(value: string, maxLength = 260) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function cardTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mapApiLead(lead: {
  id: string;
  name: string;
  companyName: string;
  niche: string;
  stage: string;
  score: number;
  value: number;
  source: string;
  lastTouch: string;
  nextAction: string;
  interactions?: Interaction[];
  opportunities?: { id: string }[];
}): Lead {
  return {
    id: lead.id,
    opportunityId: lead.opportunities?.[0]?.id,
    name: lead.name,
    company: lead.companyName,
    niche: lead.niche,
    stage: stages.includes(lead.stage as Stage) ? (lead.stage as Stage) : "Imported",
    score: lead.score,
    value: lead.value,
    source: lead.source,
    lastTouch: lead.lastTouch,
    next: lead.nextAction,
    interactions: lead.interactions || [],
  };
}

async function readErrorDetail(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return [payload.error, payload.detail].filter(Boolean).join(": ") || fallback;
  } catch {
    return `${fallback} HTTP ${response.status}`;
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

async function compressScreenshot(file: File) {
  const original = await readFileAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = original;
  });

  const maxWidth = 1500;
  const scale = Math.min(1, maxWidth / image.width);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return original;
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.74);
}

export default function Home() {
  const [active, setActive] = useState("dashboard");
  const [liveLeads, setLiveLeads] = useState(seedLeads);
  const [liveAgents, setLiveAgents] = useState(seedAgentTemplates);
  const [livePrompts, setLivePrompts] = useState(seedPrompts);
  const [selectedLead, setSelectedLead] = useState(seedLeads[0]);
  const [campaignMode, setCampaignMode] = useState("revival");
  const [csvText, setCsvText] = useState(sampleCsv);
  const [importPreview, setImportPreview] = useState<ImportPreview[]>([]);
  const [operationStatus, setOperationStatus] = useState("Connecting to Lead Command data...");
  const [actionToast, setActionToast] = useState<ActionToast | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [directorBusy, setDirectorBusy] = useState(false);
  const [novaBusy, setNovaBusy] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [outreachStatus, setOutreachStatus] = useState<OutreachStatus>({
    mode: "dry-run",
    smsProvider: "telnyx",
    sendgridConfigured: false,
    telnyxConfigured: false,
    twilioConfigured: false,
  });
  const [sourcingStatus, setSourcingStatus] = useState<SourcingStatus>({
    pdlConfigured: false,
    ghostLeadAgentConfigured: false,
    googleMapsConfigured: false,
    mockSourceEnabled: false,
    maxPreviewSize: 100,
  });
  const [sourceProvider, setSourceProvider] = useState<"pdl" | "ghost-lead-agent" | "google-maps">("pdl");
  const [sourceQuery, setSourceQuery] = useState("founders revenue leaders growth operators at companies that need more qualified sales calls");
  const [sourceLocation, setSourceLocation] = useState("United States");
  const [sourceIndustry, setSourceIndustry] = useState("Software, SaaS, Marketing, Consulting, B2B Services");
  const [sourceLimit, setSourceLimit] = useState("50");
  const [sourceMinScore, setSourceMinScore] = useState("82");
  const [sourceResults, setSourceResults] = useState<SourceLead[]>([]);
  const [sourceStatus, setSourceStatus] = useState("Ready to find fresh contacts.");
  const [sourceScrollToken, setSourceScrollToken] = useState<string | null>(null);
  const [salesNavText, setSalesNavText] = useState(sampleSalesNavPaste);
  const [salesNavBusy, setSalesNavBusy] = useState(false);
  const [salesNavScreenshotCount, setSalesNavScreenshotCount] = useState(0);
  const [salesNavResult, setSalesNavResult] = useState<SalesNavResult | null>(null);
  const [forceDemoMode, setForceDemoMode] = useState(false);
  const [sourceCampaigns, setSourceCampaigns] = useState<SourceCampaign[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [replyItems, setReplyItems] = useState<ReplyItem[]>([]);
  const [suppressionItems, setSuppressionItems] = useState<SuppressionItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationPayload>({});
  const [replyDraft, setReplyDraft] = useState("Can you send pricing and a few times this week?");
  const [suppressionValue, setSuppressionValue] = useState("");
  const [generatedOutreach, setGeneratedOutreach] = useState("");
  const [smsDraft, setSmsDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSubjectDraft, setEmailSubjectDraft] = useState("");
  const [approvalItem, setApprovalItem] = useState<QueueItem | null>(null);
  const [approvalSubject, setApprovalSubject] = useState("");
  const [approvalBody, setApprovalBody] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [queueActionId, setQueueActionId] = useState<string | null>(null);
  const [twilioTestBusy, setTwilioTestBusy] = useState(false);
  const [replyText, setReplyText] = useState("Sounds interesting. Can you send pricing and maybe book something this week?");
  const [replyClassification, setReplyClassification] = useState("");
  const [proposalSummary, setProposalSummary] = useState("");
  const [proposalShareUrl, setProposalShareUrl] = useState("");
  const [callPrep, setCallPrep] = useState("");
  const [sequenceMode, setSequenceMode] = useState<"fresh" | "revival" | "booked">("fresh");
  const [automationEvents, setAutomationEvents] = useState<AutomationEvent[]>([
    {
      id: "boot",
      title: "Command center initialized",
      detail: "Automation log is ready for sourcing, approval, booking, CRM, and notification events.",
      status: "done",
      createdAt: "",
    },
  ]);
  const [agentControlRoom, setAgentControlRoom] = useState<AgentControlRoom | null>(null);
  const [learningLoop, setLearningLoop] = useState<LearningLoop | null>(null);
  const [collectorBusy, setCollectorBusy] = useState(false);
  const [tuningBusy, setTuningBusy] = useState(false);
  const [specialistBusy, setSpecialistBusy] = useState<VegaSpecialistKind | null>(null);
  const [dominanceBusy, setDominanceBusy] = useState(false);
  const [closingSprintBusy, setClosingSprintBusy] = useState(false);
  const [standupBusy, setStandupBusy] = useState(false);
  const [opsLoopBusy, setOpsLoopBusy] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [signalCollectorResult, setSignalCollectorResult] = useState<SignalCollectorResult | null>(null);
  const [specialistResult, setSpecialistResult] = useState<VegaSpecialistResult | null>(null);
  const [closingSprintResult, setClosingSprintResult] = useState<VegaClosingSprintResult | null>(null);
  const [directorResult, setDirectorResult] = useState<LeadGenDirectorResult | null>(null);
  const [novaBriefResult, setNovaBriefResult] = useState<NovaBriefResult | null>(null);
  const [leadCommandAudit, setLeadCommandAudit] = useState<LeadCommandAuditResult | null>(null);
  const [bookingTasks, setBookingTasks] = useState<BookingTask[]>([]);
  const [sequenceQueue, setSequenceQueue] = useState<SequenceQueueStep[]>([]);
  const [waitlistDashboard, setWaitlistDashboard] = useState<WaitlistDashboard | null>(null);
  const [waitlistFilter, setWaitlistFilter] = useState("all");
  const [waitlistNow] = useState(() => Date.now());
  const [editScore, setEditScore] = useState(String(seedLeads[0].score));
  const [editValue, setEditValue] = useState(String(seedLeads[0].value));
  const [editNextAction, setEditNextAction] = useState(seedLeads[0].next);
  const leads = liveLeads;
  const agentTemplates = liveAgents;
  const prompts = livePrompts;
  const queueBoardColumns = useMemo(() => {
    const pendingQueue = queueItems.filter((item) => item.status === "pending");
    const rejectedQueue = queueItems.filter((item) => item.status === "rejected");
    const finishedQueue = queueItems.filter((item) => item.status !== "pending" && item.status !== "rejected");
    const isFollowUpQueue = (item: QueueItem) =>
      /follow-up sequence|sequence step|step \d|three-touch/i.test(`${item.reason || ""} ${item.subject || ""}`);

    const mapQueueItem = (item: QueueItem): QueueBoardCard => ({
      id: item.id,
      kind: "queue",
      title: boardLeadName(item.lead),
      subtitle: item.subject || boardContactName(item.lead),
      detail: compactText(publicQueueReason(item) || item.body),
      status: item.status,
      meta: [item.channel, item.provider, cardTime(item.createdAt)].filter(Boolean),
      createdAt: item.createdAt,
      leadId: item.lead?.id,
      lead: item.lead,
      queueItem: item,
    });

    const mapSequenceStep = (step: SequenceQueueStep): QueueBoardCard => ({
      id: step.id,
      kind: "sequence",
      title: boardLeadName(step.lead),
      subtitle: `Step ${step.stepNumber} - day ${step.dayOffset}`,
      detail: compactText(step.subject ? `${step.subject}. ${step.body}` : step.body),
      status: step.status,
      meta: [step.channel, step.provider || "sequence", cardTime(step.createdAt)].filter(Boolean),
      createdAt: step.createdAt,
      leadId: step.lead?.id,
      lead: step.lead,
    });

    const queued = pendingQueue
      .map<QueueBoardCard>((item) => ({
        ...mapQueueItem(item),
        status: isFollowUpQueue(item) ? "follow-up queued" : "queued",
      }));

    const sequenceCards = sequenceQueue
      .filter((step) => !["sent", "skipped", "rejected"].includes(step.status))
      .map(mapSequenceStep);

    const initial = [
      ...finishedQueue
        .filter((item) => !isFollowUpQueue(item) && ["approved", "sent", "delivered"].includes(item.status))
        .map(mapQueueItem),
      ...sequenceCards.filter((step) => /step 1\b/i.test(step.subtitle || "")),
    ];

    const followUpOne = sequenceCards.filter((step) => /step 2\b/i.test(step.subtitle || ""));
    const followUpTwo = sequenceCards.filter((step) => {
      const match = (step.subtitle || "").match(/step\s+(\d+)/i);
      return match ? Number(match[1]) >= 3 : false;
    });

    const replyCards = replyItems
      .filter((reply) => ["hot", "booked", "objection", "nurture"].includes(reply.classification.toLowerCase()))
      .map<QueueBoardCard>((reply) => ({
        id: reply.id,
        kind: "reply",
        title: boardLeadName(reply.lead),
        subtitle: reply.from,
        detail: compactText(reply.body),
        status: reply.classification,
        meta: [reply.channel, reply.source, cardTime(reply.createdAt)].filter(Boolean),
        createdAt: reply.createdAt,
        leadId: reply.lead?.id,
        lead: reply.lead,
      }));

    const bookingBlocked = bookingTasks
      .filter((task) => task.status === "blocked")
      .map<QueueBoardCard>((task) => ({
        id: task.id,
        kind: "booking",
        title: boardLeadName(task.lead),
        subtitle: task.meetingTitle,
        detail: compactText(task.prepNotes || task.meetingLink || "Booking handoff is blocked."),
        status: task.status,
        meta: [task.calendarProvider || "booking", task.meetingLink ? "meeting link" : "link needed", cardTime(task.createdAt)].filter(Boolean),
        createdAt: task.createdAt,
        leadId: task.lead?.id,
        lead: task.lead,
      }));

    const bookingHandoff = bookingTasks
      .filter((task) => ["ready", "handoff_sent"].includes(task.status))
      .map<QueueBoardCard>((task) => ({
        id: task.id,
        kind: "booking",
        title: boardLeadName(task.lead),
        subtitle: task.status === "handoff_sent" ? "Calendar handoff queued" : "Ready for booking handoff",
        detail: compactText(task.prepNotes || task.meetingLink || "Booking handoff ready."),
        status: task.status,
        meta: [task.calendarProvider || "booking", task.meetingLink ? "meeting link" : "link needed", cardTime(task.createdAt)].filter(Boolean),
        createdAt: task.createdAt,
        leadId: task.lead?.id,
        lead: task.lead,
      }));

    const appointmentCards = [
      ...bookingTasks.filter((task) => task.status === "scheduled").map<QueueBoardCard>((task) => ({
        id: task.id,
        kind: "booking",
        title: boardLeadName(task.lead),
        subtitle: task.meetingTitle,
        detail: compactText(task.prepNotes || task.meetingLink || "Booking handoff ready."),
        status: task.status,
        meta: [task.calendarProvider || "booking", task.meetingLink ? "meeting link" : "link needed", cardTime(task.createdAt)].filter(Boolean),
        createdAt: task.createdAt,
        leadId: task.lead?.id,
        lead: task.lead,
      })),
      ...leads
        .filter((lead) => lead.stage === "Call Booked")
        .map<QueueBoardCard>((lead) => ({
          id: lead.id || `${lead.company}-appointment`,
          kind: "lead",
          title: lead.company,
          subtitle: lead.name,
          detail: compactText(lead.next),
          status: lead.stage,
          meta: [lead.niche, String(lead.score), lead.lastTouch].filter(Boolean),
          leadId: lead.id,
          lead,
        })),
    ];

    const rejected = rejectedQueue.slice(0, 20).map(mapQueueItem);
    const done = finishedQueue
      .filter((item) => !["approved", "sent", "delivered"].includes(item.status) || isFollowUpQueue(item))
      .slice(0, 20)
      .map(mapQueueItem);

    return [
      {
        id: "queued",
        title: "Queued",
        subtitle: "Waiting for approval or send",
        cards: queued,
      },
      {
        id: "initial",
        title: "Initial Outreach",
        subtitle: "Step 1 touches already in motion",
        cards: initial,
      },
      {
        id: "follow-up-1",
        title: "Follow-Up 1 Draft",
        subtitle: "Step 2 prepared for due-time approval",
        cards: followUpOne,
      },
      {
        id: "follow-up-2",
        title: "Follow-Up 2 Draft",
        subtitle: "Step 3+ prepared for close-loop timing",
        cards: followUpTwo,
      },
      {
        id: "engaged",
        title: "Engaged Reply",
        subtitle: "Hot, booked, objection, nurture",
        cards: replyCards,
      },
      {
        id: "booking-handoff",
        title: "Booking Handoff",
        subtitle: "Ready or queued for calendar follow-up",
        cards: bookingHandoff,
      },
      {
        id: "appointment",
        title: "Appointment Set",
        subtitle: "Confirmed scheduled calls only",
        cards: appointmentCards,
      },
      {
        id: "booking-blocked",
        title: "Booking Blocked",
        subtitle: "Needs link, calendar, or operator help",
        cards: bookingBlocked,
      },
      {
        id: "rejected",
        title: "Rejected",
        subtitle: "Manually removed from outreach",
        cards: rejected,
      },
      {
        id: "done",
        title: "Done",
        subtitle: "Completed, failed, or skipped queue items",
        cards: done,
      },
    ];
  }, [bookingTasks, leads, queueItems, replyItems, sequenceQueue]);

  function selectLead(lead: Lead) {
    setSelectedLead(lead);
    setEditScore(String(lead.score));
    setEditValue(String(lead.value));
    setEditNextAction(lead.next);
    const copy = buildOutreachCopy(lead);
    setSmsDraft(copy.sms);
    setEmailDraft(copy.email);
    setEmailSubjectDraft(copy.subject);
  }

  function addAutomationEvent(event: Omit<AutomationEvent, "id" | "createdAt">) {
    const createdAt = new Date().toISOString();
    setAutomationEvents((current) => [
      {
        ...event,
        id: `${Date.now()}-${event.title}`,
        createdAt,
      },
      ...current,
    ].slice(0, 12));
    void fetch("/api/automation/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: event.title,
        detail: event.detail,
        status: event.status,
        type: event.type || "ui",
        leadId: selectedLead.id,
      }),
    }).catch(() => undefined);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("view");
    const slackAction = params.get("slackAction");
    const timer = window.setTimeout(() => {
      if (requestedView && nav.some((item) => item.id === requestedView)) {
        setActive(requestedView);
      }
      if (slackAction) {
        setOperationStatus(`Slack action processed: ${slackAction.replace(/_/g, " ")}.`);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveData() {
      try {
        const outreachResponse = await fetch("/api/outreach/status");
        const sourceResponse = await fetch("/api/source/search");
        const integrationsResponse = await fetch("/api/health/integrations");
        const leadsResponse = await fetch("/api/leads");
        const libraryResponse = await fetch("/api/library");
        const campaignsResponse = await fetch("/api/source/campaigns");
        const queueResponse = await fetch("/api/outreach/queue");
        const repliesResponse = await fetch("/api/replies");
        const suppressionResponse = await fetch("/api/suppression");
        const analyticsResponse = await fetch("/api/analytics");
        const eventsResponse = await fetch("/api/automation/events");
        const bookingResponse = await fetch("/api/automation/booking");
        const sequenceResponse = await fetch("/api/automation/sequence");
        const agentControlResponse = await fetch("/api/agent/control-room");
        const learningResponse = await fetch("/api/agent/learning");
        const waitlistResponse = await fetch("/api/waitlist/dashboard");

        if (!cancelled && leadsResponse.ok) {
          const payload = await leadsResponse.json();
          const mappedLeads = (payload.leads || []).map(mapApiLead);
          if (mappedLeads.length) {
            setLiveLeads(mappedLeads);
            selectLead(mappedLeads[0]);
          }
          setOperationStatus("Database connected. Ready to work leads.");
        } else if (!cancelled) {
          const detail = await readErrorDetail(leadsResponse, "Live leads unavailable.");
          setOperationStatus(`${detail} Showing demo fallback until the database responds.`);
        }

        if (!cancelled && libraryResponse.ok) {
          const payload = await libraryResponse.json();
          const mappedAgents = (payload.agents || []).map(
            (agent: {
              id: string;
              name: string;
              source: string;
              useCase: string;
              price: string;
            }) => ({
              id: agent.id,
              name: agent.name,
              source: agent.source,
              use: agent.useCase,
              price: agent.price,
            }),
          );
          const mappedPrompts = (payload.prompts || []).map(
            (prompt: { id: string; title: string; body: string; category: string }) => ({
              id: prompt.id,
              title: prompt.title,
              body: prompt.body,
              category: prompt.category,
            }),
          );

          if (mappedAgents.length) setLiveAgents(mappedAgents);
          if (mappedPrompts.length) setLivePrompts(mappedPrompts);
        }

        if (!cancelled && outreachResponse.ok) {
          setOutreachStatus(await outreachResponse.json());
        }

        if (!cancelled && sourceResponse.ok) {
          setSourcingStatus(await sourceResponse.json());
        }

        if (!cancelled && campaignsResponse.ok) {
          const payload = await campaignsResponse.json();
          setSourceCampaigns(payload.campaigns || []);
        }

        if (!cancelled && queueResponse.ok) {
          const payload = await queueResponse.json();
          setQueueItems(payload.items || []);
        }

        if (!cancelled && repliesResponse.ok) {
          const payload = await repliesResponse.json();
          setReplyItems(payload.replies || []);
        }

        if (!cancelled && suppressionResponse.ok) {
          const payload = await suppressionResponse.json();
          setSuppressionItems(payload.records || []);
        }

        if (!cancelled && analyticsResponse.ok) {
          setAnalytics(await analyticsResponse.json());
        }

        if (!cancelled && eventsResponse.ok) {
          const payload = await eventsResponse.json();
          if (payload.events?.length) setAutomationEvents(payload.events);
        }

        if (!cancelled && bookingResponse.ok) {
          const payload = await bookingResponse.json();
          setBookingTasks(payload.tasks || []);
        }

        if (!cancelled && sequenceResponse.ok) {
          const payload = await sequenceResponse.json();
          setSequenceQueue(payload.steps || []);
        }

        if (!cancelled && integrationsResponse.ok) {
          setIntegrations(await integrationsResponse.json());
        }

        if (!cancelled && agentControlResponse.ok) {
          setAgentControlRoom(await agentControlResponse.json());
        }

        if (!cancelled && learningResponse.ok) {
          setLearningLoop(await learningResponse.json());
        }

        if (!cancelled && waitlistResponse.ok) {
          setWaitlistDashboard(await waitlistResponse.json());
        }
      } catch (error) {
        if (!cancelled) {
          setOperationStatus(
            `Live data request failed${error instanceof Error ? `: ${error.message}` : ""}. Showing demo fallback.`,
          );
        }
      }
    }

    loadLiveData();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshLeads(ignoreDemoGuard = false) {
    if (forceDemoMode && !ignoreDemoGuard) {
      setOperationStatus("Demo operating mode active. Live lead refresh is paused.");
      return;
    }
    const response = await fetch("/api/leads");
    if (!response.ok) {
      const detail = await readErrorDetail(response, "Unable to refresh live leads.");
      setOperationStatus(detail);
      return;
    }
    const payload = await response.json();
    const mappedLeads = (payload.leads || []).map(mapApiLead);
    if (mappedLeads.length) {
      setLiveLeads(mappedLeads);
      const nextSelected =
        mappedLeads.find((lead: Lead) => lead.id === selectedLead.id) || mappedLeads[0];
      selectLead(nextSelected);
    }
  }

  async function updateLead(id: string | undefined, updates: Partial<Lead>) {
    if (forceDemoMode) {
      setOperationStatus("Demo mode is active. Disable demo mode before changing live lead stages.");
      return;
    }
    if (!id) return;
    const response = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: updates.stage,
        score: updates.score,
        value: updates.value,
        nextAction: updates.next,
        lastTouch: updates.lastTouch,
      }),
    });
    if (response.ok) {
      const payload = await response.json();
      const mapped = mapApiLead(payload.lead);
      selectLead(mapped);
      setLiveLeads((current) =>
        current.map((lead) => (lead.id === mapped.id ? mapped : lead)),
      );
      setOperationStatus(`${mapped.company} updated to ${mapped.stage}.`);
    }
  }

  async function previewImport() {
    const response = await fetch("/api/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText }),
    });
    if (!response.ok) {
      setOperationStatus("CSV preview failed. Check the headers and rows.");
      return;
    }
    const payload = await response.json();
    setImportPreview(payload.preview || []);
    setOperationStatus(`Previewed ${payload.totalRows || 0} CSV rows.`);
  }

  async function commitImport() {
    if (!importPreview.length) {
      setOperationStatus("Preview the CSV before importing.");
      return;
    }
    const response = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: importPreview }),
    });
    if (!response.ok) {
      setOperationStatus("Import failed. Nothing was created.");
      return;
    }
    const payload = await response.json();
    setOperationStatus(`Imported ${payload.count || 0} leads into the revival queue.`);
    setImportPreview([]);
    await refreshLeads();
  }

  async function generateOutreach(kind: "outreach" | "call-prep" | "proposal" = "outreach") {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        lead: {
          name: selectedLead.name,
          companyName: selectedLead.company,
          niche: selectedLead.niche,
          stage: selectedLead.stage,
          score: selectedLead.score,
          value: selectedLead.value,
          source: selectedLead.source,
          nextAction: selectedLead.next,
        },
      }),
    });
    if (!response.ok) {
      setOperationStatus("AI generation failed.");
      return;
    }
    const payload = await response.json();
    if (kind === "call-prep") {
      setCallPrep(payload.text || "");
      setOperationStatus(`Generated call prep using ${payload.provider}.`);
      return;
    }
    setGeneratedOutreach(payload.text || "");
    setOperationStatus(`Generated ${kind} using ${payload.provider}.`);
  }

  async function saveInteraction(channel: string, body: string, nextStage?: Stage) {
    if (!selectedLead.id || !body.trim()) return;
    const response = await fetch(
      `/api/leads/${encodeURIComponent(selectedLead.id)}/interactions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          direction: "outbound",
          body,
          classification: "sent",
          nextStage,
        }),
      },
    );
    if (response.ok) {
      const payload = await response.json();
      const mapped = mapApiLead(payload.lead);
      selectLead(mapped);
      setLiveLeads((current) =>
        current.map((lead) => (lead.id === mapped.id ? mapped : lead)),
      );
      setOperationStatus(`Saved ${channel} touch for ${mapped.company}.`);
    }
  }

  async function sendOutreach(channel: "sms" | "email", body: string) {
    if (forceDemoMode) {
      setOperationStatus("Demo mode is active. Disable demo mode before sending or queueing live outreach.");
      return;
    }
    if (!selectedLead.id || !body.trim()) return;
    const response = await fetch("/api/outreach/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: selectedLead.id,
        channel,
        body,
        subject: `Quick idea for ${selectedLead.company}`,
      }),
    });

    if (!response.ok) {
      setOperationStatus(`${channel.toUpperCase()} queue failed. Check the lead contact record.`);
      return;
    }

    const payload = await response.json();
    const mapped = mapApiLead(payload.lead);
    selectLead(mapped);
    setLiveLeads((current) =>
      current.map((lead) => (lead.id === mapped.id ? mapped : lead)),
    );

    const delivery = payload.delivery;
    const mode = delivery.dryRun ? "queued" : delivery.status;
    setOperationStatus(`${channel.toUpperCase()} ${mode} via ${delivery.provider} for ${mapped.company}.`);
  }

  async function searchSources(scrollToken?: string | null) {
    setSourceStatus(scrollToken ? "Loading the next source batch..." : "Searching fresh lead sources...");
    const industries = sourceIndustry
      .split(",")
      .map((industry) => industry.trim())
      .filter(Boolean);
    const response = await fetch("/api/source/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: sourceProvider,
        query: sourceQuery,
        location: sourceLocation,
        industries,
        titles: ["Founder", "CEO", "Owner", "Head of Growth", "VP Sales", "Revenue Operations", "General Manager", "Managing Partner"],
        size: Number(sourceLimit || 25),
        scrollToken: scrollToken || undefined,
      }),
    });

    if (!response.ok) {
      setSourceStatus("Source search failed. Check provider settings.");
      return;
    }

    const payload = await response.json();
    const minScore = Number(sourceMinScore || 75);
    const incoming = ((payload.leads || []) as SourceLead[]).filter(
      (lead) => isQualitySourceLead(lead) && lead.score >= minScore,
    );
    setSourceResults((current) => (scrollToken ? [...current, ...incoming] : incoming));
    setSourceScrollToken(payload.scrollToken || null);
    const foundCount = incoming.length;
    const rejectedCount = Math.max(0, (payload.leads?.length || 0) - incoming.length);
    const foundMessage = `${foundCount} qualified contacts found${rejectedCount ? `, ${rejectedCount} filtered out` : ""}${payload.dryRun ? " in mock mode" : ""}${
      payload.scrollToken ? ". More available." : "."
    }`;
    setSourceStatus(
      payload.message ? `${foundMessage} ${payload.message}` : foundMessage,
    );
  }

  async function importSourceResults() {
    if (!sourceResults.length) {
      setSourceStatus("Search before importing.");
      return;
    }

    const minScore = Number(sourceMinScore || 75);
    const qualifiedResults = sourceResults.filter((lead) => isQualitySourceLead(lead) && lead.score >= minScore);
    if (!qualifiedResults.length) {
      setSourceStatus("No contacts passed quality guardrails. Lower the score threshold or refine the search.");
      return;
    }

    const response = await fetch("/api/source/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: `${sourceProvider}-ui-import`,
        autoQueue: true,
        autoSend: outreachStatus.mode === "live",
        queueLimit: 8,
        leads: qualifiedResults.map((lead) => ({
          name: lead.name,
          companyName: lead.companyName,
          email: lead.email,
          phone: lead.phone,
          title: lead.title,
          location: lead.location,
          website: lead.website,
          confidence: lead.confidence,
          buyerFit: lead.buyerFit,
          intentSignals: lead.intentSignals || [],
          signalSummary: lead.signalSummary || "",
          niche: lead.niche,
          source: lead.source,
          score: lead.score,
          value: lead.score >= 85 ? 7500 : 3500,
        })),
      }),
    });

    if (!response.ok) {
      setSourceStatus("Import failed. Nothing was added to the pipeline.");
      return;
    }

    const payload = await response.json();
    setSourceStatus(
      `Imported ${payload.count || 0}, queued ${payload.queued || 0}. Skipped ${sourceResults.length - qualifiedResults.length} low-quality records and ${payload.skipped?.duplicate || 0} duplicates.`,
    );
    setOperationStatus(
      `Fresh sourcing added ${payload.count || 0} leads and queued ${payload.queued || 0} approval-ready touches.`,
    );
    await refreshLeads();
    await refreshOpsData();
  }

  async function runSalesNavigatorImport(commit = false) {
    if (salesNavBusy) return;
    setSalesNavBusy(true);
    setSourceStatus(commit ? "Importing Sales Navigator leads..." : "Previewing Sales Navigator leads...");

    const response = await fetch("/api/linkedin/sales-nav", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        raw: salesNavText,
        commit,
        enrich: true,
        autoQueue: true,
        autoSend: outreachStatus.mode === "live",
        queueLimit: 10,
        minScore: Math.min(Number(sourceMinScore || 68), 72),
        defaultNiche: sourceIndustry.split(",")[0]?.trim() || "B2B Services",
        defaultLocation: sourceLocation || "United States",
        limit: Number(sourceLimit || 50),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSourceStatus(payload.error || "Sales Navigator import failed.");
      setSalesNavBusy(false);
      return;
    }

    setSalesNavResult(payload);
    setSourceResults(payload.preview || []);
    setSourceStatus(
      commit
        ? `Sales Nav processed ${payload.parsed || 0}, imported ${payload.imported || 0}, queued ${payload.queued || 0}. ${payload.needsContact || 0} still need contact enrichment.`
        : `Sales Nav preview: ${payload.qualified || 0} qualified, ${payload.contactable || 0} contactable, ${payload.needsContact || 0} need contact enrichment.`,
    );
    await refreshOpsData();
    if (commit) await refreshLeads();
    setSalesNavBusy(false);
  }

  async function runSalesNavigatorScreenshots(files: FileList | null, commit = false) {
    const selectedFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/")).slice(0, 9);
    if (!selectedFiles.length || salesNavBusy) return;

    setSalesNavBusy(true);
    setSalesNavScreenshotCount(selectedFiles.length);
    setSourceStatus(
      commit
        ? `Extracting and importing ${selectedFiles.length} Sales Navigator screenshots...`
        : `Extracting ${selectedFiles.length} Sales Navigator screenshots...`,
    );

    try {
      const images = await Promise.all(selectedFiles.map((file) => compressScreenshot(file)));
      const response = await fetch("/api/linkedin/sales-nav/screenshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images,
          commit,
          enrich: true,
          autoQueue: true,
          autoSend: outreachStatus.mode === "live",
          queueLimit: 10,
          minScore: Math.min(Number(sourceMinScore || 68), 72),
          defaultNiche: sourceIndustry.split(",")[0]?.trim() || "B2B Services",
          defaultLocation: sourceLocation || "United States",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSourceStatus(payload.error || "Sales Navigator screenshot extraction failed.");
        setSalesNavBusy(false);
        return;
      }

      setSalesNavResult(payload);
      if (payload.rawCsv) setSalesNavText(payload.rawCsv);
      setSourceResults(payload.preview || []);
      setSourceStatus(
        commit
          ? `Screenshots extracted ${payload.parsed || 0}, imported ${payload.imported || 0}, queued ${payload.queued || 0}. ${payload.needsContact || 0} need contact enrichment.`
          : `Screenshots extracted ${payload.parsed || 0}; ${payload.qualified || 0} qualified, ${payload.contactable || 0} contactable.`,
      );
      await refreshOpsData();
      if (commit) await refreshLeads();
    } catch (error) {
      setSourceStatus(`Screenshot extraction failed${error instanceof Error ? `: ${error.message}` : ""}.`);
    }

    setSalesNavBusy(false);
  }

  async function refreshOpsData(ignoreDemoGuard = false) {
    if (forceDemoMode && !ignoreDemoGuard) {
      setOperationStatus("Demo operating mode active. Live ops refresh is paused.");
      return;
    }
    const campaignsResponse = await fetch("/api/source/campaigns");
    const queueResponse = await fetch("/api/outreach/queue");
    const repliesResponse = await fetch("/api/replies");
    const suppressionResponse = await fetch("/api/suppression");
    const analyticsResponse = await fetch("/api/analytics");
    const integrationsResponse = await fetch("/api/health/integrations");
    const eventsResponse = await fetch("/api/automation/events");
    const bookingResponse = await fetch("/api/automation/booking");
    const sequenceResponse = await fetch("/api/automation/sequence");
    const agentControlResponse = await fetch("/api/agent/control-room");
    const learningResponse = await fetch("/api/agent/learning");

    if (campaignsResponse.ok) setSourceCampaigns((await campaignsResponse.json()).campaigns || []);
    if (queueResponse.ok) setQueueItems((await queueResponse.json()).items || []);
    if (repliesResponse.ok) setReplyItems((await repliesResponse.json()).replies || []);
    if (suppressionResponse.ok) setSuppressionItems((await suppressionResponse.json()).records || []);
    if (analyticsResponse.ok) setAnalytics(await analyticsResponse.json());
    if (integrationsResponse.ok) setIntegrations(await integrationsResponse.json());
    if (eventsResponse.ok) {
      const payload = await eventsResponse.json();
      if (payload.events?.length) setAutomationEvents(payload.events);
    }
    if (bookingResponse.ok) setBookingTasks(((await bookingResponse.json()).tasks || []));
    if (sequenceResponse.ok) setSequenceQueue(((await sequenceResponse.json()).steps || []));
    if (agentControlResponse.ok) setAgentControlRoom(await agentControlResponse.json());
    if (learningResponse.ok) setLearningLoop(await learningResponse.json());
  }

  async function saveSourceCampaign() {
    const industries = sourceIndustry
      .split(",")
      .map((industry) => industry.trim())
      .filter(Boolean);
    const response = await fetch("/api/source/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${sourceLocation || "Fresh"} ${industries[0] || "Leads"}`,
        provider: sourceProvider,
        query: sourceQuery,
        location: sourceLocation,
        industries,
        titles: ["Founder", "CEO", "Owner", "Head of Growth", "VP Sales", "Revenue Operations", "Marketing Director", "Operations Manager"],
        dailyLimit: Number(sourceLimit || 25),
        scoreThreshold: Number(sourceMinScore || 75),
        status: "active",
      }),
    });

    if (response.ok) {
      setSourceStatus("Saved source campaign.");
      await refreshOpsData();
    }
  }

  async function runSourceCampaign(id: string) {
    const response = await fetch(`/api/source/campaigns/${encodeURIComponent(id)}/run`, {
      method: "POST",
    });

    if (!response.ok) {
      setSourceStatus("Campaign run failed.");
      return;
    }

    const payload = await response.json();
    setSourceResults(payload.qualified || payload.result?.leads || []);
    setSourceStatus(`Campaign found ${payload.qualifiedCount || 0} leads above threshold.`);
    await refreshOpsData();
  }

  async function runAiOperator() {
    if (agentBusy) return;
    setAgentBusy(true);
    setActionToast({
      phase: "loading",
      title: "AI operator running",
      detail: "Sourcing leads, scoring fit, writing first-touch email, and sending approval cards to Slack.",
    });
    setOperationStatus("AI operator is sourcing fresh leads and preparing approval-ready outreach.");

    const response = await fetch("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: sourceProvider,
        query: sourceQuery,
        location: sourceLocation,
        industries: sourceIndustry.split(",").map((item) => item.trim()).filter(Boolean),
        size: Math.min(15, Math.max(5, Number(sourceLimit || 10))),
        minScore: Number(sourceMinScore || 80),
        queueLimit: 5,
        autoSend: outreachStatus.mode === "live",
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "AI operator blocked",
        detail: payload.detail || payload.error || "The operator could not complete this run.",
      });
      setOperationStatus(payload.detail || payload.error || "AI operator run failed.");
      setAgentBusy(false);
      return;
    }

    setActionToast({
      phase: "success",
      title: "AI operator finished",
      detail: payload.message || `Queued ${payload.queued || 0} approval-ready touches.`,
    });
    setOperationStatus(payload.message || "AI operator run finished.");
    await refreshOpsData();
    await refreshLeads();
    setActive("queue");
    setAgentBusy(false);
  }

  async function runLeadGenDirector() {
    if (directorBusy) return;
    setDirectorBusy(true);
    setActionToast({
      phase: "loading",
      title: "Lead Gen Director running",
      detail: "Coordinating sourcing, QA, outreach queueing, and booking readiness across specialist agents.",
    });
    setOperationStatus("Lead Gen Director is running the specialist lead-gen team.");

    const response = await fetch("/api/agent/director", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "sprint",
        autoSend: outreachStatus.mode === "live",
        location: sourceLocation || "Texas",
        queueLimit: 10,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Lead Gen Director blocked",
        detail: payload.detail || payload.error || "The director could not complete this sprint.",
      });
      setOperationStatus(payload.detail || payload.error || "Lead Gen Director run failed.");
      setDirectorBusy(false);
      return;
    }

    setDirectorResult(payload);
    setActionToast({
      phase: "success",
      title: "Director sprint complete",
      detail: `Found ${payload.summary?.found || 0}, qualified ${payload.summary?.qualified || 0}, queued ${payload.summary?.queued || 0}.`,
    });
    setOperationStatus(payload.summary?.nextMove || "Lead Gen Director finished the sprint.");
    await refreshOpsData();
    await refreshLeads();
    if ((payload.summary?.pendingApprovals || 0) > 0) setActive("queue");
    setDirectorBusy(false);
  }

  async function briefNovaCeoAgent() {
    if (novaBusy) return;
    setNovaBusy(true);
    setActionToast({
      phase: "loading",
      title: "Briefing Nova CEO",
      detail: "Preparing the Lead Gen Director briefing for the Nova CEO AI Agent.",
    });

    const response = await fetch("/api/agent/director/nova", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Review lead-gen progress, identify the bottleneck, and push the next calendar-producing action.",
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Nova briefing blocked",
        detail: payload.detail || payload.error || "The Director could not brief Nova.",
      });
      setNovaBusy(false);
      return;
    }

    setNovaBriefResult(payload);
    setActionToast({
      phase: "success",
      title: payload.posted ? "Nova briefed" : "Nova brief prepared",
      detail: payload.posted
        ? `Brief posted to ${payload.targetAgent}.`
        : `${payload.targetAgent} brief is ready internally. Check Slack configuration if it did not post.`,
    });
    setOperationStatus(payload.nextMove || "Lead Gen Director prepared the Nova CEO briefing.");
    await refreshOpsData();
    setNovaBusy(false);
  }

  async function runFullLeadCommandAudit() {
    if (auditBusy) return;
    setAuditBusy(true);
    setActionToast({
      phase: "loading",
      title: "Vega audit running",
      detail: "Checking source, web helper, outreach, replies, booking, deliverability, CRM, and Mission Control lanes.",
    });

    const response = await fetch("/api/agent/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postToSlack: true }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Vega audit blocked",
        detail: payload.detail || payload.error || "The full audit could not complete.",
      });
      setAuditBusy(false);
      return;
    }

    setLeadCommandAudit(payload);
    setActionToast({
      phase: "success",
      title: "Vega audit complete",
      detail: payload.bottleneck || "Lead Command audit posted to the c-suite channel.",
    });
    setOperationStatus(payload.nextMove || "Vega completed the Lead Command audit.");
    await refreshOpsData();
    setAuditBusy(false);
  }

  async function runSignalCollector(commit = false) {
    if (collectorBusy) return;
    setCollectorBusy(true);
    setActionToast({
      phase: "loading",
      title: commit ? "Signal collector importing" : "Signal collector previewing",
      detail: "Running buying-signal plays across configured source providers.",
    });

    const response = await fetch("/api/agent/signal-collector", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commit,
        autoQueue: true,
        autoSend: outreachStatus.mode === "live",
        queueLimit: 8,
        size: 20,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Signal collector blocked",
        detail: payload.detail || payload.error || "The signal collector could not run.",
      });
      setCollectorBusy(false);
      return;
    }

    setSignalCollectorResult(payload);
    setSourceResults(payload.qualified || []);
    setActionToast({
      phase: "success",
      title: commit ? "Signals imported" : "Signal preview ready",
      detail: commit
        ? `Imported ${payload.imported || 0}, queued ${payload.queued || 0}.`
        : `Qualified ${payload.qualified?.length || 0} signal leads.`,
    });
    setOperationStatus(
      commit
        ? `Signal collector imported ${payload.imported || 0} leads and queued ${payload.queued || 0} touches.`
        : `Signal collector previewed ${payload.qualified?.length || 0} qualified leads.`,
    );
    await refreshOpsData();
    if (commit) await refreshLeads();
    setCollectorBusy(false);
  }

  async function runSelfTuningAgent() {
    if (tuningBusy) return;
    setTuningBusy(true);
    setActionToast({
      phase: "loading",
      title: "Self-tuning agent running",
      detail: "Activating high-signal source campaigns based on current learning data.",
    });

    const response = await fetch("/api/agent/tune", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Self-tuning blocked",
        detail: payload.detail || payload.error || "The tuning agent could not complete.",
      });
      setTuningBusy(false);
      return;
    }

    setActionToast({
      phase: "success",
      title: "Self-tuning complete",
      detail: payload.message || "Recommended source campaigns are active.",
    });
    setOperationStatus(payload.message || "Self-tuning agent updated source campaigns.");
    await refreshOpsData();
    setTuningBusy(false);
  }

  async function runVegaSpecialist(kind: VegaSpecialistKind) {
    if (specialistBusy) return;
    setSpecialistBusy(kind);
    setActionToast({
      phase: "loading",
      title: "Vega specialist running",
      detail: `Running ${kind} specialist lane.`,
    });

    const response = await fetch("/api/agent/specialists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, limit: 10 }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Specialist blocked",
        detail: payload.detail || payload.error || "Vega specialist lane could not finish.",
      });
      setSpecialistBusy(null);
      return;
    }

    setSpecialistResult(payload);
    setActionToast({
      phase: "success",
      title: payload.title || "Specialist complete",
      detail: payload.summary || "Vega specialist lane finished.",
    });
    setOperationStatus(payload.nextMove || payload.summary || "Vega specialist lane finished.");
    await refreshOpsData();
    await refreshLeads();
    if (["copy-chief", "cadence", "contact-path", "full-team"].includes(kind)) setActive("queue");
    if (kind === "waitlist") setActive("waitlist");
    if (kind === "booking") setActive("proposal");
    setSpecialistBusy(null);
  }

  async function runVegaClosingSprint(autoApprove = false) {
    if (closingSprintBusy) return;
    setClosingSprintBusy(true);
    setActionToast({
      phase: "loading",
      title: "Closing sprint running",
      detail: autoApprove ? "Vega is running the sprint and approving a batch if available." : "Vega is running the weekly close target loop.",
    });

    const response = await fetch("/api/agent/closing-sprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: autoApprove ? "Vega closing sprint approve 10" : "Vega closing sprint for 10 closes this week",
        autoApprove,
        queueLimit: 10,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Closing sprint blocked",
        detail: payload.detail || payload.error || "Vega closing sprint could not finish.",
      });
      setClosingSprintBusy(false);
      return;
    }

    setClosingSprintResult(payload);
    setActionToast({
      phase: "success",
      title: "Closing sprint complete",
      detail: payload.summary || "Vega closing sprint finished.",
    });
    setOperationStatus(payload.nextMoves?.[0] || payload.summary || "Vega closing sprint finished.");
    await refreshOpsData();
    await refreshLeads();
    if (["approvals", "follow-up-cadence", "contact-path", "outbound-volume", "fresh-sourcing"].includes(payload.bottleneck)) setActive("queue");
    if (["booking-handoff", "close-mode"].includes(payload.bottleneck)) setActive("proposal");
    setClosingSprintBusy(false);
  }

  async function runVegaDominanceLoop() {
    if (dominanceBusy) return;
    setDominanceBusy(true);
    setActionToast({
      phase: "loading",
      title: "Dominance loop running",
      detail: "Vega is running source, signal, specialist, booking, deliverability, and closing lanes.",
    });

    const response = await fetch("/api/agent/dominance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "Vega dominance loop from Mission Control" }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Dominance loop blocked",
        detail: payload.detail || payload.error || "Vega dominance loop could not finish.",
      });
      setDominanceBusy(false);
      return;
    }

    setActionToast({
      phase: "success",
      title: "Dominance loop complete",
      detail: payload.bottleneck ? `Bottleneck: ${payload.bottleneck}` : payload.summary || "Vega dominance loop finished.",
    });
    setOperationStatus(payload.nextMoves?.[0] || payload.summary || "Vega dominance loop finished.");
    await refreshOpsData();
    await refreshLeads();
    setActive(payload.metrics?.bookedCalls || payload.metrics?.pendingApprovals ? "queue" : "agents");
    setDominanceBusy(false);
  }

  async function runMorningStandup() {
    if (standupBusy) return;
    setStandupBusy(true);
    setActionToast({
      phase: "loading",
      title: "Morning standup running",
      detail: "Posting the Stephen, Nova, and Vega lead-gen standup.",
    });

    const response = await fetch("/api/agent/morning-standup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Manual Nova x Vega morning standup" }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Standup blocked",
        detail: payload.detail || payload.error || "Morning standup could not post.",
      });
      setStandupBusy(false);
      return;
    }

    setActionToast({
      phase: "success",
      title: "Standup posted",
      detail: `Bottleneck: ${payload.bottleneck || "unknown"}.`,
    });
    setOperationStatus(payload.stephenAsk || "Morning standup posted to Slack.");
    await refreshOpsData();
    setStandupBusy(false);
  }

  async function runVegaOpsLoop(execute = true) {
    if (opsLoopBusy) return;
    setOpsLoopBusy(true);
    setActionToast({
      phase: "loading",
      title: execute ? "Vega ops loop running" : "Vega ops brief running",
      detail: execute ? "Vega is collecting sub-agent reports and running safe autonomy lanes." : "Vega is preparing the sub-agent command brief.",
    });

    const response = await fetch("/api/agent/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: execute ? "Manual Vega ops loop from Mission Control" : "Manual Vega ops brief from Mission Control",
        execute,
        briefNova: true,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Ops loop blocked",
        detail: payload.detail || payload.error || "Vega ops loop could not finish.",
      });
      setOpsLoopBusy(false);
      return;
    }

    setActionToast({
      phase: "success",
      title: execute ? "Ops loop complete" : "Ops brief posted",
      detail: payload.summary || "Vega ops command brief posted.",
    });
    setOperationStatus(payload.stephenAsk || payload.nextMove || payload.summary || "Vega ops loop finished.");
    await refreshOpsData();
    await refreshLeads();
    setOpsLoopBusy(false);
  }

  async function runVegaRevenueWatch() {
    if (watchBusy) return;
    setWatchBusy(true);
    setActionToast({
      phase: "loading",
      title: "Revenue watch running",
      detail: "Vega is checking SendGrid, replies, booking tasks, and source performance.",
    });

    const response = await fetch("/api/agent/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "Manual Vega revenue watch from Mission Control", execute: true }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setActionToast({
        phase: "error",
        title: "Revenue watch blocked",
        detail: payload.detail || payload.error || "Vega revenue watch could not finish.",
      });
      setWatchBusy(false);
      return;
    }

    setActionToast({
      phase: "success",
      title: "Revenue watch complete",
      detail: payload.summary || "Vega revenue watch finished.",
    });
    setOperationStatus(payload.nextMove || payload.summary || "Vega revenue watch finished.");
    await refreshOpsData();
    await refreshLeads();
    setWatchBusy(false);
  }

  async function ensureSelectedLeadRecord() {
    if (forceDemoMode) return selectedLead;
    if (selectedLead.id) return selectedLead;

    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: selectedLead.name,
        companyName: selectedLead.company,
        niche: selectedLead.niche,
        stage: selectedLead.stage,
        score: selectedLead.score,
        value: selectedLead.value,
        source: selectedLead.source,
        lastTouch: selectedLead.lastTouch,
        nextAction: selectedLead.next,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const mapped = mapApiLead(payload.lead);
    selectLead(mapped);
    setLiveLeads((current) =>
      current.map((lead) => (lead.company === selectedLead.company ? mapped : lead)),
    );
    return mapped;
  }

  async function queueSelectedLead(channel: "email" | "sms" = "email") {
    if (forceDemoMode) {
      setActionToast({
        phase: "error",
        title: "Demo mode active",
        detail: "Disable demo mode before adding live outreach to the approval queue.",
      });
      return;
    }
    setActionToast({
      phase: "loading",
      title: "Adding to approval queue",
      detail: `Saving ${selectedLead.company} and preparing the ${channel} draft.`,
    });

    const leadToQueue = await ensureSelectedLeadRecord();
    if (!leadToQueue?.id) {
      setActionToast({
        phase: "error",
        title: "Queue failed",
        detail: "Could not save this lead before queueing outreach.",
      });
      return;
    }

    const body = channel === "sms" ? smsOpener : emailFollowup;
    const response = await fetch("/api/outreach/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: leadToQueue.id,
        channel,
        provider: channel === "sms" ? outreachStatus.smsProvider : "sendgrid",
        subject: channel === "email" ? outreachSubject : undefined,
        body,
        reason: "Queued from Lead Command approval workflow.",
      }),
    });

    if (response.ok) {
      const payload = await response.json();
      await refreshOpsData();
      setActionToast({
        phase: "success",
        title: payload.duplicate ? "Already in queue" : "Queued for approval",
        detail: `${leadToQueue.company} is ready for review in the queue.`,
      });
      addAutomationEvent({
        title: "Outreach queued",
        detail: `${leadToQueue.company} has a ${channel} draft waiting for approval.`,
        status: "done",
      });
      setActive("queue");
      window.setTimeout(() => setActionToast(null), 2200);
    } else {
      setActionToast({
        phase: "error",
        title: "Queue blocked",
        detail: "Suppression rules or missing lead data blocked this draft.",
      });
    }
  }

  function openApprovalReview(item: QueueItem) {
    setApprovalItem(item);
    setApprovalSubject(item.subject || "");
    setApprovalBody(item.body);
  }

  async function approveQueueItem() {
    if (!approvalItem) return;
    setApprovalBusy(true);
    setActionToast({
      phase: "loading",
      title: outreachStatus.mode === "dry-run" ? "Approving dry-run" : "Sending outreach",
      detail: `${approvalItem.lead?.company || approvalItem.lead?.companyName || "Queued outreach"} is being processed.`,
    });
    const response = await fetch(`/api/outreach/queue/${encodeURIComponent(approvalItem.id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: approvalSubject,
        body: approvalBody,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const delivery = payload.delivery;
      const state = delivery?.dryRun ? "queued in dry-run" : delivery?.status || "approved";
      if (payload.item) {
        setQueueItems((current) =>
          current.map((item) => (item.id === payload.item.id ? payload.item : item)),
        );
      }
      setOperationStatus(`Approved queue item and ${state}.`);
      addAutomationEvent({
        title: "Approval processed",
        detail: `${approvalItem.lead?.company || approvalItem.lead?.companyName || "Queued outreach"} ${state}.`,
        status: "done",
      });
      setActionToast({
        phase: "success",
        title: delivery?.dryRun ? "Approved and queued" : "Approved",
        detail: delivery?.message || "Timeline updated for this lead.",
      });
      setApprovalItem(null);
      window.setTimeout(() => setActionToast(null), 2400);
    } else {
      setOperationStatus("Approval failed.");
      setActionToast({
        phase: "error",
        title: "Approval blocked",
        detail: payload.error || "The queue item could not be approved.",
      });
    }
    setApprovalBusy(false);
    await refreshOpsData();
    await refreshLeads();
  }

  async function redoQueueItem(id: string) {
    setQueueActionId(id);
    setActionToast({
      phase: "loading",
      title: "Rewriting draft",
      detail: "Vega is sharpening this queued outreach.",
    });
    const response = await fetch(`/api/outreach/queue/${encodeURIComponent(id)}/redo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.item) {
      setQueueItems((current) => current.map((item) => (item.id === payload.item.id ? payload.item : item)));
      setOperationStatus("Rewrote queued outreach draft.");
      setActionToast({
        phase: "success",
        title: "Draft rewritten",
        detail: payload.copyScore?.total ? `Offer-copy score ${payload.copyScore.total}.` : "The queue card is updated.",
      });
      addAutomationEvent({
        title: "Outreach draft rewritten",
        detail: "A queued email was rewritten from the approval queue.",
        status: "done",
      });
      window.setTimeout(() => setActionToast(null), 2400);
    } else {
      setActionToast({
        phase: "error",
        title: "Redo blocked",
        detail: payload.error || "The queued draft could not be rewritten.",
      });
    }
    setQueueActionId(null);
    await refreshOpsData();
  }

  async function rejectQueueItem(id: string) {
    setQueueActionId(id);
    setActionToast({
      phase: "loading",
      title: "Rejecting queue item",
      detail: "Removing this item from the pending send path.",
    });
    const response = await fetch(`/api/outreach/queue/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Rejected in approval queue." }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      if (payload.item) {
        setQueueItems((current) => current.map((item) => (item.id === payload.item.id ? payload.item : item)));
      } else {
        setQueueItems((current) => current.filter((item) => item.id !== id));
      }
      setOperationStatus("Rejected queue item.");
      setActionToast({
        phase: "success",
        title: "Queue item rejected",
        detail: "This item is no longer pending approval.",
      });
      addAutomationEvent({
        title: "Outreach rejected",
        detail: "A queued draft was rejected before send.",
        status: "done",
      });
      window.setTimeout(() => setActionToast(null), 2200);
    } else {
      setOperationStatus("Reject failed.");
      setActionToast({
        phase: "error",
        title: "Reject blocked",
        detail: payload.error || "The queue item could not be rejected.",
      });
    }
    setQueueActionId(null);
    await refreshOpsData();
  }

  async function markAppointmentSet(card: QueueBoardCard) {
    const leadId = card.leadId || card.lead?.id;
    if (!leadId) {
      setActionToast({
        phase: "error",
        title: "Appointment blocked",
        detail: "This card is not attached to a saved lead yet.",
      });
      return;
    }
    setQueueActionId(card.id);
    setActionToast({
      phase: "loading",
      title: "Setting appointment stage",
      detail: `${card.title} is moving into the Potential Client pipeline stage.`,
    });
    const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/interactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "appointment",
        direction: "operator",
        classification: "appointment-set",
        body: `Appointment set from Queue board. Source card: ${card.kind}.`,
        nextStage: "Potential Client",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const mapped = mapApiLead(payload.lead);
      setLiveLeads((current) => current.map((lead) => (lead.id === mapped.id ? mapped : lead)));
      if (selectedLead.id === mapped.id) selectLead(mapped);
      setOperationStatus(`${mapped.company} moved to Potential Client.`);
      setActionToast({
        phase: "success",
        title: "Appointment set",
        detail: "Pipeline updated to Potential Client.",
      });
      addAutomationEvent({
        title: "Appointment set",
        detail: `${mapped.company} moved from queue operations into the Potential Client stage.`,
        status: "done",
      });
      window.setTimeout(() => setActionToast(null), 2400);
      await refreshLeads();
      await refreshOpsData();
    } else {
      setActionToast({
        phase: "error",
        title: "Appointment blocked",
        detail: payload.error || "Could not update the lead stage.",
      });
    }
    setQueueActionId(null);
  }

  async function sendTwilioTest() {
    setTwilioTestBusy(true);
    setActionToast({
      phase: "loading",
      title: "Testing Twilio",
      detail: "Sending a guarded owner test through the Twilio provider.",
    });

    const response = await fetch("/api/twilio/test", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const delivery = payload.delivery;
      setActionToast({
        phase: "success",
        title: delivery?.dryRun ? "Dry-run queued" : "Twilio test sent",
        detail: delivery?.message || `Provider status: ${delivery?.status || "received"}.`,
      });
      setOperationStatus(
        delivery?.dryRun
          ? "Twilio owner test queued in dry-run mode."
          : "Twilio owner test sent. Check the test phone and message logs.",
      );
      await refreshOpsData();
      window.setTimeout(() => setActionToast(null), 2600);
    } else {
      setActionToast({
        phase: "error",
        title: "Twilio test blocked",
        detail: payload.error || payload.detail || "The owner test could not run.",
      });
    }
    setTwilioTestBusy(false);
  }

  async function logout() {
    await fetch("/api/access/logout", { method: "POST" });
    window.location.replace("/access");
  }

  async function recordReply() {
    if (!selectedLead.id || !replyDraft.trim()) return;
    const response = await fetch("/api/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: selectedLead.id,
        channel: "email",
        from: selectedLead.name,
        body: replyDraft,
        source: "manual",
      }),
    });

    if (response.ok) {
      const payload = await response.json();
      if (payload.lead) {
        const mapped = mapApiLead(payload.lead);
        selectLead(mapped);
        setLiveLeads((current) => current.map((lead) => (lead.id === mapped.id ? mapped : lead)));
        if (String(payload.reply?.classification || "").toLowerCase().includes("booked")) {
          await runBookingAgent(mapped, "manual reply");
        } else {
          addAutomationEvent({
            title: "Reply classified",
            detail: `${mapped.company} reply classified as ${payload.reply?.classification || "needs review"}.`,
            status: "done",
          });
        }
      }
      setOperationStatus(
        payload.route
          ? `Reply classified as ${payload.reply.classification}. Next action updated.`
          : "Reply recorded and classified.",
      );
      setReplyDraft("");
      await refreshOpsData();
      await refreshLeads();
    }
  }

  async function syncSelectedLeadToCrm() {
    if (forceDemoMode) {
      setOperationStatus("Demo mode is active. Disable demo mode before syncing to GhostCRM.");
      return;
    }
    if (!integrations.ghostcrm?.configured) {
      setOperationStatus("GhostCRM sync is not fully configured. Finish the endpoint and API key first.");
      return;
    }
    if (integrations.ghostcrm?.reachable === false) {
      setOperationStatus(`GhostCRM sync is not reachable yet. ${integrations.ghostcrm.detail || "Check the GhostCRM backend."}`);
      return;
    }
    if (!["Replied", "Call Booked", "Proposal Sent", "Won"].includes(selectedLead.stage)) {
      setOperationStatus("GhostCRM sync held back. Qualify the lead before pushing it into CRM.");
      return;
    }
    if (!selectedLead.id) return;
    const response = await fetch("/api/crm/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: selectedLead.id }),
    });

    if (!response.ok) {
      setOperationStatus("GhostCRM sync failed.");
      return;
    }

    const payload = await response.json();
    const mapped = mapApiLead(payload.lead);
    selectLead(mapped);
    setLiveLeads((current) => current.map((lead) => (lead.id === mapped.id ? mapped : lead)));
    setOperationStatus(payload.sync.message);
    await refreshOpsData();
  }

  async function addSuppression() {
    if (!suppressionValue.trim()) return;
    const value = suppressionValue.trim();
    const response = await fetch("/api/suppression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: value.includes("@") ? "email" : value.includes(".") ? "domain" : "company",
        value,
        reason: "Manual suppression",
        source: "command",
      }),
    });

    if (response.ok) {
      setSuppressionValue("");
      setOperationStatus("Suppression added.");
      await refreshOpsData();
    }
  }

  async function saveLeadEdits() {
    await updateLead(selectedLead.id, {
      score: Number(editScore || selectedLead.score),
      value: Number(editValue || selectedLead.value),
      next: editNextAction,
    });
  }

  async function classifyReply() {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "classifier",
        lead: {
          name: selectedLead.name,
          companyName: selectedLead.company,
          niche: selectedLead.niche,
        },
        input: replyText,
      }),
    });
    if (!response.ok) {
      setOperationStatus("Reply classification failed.");
      return;
    }
    const payload = await response.json();
    const classification = String(payload.text || "needs review").trim().toLowerCase();
    setReplyClassification(classification);
    setOperationStatus(`Reply classified as ${classification}.`);

    if (selectedLead.id) {
      const nextStage: Stage | undefined =
        classification.includes("booked")
          ? "Call Booked"
          : classification.includes("hot")
            ? "Replied"
            : undefined;
      await fetch(`/api/leads/${encodeURIComponent(selectedLead.id)}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "reply",
          direction: "inbound",
          body: replyText,
          classification,
          nextStage,
        }),
      });
      await refreshLeads();
      if (classification.includes("booked")) {
        await runBookingAgent({ ...selectedLead, stage: "Call Booked", lastTouch: "Just now" }, "reply classifier");
      } else {
        addAutomationEvent({
          title: "Reply classified",
          detail: `${selectedLead.company} classified as ${classification}.`,
          status: "done",
        });
      }
    }
  }

  async function runBookingAgent(lead: Lead = selectedLead, source = "operator") {
    const prep = buildBookingPrep(lead);
    setCallPrep(prep.map((item) => item.detail).join("\n"));
    setSequenceMode("booked");
    setActive("proposal");

    if (!forceDemoMode && lead.id && lead.stage !== "Call Booked") {
      await updateLead(lead.id, {
        stage: "Call Booked",
        lastTouch: "Just now",
        next: `Confirm calendar slot, attach meeting link, and prep the ${lead.company} discovery call.`,
      });
    }

    addAutomationEvent({
      title: "Booking Agent triggered",
      detail: `${lead.company} moved into call prep from ${source}. Discovery workflow prepared.`,
      status: "done",
    });
    addAutomationEvent({
      title: "Calendar event blocked",
      detail: "Calendar owner, provider auth, and Zoom/meeting-link config are not connected yet.",
      status: "blocked",
    });
    addAutomationEvent({
      title: "Slack booking alert blocked",
      detail: "Slack webhook/channel config is not connected yet.",
      status: "blocked",
      type: "slack",
    });
    if (lead.id && !forceDemoMode) {
      const response = await fetch("/api/automation/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          meetingTitle: `Discovery call: ${lead.company}`,
          prepNotes: prep.map((item) => item.detail).join("\n"),
        }),
      });
      if (response.ok) {
        const payload = await response.json();
        setBookingTasks((current) => [payload.task, ...current].slice(0, 12));
      }
    }
    setOperationStatus(`Booking Agent prepared call workflow for ${lead.company}.`);
  }

  async function draftSequenceQueue() {
    if (!selectedLead.id || forceDemoMode) {
      addAutomationEvent({
        title: "Sequence draft blocked",
        detail: forceDemoMode ? "Disable demo mode before saving live sequence steps." : "Save the lead before drafting sequence steps.",
        status: "blocked",
        type: "sequence",
      });
      return;
    }
    const steps = sequenceSteps.map((step, index) => ({
      stepNumber: index + 1,
      dayOffset: parseSequenceDay(step.day),
      channel: step.channel,
      provider: step.channel.toLowerCase() === "sms" ? outreachStatus.smsProvider : "sendgrid",
      subject: step.channel.toLowerCase() === "email" ? `${selectedLead.company} follow-up` : undefined,
      body: step.copy,
    }));
    const response = await fetch("/api/automation/sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: selectedLead.id, steps }),
    });
    if (response.ok) {
      const payload = await response.json();
      setSequenceQueue((current) => [...(payload.steps || []), ...current].slice(0, 20));
      addAutomationEvent({
        title: "Sequence drafted",
        detail: `${steps.length} approval-ready touches saved for ${selectedLead.company}.`,
        status: "done",
        type: "sequence",
      });
    } else {
      addAutomationEvent({
        title: "Sequence draft failed",
        detail: "The sequence could not be saved. Check schema/database readiness.",
        status: "blocked",
        type: "sequence",
      });
    }
  }

  async function createProposalFromLead() {
    if (!selectedLead.id) return;
    const response = await fetch(
      `/api/leads/${encodeURIComponent(selectedLead.id)}/proposal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: editNextAction,
        }),
      },
    );
    if (!response.ok) {
      setOperationStatus("Proposal generation failed.");
      return;
    }
    const payload = await response.json();
    const mapped = mapApiLead(payload.lead);
    selectLead(mapped);
    setLiveLeads((current) =>
      current.map((lead) => (lead.id === mapped.id ? mapped : lead)),
    );
    setProposalSummary(payload.proposal.summary);
    setProposalShareUrl(payload.proposalShareUrl || "");
    setOperationStatus(`Created proposal and queued follow-up approval for ${mapped.company}.`);
  }

  const stats = useMemo(() => {
    const pipeline = leads.reduce((sum, lead) => sum + lead.value, 0);
    const won = leads
      .filter((lead) => lead.stage === "Won")
      .reduce((sum, lead) => sum + lead.value, 0);
    const hot = leads.filter((lead) => lead.score >= 80).length;
    const calls = leads.filter((lead) => lead.stage === "Call Booked").length;
    return { pipeline, won, hot, calls };
  }, [leads]);
  const nextBestLead = useMemo(
    () => [...leads].sort((a, b) => b.score - a.score || b.value - a.value)[0] || seedLeads[0],
    [leads],
  );
  const qrRelationships = useMemo(
    () =>
      leads.filter(
        (lead) =>
          relationshipStages.includes(lead.stage) ||
          lead.source === "qr_contact_card" ||
          lead.next.toLowerCase().includes("qr contact exchange"),
      ),
    [leads],
  );
  const dataMode = forceDemoMode
    ? "demo"
    : operationStatus.toLowerCase().includes("database connected")
    ? "live"
    : operationStatus.toLowerCase().includes("fallback")
      ? "demo"
      : "connecting";
  const liveDataReady = dataMode === "live" && !forceDemoMode;
  const nextBestAction = buildNextBestAction(nextBestLead, dataMode === "demo");
  const sourceGuardrails = [
    `Score ${Number(sourceMinScore || 82)}+`,
    "At least one buyer signal",
    "Business email or phone",
    "Decision-maker role",
    "No associations, schools, or obvious non-buyers",
  ];
  const sequenceSteps = buildOutreachSequence(selectedLead, sequenceMode);
  const automationLanes = buildAutomationLanes(integrations, outreachStatus);
  const waitlistContestants = waitlistDashboard?.leads || [];
  const filteredWaitlistContestants = waitlistContestants.filter((lead) => {
    const tags = lead.waitlistTags || [];
    const fields = lead.waitlistFields || {};
    if (waitlistFilter === "all") return true;
    if (waitlistFilter === "source") return Boolean(fields.signupSource);
    if (waitlistFilter === "date") {
      const joined = new Date(String(fields.originalJoinedAt || lead.createdAt));
      return waitlistNow - joined.getTime() <= 7 * 24 * 60 * 60 * 1000;
    }
    return tags.includes(waitlistFilter);
  });

  const readinessItems = [
    {
      label: "Database",
      ok: liveDataReady,
      detail: forceDemoMode ? "Manual demo mode is active. Live writes are paused." : operationStatus,
    },
    {
      label: "People Data Labs",
      ok: sourcingStatus.pdlConfigured,
      detail: sourcingStatus.pdlConfigured ? "PDL key configured for source search." : "Add PDL_API_KEY before buying contact volume.",
    },
    {
      label: "Mock sourcing",
      ok: !sourcingStatus.mockSourceEnabled,
      detail: sourcingStatus.mockSourceEnabled ? "Demo contacts are enabled." : "Demo contacts are disabled for production sourcing.",
    },
    {
      label: "Lead intake webhook",
      ok: Boolean(integrations.leadIntake?.configured),
      detail: integrations.leadIntake?.configured
        ? "External lead intelligence can securely post into /api/source/intake."
        : "Add LEAD_INTAKE_SECRET so ghostai.solutions and outside collectors can feed Lead Command.",
    },
    {
      label: "Google signal source",
      ok: Boolean(integrations.serpapi?.configured),
      detail: integrations.serpapi?.configured
        ? "SerpAPI configured for Google/search signal collectors."
        : "Add SERPAPI_API_KEY to power Google search, Maps, and local intent sourcing.",
    },
    {
      label: "LinkedIn signal source",
      ok: Boolean(integrations.linkedin?.configured),
      detail: integrations.linkedin?.configured
        ? `LinkedIn configured. Token ${integrations.linkedin.accessToken || "unknown"}, OAuth ${integrations.linkedin.oauthClient || "unknown"}.`
        : "Add LinkedIn access token or OAuth client settings for LinkedIn signal ingestion.",
    },
    {
      label: "Outreach mode",
      ok: outreachStatus.mode === "live",
      detail:
        outreachStatus.mode === "live"
          ? "Live sending is enabled. Keep approvals tight."
          : "Dry-run mode is active. Good for testing, but it will not create revenue.",
    },
    {
      label: "SendGrid",
      ok: outreachStatus.mode !== "live" || outreachStatus.sendgridConfigured,
      detail: outreachStatus.sendgridConfigured ? "Email provider configured." : "SendGrid not configured.",
    },
    {
      label: "Telnyx",
      ok: outreachStatus.mode !== "live" || outreachStatus.telnyxConfigured,
      detail: outreachStatus.telnyxConfigured ? "Preferred SMS provider configured." : "Telnyx not configured.",
    },
    {
      label: "GhostCRM sync",
      ok: Boolean(integrations.ghostcrm?.configured && integrations.ghostcrm?.reachable !== false),
      detail: integrations.ghostcrm?.configured
        ? `Endpoint and API key configured. Organization ${integrations.ghostcrm?.organizationId || "api-key-default"}. ${integrations.ghostcrm?.detail || "Qualified leads only."}`
        : "GhostCRM sync needs endpoint and API key configuration.",
    },
    {
      label: "Calendar and Zoom",
      ok: Boolean(integrations.calendar?.configured && (integrations.zoom?.configured || integrations.zoom?.meetingLink === "static")),
      detail: integrations.calendar?.configured
        ? `Calendar ${integrations.calendar.provider || "configured"} with owner ${integrations.calendar.owner || "missing"}. Zoom link ${integrations.zoom?.meetingLink || "missing"}.`
        : "Next integration lane: create calendar events with meeting links after booked replies.",
    },
    {
      label: "Slack alerts",
      ok: Boolean(integrations.slack?.configured && integrations.slack?.channel === "configured"),
      detail: integrations.slack?.configured
        ? `Slack configured. Ops channel ${integrations.slack.channel || "missing"}.`
        : "Next integration lane: notify when hot replies, bookings, failed sends, and CRM syncs happen.",
    },
    {
      label: "Operator guardrails",
      ok: Boolean(integrations.operator?.configured),
      detail: integrations.operator?.configured
        ? `Daily source cap ${integrations.operator.dailySourceLimit}, queue cap ${integrations.operator.dailyQueueLimit}, pending cap ${integrations.operator.maxPendingApprovals}. Auto-send ${integrations.operator.autoSend ? "on" : "off"}.`
        : "Autonomous runs need daily caps before unattended sourcing.",
    },
    {
      label: "Approval queue",
      ok: queueItems.filter((item) => item.status === "pending").length < 25,
      detail: `${queueItems.filter((item) => item.status === "pending").length} drafts waiting for approval.`,
    },
  ];

  const outreachCopy = buildOutreachCopy(selectedLead);
  const smsOpener = smsDraft || outreachCopy.sms;
  const emailFollowup = emailDraft || outreachCopy.email;
  const outreachSubject = emailSubjectDraft || outreachCopy.subject;
  const outreachAngle = isFreshSourcedLead(selectedLead) ? "Fresh lead" : "Revival";
  const projectOfferLines = buildProjectOfferLines(selectedLead);
  const twilioHealth = integrations.twilio || {};
  const twilioReady =
    Boolean(twilioHealth.configured) &&
    Boolean(twilioHealth.messagingWebhook === "configured") &&
    Boolean(twilioHealth.voiceWebhook === "configured");

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="grid min-h-screen lg:grid-cols-[272px_1fr]">
        <aside className="border-b border-white/10 bg-[#101417] px-4 py-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3 px-2 py-3">
            <div className="grid size-10 place-items-center rounded-md bg-[#d8ff5f] text-[#111]">
              <Radar size={22} />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-[#9fb0a8]">
                Ghost
              </p>
              <h1 className="text-xl font-semibold">Lead Command</h1>
            </div>
          </div>

          <nav className="mt-6 grid gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  onClick={() => setActive(item.id)}
                  className={`flex items-center gap-3 rounded-md px-3 py-3 text-left text-sm transition ${
                    isActive
                      ? "bg-white text-[#101417]"
                      : "text-[#c8d2cf] hover:bg-white/8 hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <section className="mt-8 rounded-md border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Money Path</p>
              <Sparkles size={16} className="text-[#d8ff5f]" />
            </div>
            <div className="mt-4 space-y-3 text-sm text-[#b6c4bf]">
              <p>Import leads</p>
              <p>Revive interest</p>
              <p>Book audit calls</p>
              <p>Demo an agent</p>
              <p>Send proposal</p>
              <p>Install and retain</p>
            </div>
          </section>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-white/10 bg-[#151a1e] px-5 py-5 md:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.16em] text-[#83d0c2]">
                  AI consultant lead-to-cash cockpit
                </p>
                <h2 className="mt-2 max-w-4xl text-3xl font-semibold tracking-normal md:text-5xl">
                  Revive dead leads, book calls, demo agents, close retainers.
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  title="Run AI operator"
                  onClick={runAiOperator}
                  disabled={agentBusy}
                  className="grid size-11 place-items-center rounded-md bg-[#83d0c2] text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {agentBusy ? <LoaderCircle className="animate-spin" size={20} /> : <Rocket size={20} />}
                </button>
                <button
                  type="button"
                  title="Lock command center"
                  onClick={logout}
                  className="grid size-11 place-items-center rounded-md bg-white/[0.08] text-[#d6dfdc] transition hover:bg-white hover:text-[#101417]"
                >
                  <LogOut size={20} />
                </button>
                <button
                  type="button"
                  title="Import leads"
                  onClick={() => setActive("revival")}
                  className="grid size-11 place-items-center rounded-md bg-white text-[#101417] transition hover:bg-[#d8ff5f]"
                >
                  <Upload size={20} />
                </button>
                <button
                  type="button"
                  title="Dispatch outreach"
                  onClick={() => setActive("outreach")}
                  className="grid size-11 place-items-center rounded-md bg-[#d8ff5f] text-[#101417] transition hover:bg-white"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </header>

          {actionToast && (
            <div className="fixed right-6 top-6 z-50 w-[min(360px,calc(100vw-32px))] rounded-md border border-[#83d0c2]/35 bg-[#111815] p-4 text-sm text-[#d6dfdc] shadow-2xl shadow-black/40">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-[#d8ff5f] text-[#101417]">
                  {actionToast.phase === "loading" ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : actionToast.phase === "success" ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <Flame size={18} />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-white">{actionToast.title}</p>
                  <p className="mt-1 leading-5 text-[#aebbb7]">{actionToast.detail}</p>
                </div>
              </div>
            </div>
          )}

          {approvalItem && (
            <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-4 py-6">
              <div className="w-full max-w-2xl rounded-md border border-white/10 bg-[#111815] p-5 text-[#d6dfdc] shadow-2xl shadow-black/50">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-[#83d0c2]">
                      Final approval
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-white">
                      {approvalItem.lead?.company || approvalItem.lead?.companyName || "Queued outreach"}
                    </h2>
                    <p className="mt-1 text-sm text-[#9fb0a8]">
                      {approvalItem.channel}:{approvalItem.provider} - {outreachStatus.mode === "dry-run" ? "dry-run queue" : "live send"}
                    </p>
                  </div>
                  <span className="rounded-md bg-[#d8ff5f]/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#d8ff5f]">
                    {outreachStatus.mode === "dry-run" ? "Safe approval" : "Live send"}
                  </span>
                </div>

                {approvalItem.channel === "email" && (
                  <label className="mt-5 grid gap-2 text-xs uppercase tracking-[0.12em] text-[#8fa09a]">
                    Subject
                    <input
                      value={approvalSubject}
                      onChange={(event) => setApprovalSubject(event.target.value)}
                      className="rounded-md border border-white/10 bg-[#101417] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-[#83d0c2]"
                    />
                  </label>
                )}

                <label className="mt-4 grid gap-2 text-xs uppercase tracking-[0.12em] text-[#8fa09a]">
                  Message
                  <textarea
                    value={approvalBody}
                    onChange={(event) => setApprovalBody(event.target.value)}
                    className="min-h-52 resize-y rounded-md border border-white/10 bg-[#101417] p-3 text-sm leading-6 text-[#d6dfdc] outline-none focus:border-[#83d0c2]"
                  />
                </label>

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setApprovalItem(null)}
                    disabled={approvalBusy}
                    className="rounded-md bg-white/[0.08] px-4 py-2 text-sm font-semibold text-[#d6dfdc] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={approveQueueItem}
                    disabled={approvalBusy || !approvalBody.trim()}
                    className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {approvalBusy && <LoaderCircle className="animate-spin" size={16} />}
                    {outreachStatus.mode === "dry-run" ? "Approve Dry-Run" : "Approve & Send"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6 px-5 py-6 md:px-8">
            {active !== "queue" && (
              <StatusBanner mode={dataMode} message={operationStatus} />
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-[#101417] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  {liveDataReady ? "Live operating mode" : "Protected operating mode"}
                </p>
                <p className="mt-1 text-xs text-[#9fb0a8]">
                  {liveDataReady
                    ? "Database writes, approvals, CRM sync, and imports are enabled."
                    : "Live write actions are guarded while demo mode or database issues are active."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setForceDemoMode((current) => !current)}
                  className={`rounded-md px-3 py-2 text-xs font-semibold ${
                    forceDemoMode
                      ? "bg-[#d8ff5f] text-[#101417]"
                      : "bg-white/[0.08] text-[#d6dfdc]"
                  }`}
                >
                  {forceDemoMode ? "Demo Mode On" : "Use Demo Mode"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForceDemoMode(false);
                    setOperationStatus("Retrying live connection...");
                    void refreshLeads(true);
                    void refreshOpsData(true);
                  }}
                  className="rounded-md bg-white/[0.08] px-3 py-2 text-xs font-semibold text-[#d6dfdc]"
                >
                  Retry Connection
                </button>
              </div>
            </div>

            {active === "dashboard" && (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard title="Pipeline" value={money(stats.pipeline)} detail="Open and won opportunity value" icon={WalletCards} />
                  <MetricCard title="Hot Leads" value={String(stats.hot)} detail="Score above 80 and ready for action" icon={Target} />
                  <MetricCard title="Booked Calls" value={String(stats.calls)} detail="Needs prep and demo path" icon={CalendarClock} />
                  <MetricCard title="Won Revenue" value={money(stats.won)} detail="Install and retention queue" icon={CheckCircle2} />
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <Panel title="Today Command Queue" icon={ClipboardList}>
                    <div className="grid gap-3">
                      {leads.slice(0, 4).map((lead) => (
                        <button
                          key={lead.id || lead.company}
                          type="button"
                          onClick={() => {
                            selectLead(lead);
                            setActive("outreach");
                          }}
                          className="grid gap-3 rounded-md border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-[#d8ff5f]/70 md:grid-cols-[1fr_auto]"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold">{lead.company}</h3>
                              <span className="rounded-sm bg-[#283239] px-2 py-1 text-xs text-[#b7c8c1]">
                                {lead.stage}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-[#aebbb7]">{lead.next}</p>
                          </div>
                          <div className="text-left md:text-right">
                            <p className="font-mono text-lg text-[#d8ff5f]">{lead.score}</p>
                            <p className="text-sm text-[#b7c8c1]">{money(lead.value)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </Panel>

                  <Panel title="Next Best Action" icon={Brain}>
                    <div className="rounded-md bg-[#eef6e8] p-5 text-[#111815]">
                      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#3d635b]">
                        {nextBestAction.label}
                      </p>
                      <h3 className="mt-3 text-2xl font-semibold">
                        {nextBestAction.title}
                      </h3>
                      <p className="mt-3 text-sm text-[#43514d]">
                        {nextBestAction.detail}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          selectLead(nextBestLead);
                          setActive(nextBestLead.stage === "Call Booked" ? "proposal" : "outreach");
                        }}
                        className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#111815] px-4 py-3 text-sm font-semibold text-white"
                      >
                        {nextBestLead.stage === "Call Booked" ? "Open call prep" : "Open outreach"} <ArrowRight size={16} />
                      </button>
                    </div>
                  </Panel>
                </div>
                <AutomationEventLog events={automationEvents} />
              </>
            )}

            {active === "agents" && (
              <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
                <Panel title="Agent Control Room" icon={Bot}>
                  <div className="grid gap-4 md:grid-cols-3">
                    <MetricCard
                      title="Agents Ready"
                      value={`${agentControlRoom?.summary.ready || 0}/${agentControlRoom?.summary.total || 7}`}
                      detail="Operational lanes online"
                      icon={CheckCircle2}
                    />
                    <MetricCard
                      title="Blocked"
                      value={String(agentControlRoom?.summary.blocked || 0)}
                      detail="Needs configuration or attention"
                      icon={Gauge}
                    />
                    <MetricCard
                      title="Send Mode"
                      value={agentControlRoom?.summary.mode || outreachStatus.mode}
                      detail="Current outreach posture"
                      icon={Send}
                    />
                  </div>

                  <div className="mt-5 rounded-md border border-[#83d0c2]/35 bg-[#83d0c2]/10 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-3xl">
                        <div className="flex items-center gap-2">
                          <span className={`size-2 rounded-full ${agentDotClass(agentControlRoom?.director?.status || "needs-work")}`} />
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#83d0c2]">Lead Gen Director Agent</p>
                        </div>
                        <h3 className="mt-2 text-2xl font-semibold">
                          {agentControlRoom?.director?.name || "Lead Gen Director Agent"}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-[#c8d6d2]">
                          {agentControlRoom?.director?.mandate ||
                            "Own the daily path from source selection to queued outreach, reply classification, booked calls, and source learning."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={runLeadGenDirector}
                        disabled={directorBusy}
                        className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-4 py-3 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {directorBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Rocket size={16} />}
                        Run director sprint
                      </button>
                      <button
                        type="button"
                        onClick={briefNovaCeoAgent}
                        disabled={novaBusy}
                        className="inline-flex items-center gap-2 rounded-md bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {novaBusy ? <LoaderCircle className="animate-spin" size={16} /> : <MessageSquareText size={16} />}
                        Brief Nova CEO
                      </button>
                      <button
                        type="button"
                        onClick={runFullLeadCommandAudit}
                        disabled={auditBusy}
                        className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-4 py-3 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {auditBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Gauge size={16} />}
                        Run full audit
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      {Object.entries(agentControlRoom?.director?.metrics || {}).map(([label, value]) => (
                        <div key={label} className="rounded-sm bg-[#101417] p-3">
                          <p className="text-[10px] uppercase tracking-[0.12em] text-[#83d0c2]">{label}</p>
                          <p className="mt-1 font-mono text-lg text-white">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_0.8fr]">
                      <div className="rounded-md border border-white/10 bg-[#101417] p-4">
                        <p className="text-sm font-semibold text-white">{agentControlRoom?.director?.health || "Ready to coordinate specialist lanes"}</p>
                        <p className="mt-2 text-sm leading-5 text-[#aebbb7]">
                          {agentControlRoom?.director?.nextMove ||
                            "Run Google Maps first for contactable local businesses, then broaden with PDL and Sales Navigator enrichment."}
                        </p>
                        {agentControlRoom?.director?.lastEvent ? (
                          <p className="mt-2 text-xs text-[#7f8b86]">
                            Last: {agentControlRoom.director.lastEvent.title} Â· {agentControlRoom.director.lastEvent.age}
                          </p>
                        ) : null}
                      </div>
                      <div className="rounded-md border border-white/10 bg-[#101417] p-4">
                        <p className="text-sm font-semibold text-white">Director Blockers</p>
                        <div className="mt-3 space-y-2">
                          {(agentControlRoom?.director?.blockers?.length ? agentControlRoom.director.blockers : ["No hard blocker. Keep approvals moving."]).map((blocker) => (
                            <p key={blocker} className="rounded-sm bg-white/[0.05] px-3 py-2 text-xs text-[#c8d6d2]">
                              {blocker}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-md border border-white/10 bg-[#101417] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#83d0c2]">Mission Control Bridge</p>
                          <h3 className="mt-1 font-semibold">
                            {agentControlRoom?.missionControl?.nova.targetAgent || "Nova CEO AI Agent"}
                          </h3>
                        </div>
                        <span className="rounded-sm bg-white/[0.08] px-2 py-1 text-xs text-[#c8d6d2]">
                          {agentControlRoom?.missionControl?.nova.channel || "internal-briefing"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-5 text-[#aebbb7]">
                        {agentControlRoom?.missionControl?.nova.detail ||
                          "Lead Gen Director can prepare CEO-level lead-gen briefs for Nova from this Agents tab."}
                      </p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {(agentControlRoom?.missionControl?.peers || []).map((peer) => (
                          <div key={peer.name} className="rounded-sm bg-white/[0.04] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold">{peer.name}</p>
                              <span className="rounded-sm bg-white/[0.08] px-2 py-1 text-[10px] text-[#aebbb7]">
                                {peer.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-[#9fb0a8]">{peer.role}</p>
                          </div>
                        ))}
                      </div>
                      {novaBriefResult ? (
                        <div className="mt-3 rounded-sm bg-white/[0.04] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold">
                              {novaBriefResult.posted ? "Posted to Nova" : "Brief ready for Nova"}
                            </p>
                            <span className="rounded-sm bg-[#d8ff5f]/15 px-2 py-1 text-[10px] font-semibold text-[#d8ff5f]">
                              {novaBriefResult.postStatus}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-[#aebbb7]">{novaBriefResult.nextMove}</p>
                        </div>
                      ) : null}
                      {leadCommandAudit ? (
                        <div className="mt-3 rounded-sm bg-white/[0.04] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold">
                              {leadCommandAudit.ok ? "Audit operational" : "Audit needs escalation"}
                            </p>
                            <span className="rounded-sm bg-white/[0.08] px-2 py-1 text-[10px] text-[#aebbb7]">
                              {leadCommandAudit.slack?.sent ? "posted" : "internal"}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-[#aebbb7]">{leadCommandAudit.bottleneck}</p>
                          <div className="mt-3 grid gap-2 md:grid-cols-3">
                            {leadCommandAudit.agents.slice(0, 6).map((agent) => (
                              <div key={agent.name} className="rounded-sm bg-[#101417] p-2">
                                <p className="text-xs font-semibold">{agent.name}</p>
                                <p className="mt-1 text-[10px] text-[#9fb0a8]">{agent.status}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {directorResult ? (
                      <div className="mt-4 rounded-md border border-white/10 bg-[#101417] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="font-semibold">Last Director Sprint</h3>
                          <span className="rounded-sm bg-[#d8ff5f]/15 px-2 py-1 text-xs font-semibold text-[#d8ff5f]">
                            queued {directorResult.summary.queued}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          {directorResult.specialists.map((specialist) => (
                            <div key={specialist.id} className="rounded-sm bg-white/[0.04] p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold">{specialist.name}</p>
                                <span className="rounded-sm bg-white/[0.08] px-2 py-1 text-[10px] text-[#aebbb7]">
                                  {specialist.status}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-[#9fb0a8]">
                                {specialist.provider || "agent"} Â· found {specialist.found || 0} Â· qualified {specialist.qualified || 0} Â· queued {specialist.queued || 0}
                              </p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-sm leading-5 text-[#aebbb7]">{directorResult.summary.nextMove}</p>
                      </div>
                    ) : null}

                    {specialistResult ? (
                      <div className="mt-4 rounded-md border border-white/10 bg-[#101417] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="font-semibold">Last Vega Specialist Run</h3>
                          <span className={`rounded-sm border px-2 py-1 text-xs font-semibold ${agentStatusClass(specialistResult.status === "done" ? "ready" : specialistResult.status === "blocked" ? "blocked" : "needs-work")}`}>
                            {specialistResult.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-[#d6dfdc]">{specialistResult.summary}</p>
                        <div className="mt-3 grid gap-2 md:grid-cols-4">
                          {Object.entries(specialistResult.metrics || {}).map(([label, value]) => (
                            <div key={label} className="rounded-sm bg-white/[0.04] p-3">
                              <p className="text-[10px] uppercase tracking-[0.12em] text-[#83d0c2]">{label}</p>
                              <p className="mt-1 font-mono text-sm text-white">{String(value)}</p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-sm leading-5 text-[#aebbb7]">{specialistResult.nextMove}</p>
                      </div>
                    ) : null}

                    {closingSprintResult ? (
                      <div className="mt-4 rounded-md border border-[#d8ff5f]/25 bg-[#d8ff5f]/[0.06] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-white">Last Vega Closing Sprint</h3>
                            <p className="mt-1 text-sm leading-5 text-[#d6dfdc]">{closingSprintResult.summary}</p>
                          </div>
                          <span className="rounded-sm border border-[#d8ff5f]/40 bg-[#d8ff5f]/10 px-2 py-1 text-xs font-semibold text-[#d8ff5f]">
                            {closingSprintResult.bottleneck}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-5">
                          <div className="rounded-sm bg-[#101417] p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[#83d0c2]">Close target</p>
                            <p className="mt-1 font-mono text-sm text-white">{closingSprintResult.after.wonDeals}/{closingSprintResult.after.targetCloses}</p>
                          </div>
                          <div className="rounded-sm bg-[#101417] p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[#83d0c2]">Booked target</p>
                            <p className="mt-1 font-mono text-sm text-white">{closingSprintResult.after.bookedCalls}/{closingSprintResult.after.targetBooked}</p>
                          </div>
                          <div className="rounded-sm bg-[#101417] p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[#83d0c2]">Sent week</p>
                            <p className="mt-1 font-mono text-sm text-white">{closingSprintResult.after.sentThisWeek}</p>
                          </div>
                          <div className="rounded-sm bg-[#101417] p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[#83d0c2]">Hot replies</p>
                            <p className="mt-1 font-mono text-sm text-white">{closingSprintResult.after.hotRepliesThisWeek}</p>
                          </div>
                          <div className="rounded-sm bg-[#101417] p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[#83d0c2]">Ready</p>
                            <p className="mt-1 font-mono text-sm text-white">{closingSprintResult.after.sendgridReady}</p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <div className="rounded-sm bg-[#101417] p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[#83d0c2]">Actions</p>
                            <p className="mt-1 text-sm leading-5 text-[#d6dfdc]">
                              {closingSprintResult.actions.slice(0, 3).map((action) => `${action.name}: ${action.status}`).join(" | ") || "No actions finished."}
                            </p>
                          </div>
                          <div className="rounded-sm bg-[#101417] p-3">
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[#83d0c2]">Next move</p>
                            <p className="mt-1 text-sm leading-5 text-[#d6dfdc]">{closingSprintResult.nextMoves[0] || "Run another focused sprint."}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    {(agentControlRoom?.agents || []).map((agent) => (
                      <div key={agent.id} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`size-2 rounded-full ${agentDotClass(agent.status)}`} />
                              <h3 className="font-semibold">{agent.name}</h3>
                            </div>
                            <p className="mt-2 text-sm leading-5 text-[#aebbb7]">{agent.role}</p>
                          </div>
                          <span className={`rounded-sm border px-2 py-1 text-xs font-semibold ${agentStatusClass(agent.status)}`}>
                            {agent.status}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          {Object.entries(agent.metrics).map(([label, value]) => (
                            <div key={label} className="rounded-sm bg-[#101417] p-3">
                              <p className="text-[10px] uppercase tracking-[0.12em] text-[#83d0c2]">{label}</p>
                              <p className="mt-1 font-mono text-lg text-white">{value}</p>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 rounded-md border border-white/10 bg-[#101417] p-3">
                          <p className="text-sm font-semibold text-white">{agent.health}</p>
                          <p className="mt-1 text-sm leading-5 text-[#aebbb7]">{agent.detail}</p>
                          {agent.nextRun ? <p className="mt-2 text-xs text-[#7f8b86]">Next: {agent.nextRun}</p> : null}
                          {agent.lastEvent ? (
                            <p className="mt-2 text-xs text-[#7f8b86]">
                              Last: {agent.lastEvent.title} · {agent.lastEvent.age}
                            </p>
                          ) : null}
                        </div>

                        {agent.blockers.length ? (
                          <div className="mt-3 space-y-2">
                            {agent.blockers.map((blocker) => (
                              <p key={blocker} className="rounded-sm bg-[#ff6b6b]/10 px-3 py-2 text-xs text-[#ffb3b3]">
                                {blocker}
                              </p>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {agent.id === "morning-standup" ? (
                            <button
                              type="button"
                              onClick={runMorningStandup}
                              disabled={standupBusy}
                              className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#c8ef4f] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {standupBusy ? <LoaderCircle className="animate-spin" size={16} /> : <MessageSquareText size={16} />}
                              Run standup
                            </button>
                          ) : null}
                          {agent.id === "dominance-loop" ? (
                            <button
                              type="button"
                              onClick={runVegaDominanceLoop}
                              disabled={dominanceBusy}
                              className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#c8ef4f] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {dominanceBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Rocket size={16} />}
                              Run dominance
                            </button>
                          ) : null}
                          {agent.id === "ops-loop" ? (
                            <button
                              type="button"
                              onClick={() => runVegaOpsLoop(true)}
                              disabled={opsLoopBusy}
                              className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#c8ef4f] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {opsLoopBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Bot size={16} />}
                              Run ops loop
                            </button>
                          ) : null}
                          {agent.id === "closing-sprint" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => runVegaClosingSprint(false)}
                                disabled={closingSprintBusy}
                                className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#c8ef4f] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {closingSprintBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Target size={16} />}
                                Run sprint
                              </button>
                              <button
                                type="button"
                                onClick={() => runVegaClosingSprint(true)}
                                disabled={closingSprintBusy}
                                className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {closingSprintBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
                                Sprint + approve
                              </button>
                            </>
                          ) : null}
                          {agent.id === "intent-feed" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("intent-feed")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "intent-feed" ? <LoaderCircle className="animate-spin" size={16} /> : <Radar size={16} />}
                              Refresh signals
                            </button>
                          ) : null}
                          {agent.id === "learning-loop" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("learning-loop")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#c8ef4f] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "learning-loop" ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
                              Tune plays
                            </button>
                          ) : null}
                          {agent.id === "social-intent" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("social-intent")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "social-intent" ? <LoaderCircle className="animate-spin" size={16} /> : <Radar size={16} />}
                              Scout social
                            </button>
                          ) : null}
                          {agent.id === "linkedin-tasks" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("linkedin-tasks")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "linkedin-tasks" ? <LoaderCircle className="animate-spin" size={16} /> : <MessageSquareText size={16} />}
                              Queue LinkedIn
                            </button>
                          ) : null}
                          {agent.id === "linkedin" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("linkedin-events")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "linkedin-events" ? <LoaderCircle className="animate-spin" size={16} /> : <CalendarClock size={16} />}
                              Check events
                            </button>
                          ) : null}
                          {agent.id === "copy-chief" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("copy-chief")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "copy-chief" ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
                              Tune copy
                            </button>
                          ) : null}
                          {agent.id === "cadence" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("cadence")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "cadence" ? <LoaderCircle className="animate-spin" size={16} /> : <CalendarClock size={16} />}
                              Run cadence
                            </button>
                          ) : null}
                          {agent.id === "contact-path" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("contact-path")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "contact-path" ? <LoaderCircle className="animate-spin" size={16} /> : <Radar size={16} />}
                              Work paths
                            </button>
                          ) : null}
                          {agent.id === "booking" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("booking")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "booking" ? <LoaderCircle className="animate-spin" size={16} /> : <CalendarClock size={16} />}
                              Push bookings
                            </button>
                          ) : null}
                          {agent.id === "revenue-watch" ? (
                            <button
                              type="button"
                              onClick={runVegaRevenueWatch}
                              disabled={watchBusy}
                              className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {watchBusy ? <LoaderCircle className="animate-spin" size={16} /> : <MessageSquareText size={16} />}
                              Run watch
                            </button>
                          ) : null}
                          {agent.id === "safety" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("deliverability")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "deliverability" ? <LoaderCircle className="animate-spin" size={16} /> : <DatabaseZap size={16} />}
                              Protect sending
                            </button>
                          ) : null}
                          {agent.id === "outreach" ? (
                            <button
                              type="button"
                              onClick={() => runVegaSpecialist("full-team")}
                              disabled={Boolean(specialistBusy)}
                              className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#c8ef4f] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {specialistBusy === "full-team" ? <LoaderCircle className="animate-spin" size={16} /> : <Bot size={16} />}
                              Run specialists
                            </button>
                          ) : null}
                          {agent.id === "sourcing" ? (
                            <button
                              type="button"
                              onClick={runAiOperator}
                              disabled={agentBusy}
                              className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-3 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#c8ef4f] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {agentBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Rocket size={16} />}
                              Run now
                            </button>
                          ) : null}
                          {agent.actionView ? (
                            <button
                              type="button"
                              onClick={() => setActive(agent.actionView || "dashboard")}
                              className="inline-flex items-center gap-2 rounded-md bg-white/[0.08] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.14]"
                            >
                              {agent.actionLabel || "Open lane"}
                              <ArrowRight size={16} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Operating Model" icon={Radar}>
                  <div className="space-y-3">
                    <div className="rounded-md border border-white/10 bg-[#eef8e9] p-4 text-[#132322]">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2a6f64]">Recommended route</p>
                      <h3 className="mt-3 text-lg font-semibold">
                        {agentControlRoom?.summary.recommendation ||
                          "Keep GhostCRM as the lead-to-cash source of truth; sync relationship context to RelateOS."}
                      </h3>
                      <p className="mt-3 text-sm leading-6">
                        GhostCRM should own leads, stages, outreach, replies, booking, proposals, and revenue attribution. RelateOS should receive the qualified relationship graph: warm contacts, referral paths, partner context, and long-term nurture notes.
                      </p>
                    </div>
                    {[
                      ["GhostCRM", "Primary lead-to-cash database: queue, inbox, booked calls, proposals, won revenue."],
                      ["RelateOS", "Relationship intelligence layer: referrals, trust paths, partnership memory, warm-network follow-up."],
                      ["Next build", "Add a qualified-only RelateOS sync lane so every hot reply, referral partner, and won client enriches the relationship graph."],
                    ].map(([label, detail]) => (
                      <div key={label} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                        <h3 className="font-semibold">{label}</h3>
                        <p className="mt-2 text-sm leading-5 text-[#aebbb7]">{detail}</p>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Learning Loop" icon={Brain}>
                  <div className="grid gap-4 md:grid-cols-4">
                    <MetricCard
                      title="GojiBerry Gap"
                      value={learningLoop?.summary.gojiBerryCloseness || "60-68%"}
                      detail="Current outbound-agent parity"
                      icon={Target}
                    />
                    <MetricCard
                      title="Reply Rate"
                      value={`${learningLoop?.summary.overallReplyRate || 0}%`}
                      detail="Replies / queued or sent"
                      icon={MessageSquareText}
                    />
                    <MetricCard
                      title="Hot Signals"
                      value={String(learningLoop?.summary.hot || 0)}
                      detail="Hot, booked, or objection replies"
                      icon={Flame}
                    />
                    <MetricCard
                      title="Failed Sends"
                      value={String(learningLoop?.summary.failed || 0)}
                      detail="Deliverability drag to suppress"
                      icon={DatabaseZap}
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => runSignalCollector(false)}
                      disabled={collectorBusy}
                      className="inline-flex items-center gap-2 rounded-md bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {collectorBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Radar size={16} />}
                      Preview signal plays
                    </button>
                    <button
                      type="button"
                      onClick={() => runSignalCollector(true)}
                      disabled={collectorBusy}
                      className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#c8ef4f] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {collectorBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Target size={16} />}
                      Import and queue signals
                    </button>
                    <button
                      type="button"
                      onClick={runSelfTuningAgent}
                      disabled={tuningBusy}
                      className="inline-flex items-center gap-2 rounded-md bg-[#83d0c2] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {tuningBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Brain size={16} />}
                      Self-tune campaigns
                    </button>
                  </div>

                  {signalCollectorResult ? (
                    <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-semibold">Last Signal Collector Run</h3>
                        <span className="rounded-sm bg-white/[0.08] px-2 py-1 text-xs text-[#aebbb7]">
                          {signalCollectorResult.commit ? "import" : "preview"}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        {signalCollectorResult.runs.map((run) => (
                          <div key={run.playId} className="rounded-sm bg-white/[0.04] p-3">
                            <p className="text-sm font-semibold">{run.name}</p>
                            <p className="mt-1 text-xs text-[#9fb0a8]">
                              {run.provider} · found {run.found} · qualified {run.qualified}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-sm text-[#aebbb7]">
                        Imported {signalCollectorResult.imported}, queued {signalCollectorResult.queued}.
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-4 xl:grid-cols-3">
                    <div className="rounded-md border border-white/10 bg-[#101417] p-4">
                      <h3 className="font-semibold">Source Performance</h3>
                      <div className="mt-3 space-y-2">
                        {(learningLoop?.sources || []).slice(0, 5).map((row) => (
                          <div key={row.key} className="rounded-md bg-white/[0.04] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold">{row.key}</span>
                              <span className="font-mono text-[#d8ff5f]">{row.replyRate}%</span>
                            </div>
                            <p className="mt-1 text-xs text-[#9fb0a8]">
                              {row.leads} leads · {row.replies} replies · {row.quality}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-white/10 bg-[#101417] p-4">
                      <h3 className="font-semibold">Signal Buckets</h3>
                      <div className="mt-3 space-y-2">
                        {(learningLoop?.signals || []).slice(0, 5).map((row) => (
                          <div key={row.key} className="rounded-md bg-white/[0.04] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold">{row.key}</span>
                              <span className="font-mono text-[#83d0c2]">{row.hot + row.booked}</span>
                            </div>
                            <p className="mt-1 text-xs text-[#9fb0a8]">
                              {row.leads} leads · {row.replyRate}% reply · {row.failureRate}% failed
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-white/10 bg-[#101417] p-4">
                      <h3 className="font-semibold">Recommended Moves</h3>
                      <div className="mt-3 space-y-2">
                        {(learningLoop?.recommendations || []).map((recommendation) => (
                          <p key={recommendation} className="rounded-md bg-white/[0.04] p-3 text-sm leading-5 text-[#d6dfdc]">
                            {recommendation}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                      <h3 className="font-semibold">Recent Captured Signals</h3>
                      <div className="mt-3 space-y-2">
                        {(learningLoop?.examples || []).slice(0, 5).map((example) => (
                          <div key={`${example.company}-${example.signal}`} className="rounded-md bg-[#101417] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold">{example.company}</span>
                              <span className="font-mono text-xs text-[#d8ff5f]">{example.score}</span>
                            </div>
                            <p className="mt-1 text-xs text-[#9fb0a8]">{example.source} · {example.stage}</p>
                            <p className="mt-2 text-sm leading-5 text-[#d6dfdc]">{example.signal}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                      <h3 className="font-semibold">Remaining GojiBerry Gaps</h3>
                      <div className="mt-3 space-y-2">
                        {(learningLoop?.gaps || []).map((gap) => (
                          <p key={gap} className="rounded-md bg-[#101417] p-3 text-sm leading-5 text-[#aebbb7]">
                            {gap}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </Panel>
              </div>
            )}

            {active === "source" && (
              <>
              <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
                <Panel title="Fresh Lead Source" icon={Target}>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <p className="text-sm text-[#aebbb7]">Provider</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {[
                          { id: "pdl", label: "People Data Labs", active: sourcingStatus.pdlConfigured },
                          { id: "google-maps", label: "Google Maps", active: sourcingStatus.googleMapsConfigured },
                          { id: "ghost-lead-agent", label: "Ghost Lead Agent", active: sourcingStatus.ghostLeadAgentConfigured },
                        ].map((provider) => (
                          <button
                            key={provider.id}
                            type="button"
                            onClick={() => setSourceProvider(provider.id as "pdl" | "ghost-lead-agent" | "google-maps")}
                            className={`rounded-md border px-3 py-3 text-left text-sm transition ${
                              sourceProvider === provider.id
                                ? "border-[#d8ff5f] bg-[#d8ff5f]/10 text-white"
                                : "border-white/10 bg-white/[0.04] text-[#d6dfdc] hover:border-[#83d0c2]"
                            }`}
                          >
                            <span className="block font-semibold">{provider.label}</span>
                            <span className="mt-1 block text-xs text-[#9fb0a8]">
                              {provider.active
                                ? "configured"
                                : sourcingStatus.mockSourceEnabled
                                  ? "demo mode"
                                  : "needs env"}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="grid gap-2 text-sm text-[#aebbb7]">
                      {sourceProvider === "ghost-lead-agent"
                        ? "Domains or websites"
                        : sourceProvider === "google-maps"
                          ? "Google Maps search"
                          : "Search brief"}
                      <textarea
                        value={sourceQuery}
                        onChange={(event) => setSourceQuery(event.target.value)}
                        placeholder={
                          sourceProvider === "ghost-lead-agent"
                            ? "example.com\nhttps://acme.io"
                            : sourceProvider === "google-maps"
                              ? "marketing agencies near Dallas OR SaaS companies in Austin"
                              : "founders revenue leaders growth operators at companies that need more qualified sales calls"
                        }
                        className="min-h-24 rounded-md border border-white/10 bg-[#101417] px-3 py-2 text-white outline-none focus:border-[#83d0c2]"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="grid gap-2 text-sm text-[#aebbb7]">
                        Location
                        <input
                          value={sourceLocation}
                          onChange={(event) => setSourceLocation(event.target.value)}
                          className="rounded-md border border-white/10 bg-[#101417] px-3 py-2 text-white outline-none focus:border-[#83d0c2]"
                        />
                      </label>
                      <label className="grid gap-2 text-sm text-[#aebbb7]">
                        Preview size
                        <input
                          value={sourceLimit}
                          onChange={(event) => setSourceLimit(event.target.value)}
                          className="rounded-md border border-white/10 bg-[#101417] px-3 py-2 text-white outline-none focus:border-[#83d0c2]"
                          inputMode="numeric"
                        />
                      </label>
                      <label className="grid gap-2 text-sm text-[#aebbb7]">
                        Min score
                        <input
                          value={sourceMinScore}
                          onChange={(event) => setSourceMinScore(event.target.value)}
                          className="rounded-md border border-white/10 bg-[#101417] px-3 py-2 text-white outline-none focus:border-[#83d0c2]"
                          inputMode="numeric"
                        />
                      </label>
                    </div>

                    <label className="grid gap-2 text-sm text-[#aebbb7]">
                      Industries
                      <input
                        value={sourceIndustry}
                        onChange={(event) => setSourceIndustry(event.target.value)}
                        className="rounded-md border border-white/10 bg-[#101417] px-3 py-2 text-white outline-none focus:border-[#83d0c2]"
                      />
                    </label>

                    <div className="rounded-md border border-white/10 bg-[#101417] p-4 text-sm text-[#b6c4bf]">
                      <p className="font-semibold text-white">Best route for volume</p>
                      <p className="mt-2">
                        Use PDL for named buyer contacts, Google Maps for business discovery plus website/phone signals, and Ghost Lead Agent for deeper website intelligence.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sourceGuardrails.map((guardrail) => (
                          <span key={guardrail} className="rounded-sm bg-white/[0.06] px-2 py-1 text-xs text-[#d6dfdc]">
                            {guardrail}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => searchSources()}
                        className="rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                      >
                        Search Fresh Leads
                      </button>
                      <button
                        type="button"
                        onClick={() => searchSources(sourceScrollToken)}
                        disabled={!sourceScrollToken}
                        className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#d8ff5f] disabled:cursor-not-allowed disabled:bg-white/[0.12] disabled:text-[#7f8b86]"
                      >
                        Next Batch
                      </button>
                      <button
                        type="button"
                        onClick={importSourceResults}
                        disabled={!liveDataReady}
                        className="rounded-md bg-white/[0.08] px-4 py-2 text-sm font-semibold text-[#d6dfdc] transition hover:bg-white/12"
                      >
                        Import + Queue
                      </button>
                      <button
                        type="button"
                        onClick={saveSourceCampaign}
                        className="rounded-md bg-[#83d0c2] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                      >
                        Save Campaign
                      </button>
                    </div>
                    <p className="text-sm text-[#83d0c2]">{sourceStatus}</p>

                    <div className="rounded-md border border-white/10 bg-[#101417] p-4">
                      <h3 className="font-semibold">Saved Campaigns</h3>
                      <div className="mt-3 space-y-2">
                        {sourceCampaigns.slice(0, 4).map((campaign) => (
                          <button
                            key={campaign.id}
                            type="button"
                            onClick={() => runSourceCampaign(campaign.id)}
                            className="w-full rounded-md bg-white/[0.04] p-3 text-left text-sm transition hover:bg-white/[0.08]"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold">{campaign.name}</span>
                              <span className="rounded-sm bg-[#283239] px-2 py-1 text-xs text-[#b7c8c1]">
                                {campaign.provider}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[#9fb0a8]">
                              Limit {campaign.dailyLimit} - threshold {campaign.scoreThreshold}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Panel>

                <Panel title="Lead Preview" icon={Inbox}>
                  <div className="grid gap-3">
                    {sourceResults.length ? (
                      sourceResults.map((lead) => (
                        <div key={lead.id} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm uppercase tracking-[0.14em] text-[#83d0c2]">
                                {lead.niche}
                              </p>
                              <h3 className="mt-1 font-semibold">{lead.companyName}</h3>
                              <p className="mt-1 text-sm text-[#aebbb7]">
                                {lead.name} - {lead.title}
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="font-mono text-2xl text-[#d8ff5f]">{lead.score}</p>
                              <p className="text-xs text-[#9fb0a8]">{lead.confidence}</p>
                              <p className="mt-1 rounded-sm bg-[#d8ff5f]/15 px-2 py-1 text-xs font-semibold text-[#d8ff5f]">
                                {lead.buyerFit}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-2 text-xs text-[#b6c4bf] md:grid-cols-3">
                            <span className="rounded-sm bg-[#101417] px-2 py-2">{lead.email || "no email"}</span>
                            <span className="rounded-sm bg-[#101417] px-2 py-2">{lead.phone || "no phone"}</span>
                            <span className="rounded-sm bg-[#101417] px-2 py-2">{lead.location || lead.source}</span>
                          </div>
                          <div className="mt-3 rounded-md border border-white/10 bg-[#101417] p-3">
                            <p className="text-xs uppercase tracking-[0.12em] text-[#83d0c2]">Buyer Signals</p>
                            <p className="mt-2 text-sm leading-5 text-[#d6dfdc]">
                              {lead.signalSummary || lead.intentSignals?.slice(0, 3).join("; ") || "Needs deeper intent enrichment before outreach."}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed border-white/15 bg-white/[0.03] p-8 text-center text-sm text-[#9fb0a8]">
                        Run a source search to preview fresh business contacts before they enter the pipeline.
                      </div>
                    )}
                  </div>
                </Panel>
              </div>

              <Panel title="LinkedIn Sales Navigator Lane" icon={Radar}>
                <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="grid gap-4">
                    <div className="rounded-md border border-white/10 bg-[#101417] p-4 text-sm text-[#b6c4bf]">
                      <p className="font-semibold text-white">Fastest Sales Nav workflow</p>
                      <p className="mt-2">
                        Screenshot up to 9 visible Sales Navigator results, or paste rows/CSV here, then let Lead Command extract, enrich, score, import, and queue contactable records.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          "Saved-search match",
                          "LinkedIn profile context",
                          "PDL contact enrichment",
                          "GhostCRM import",
                          "Approval queue",
                        ].map((item) => (
                          <span key={item} className="rounded-sm bg-white/[0.06] px-2 py-1 text-xs text-[#d6dfdc]">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-md border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">Screenshot intake</p>
                          <p className="mt-1 text-sm text-[#9fb0a8]">
                            {salesNavScreenshotCount
                              ? `${salesNavScreenshotCount} screenshot${salesNavScreenshotCount === 1 ? "" : "s"} selected last run.`
                              : "Upload the visible batch from Sales Navigator."}
                          </p>
                        </div>
                        <span className="rounded-sm bg-[#101417] px-2 py-1 text-xs text-[#b7c8c1]">
                          vision + PDL
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.14]">
                          {salesNavBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}
                          Extract screenshots
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            disabled={salesNavBusy}
                            onChange={(event) => {
                              void runSalesNavigatorScreenshots(event.currentTarget.files, false);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                        <label
                          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${
                            liveDataReady && !salesNavBusy
                              ? "cursor-pointer bg-[#d8ff5f] text-[#101417] hover:bg-[#c8ef4f]"
                              : "cursor-not-allowed bg-white/[0.12] text-[#7f8b86]"
                          }`}
                        >
                          {salesNavBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Target size={16} />}
                          Extract, import, queue
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="sr-only"
                            disabled={salesNavBusy || !liveDataReady}
                            onChange={(event) => {
                              void runSalesNavigatorScreenshots(event.currentTarget.files, true);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <label className="grid gap-2 text-sm text-[#aebbb7]">
                      Sales Navigator paste or extracted CSV
                      <textarea
                        value={salesNavText}
                        onChange={(event) => setSalesNavText(event.target.value)}
                        className="min-h-44 rounded-md border border-white/10 bg-[#101417] px-3 py-2 font-mono text-sm text-white outline-none focus:border-[#83d0c2]"
                      />
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => runSalesNavigatorImport(false)}
                        disabled={salesNavBusy}
                        className="inline-flex items-center gap-2 rounded-md bg-white/[0.08] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {salesNavBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Radar size={16} />}
                        Preview Sales Nav
                      </button>
                      <button
                        type="button"
                        onClick={() => runSalesNavigatorImport(true)}
                        disabled={salesNavBusy || !liveDataReady}
                        className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#c8ef4f] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {salesNavBusy ? <LoaderCircle className="animate-spin" size={16} /> : <Target size={16} />}
                        Import and queue Sales Nav
                      </button>
                    </div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-[#101417] p-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <MetricCard
                        title="Parsed"
                        value={String(salesNavResult?.parsed || 0)}
                        detail="Rows read"
                        icon={DatabaseZap}
                      />
                      <MetricCard
                        title="Qualified"
                        value={String(salesNavResult?.qualified || 0)}
                        detail="Score matched"
                        icon={Target}
                      />
                      <MetricCard
                        title="Contactable"
                        value={String(salesNavResult?.contactable || 0)}
                        detail="Email or phone"
                        icon={MessageSquareText}
                      />
                      <MetricCard
                        title="Queued"
                        value={String(salesNavResult?.queued || 0)}
                        detail="Approval touches"
                        icon={Send}
                      />
                    </div>

                    <div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] p-4 text-sm text-[#b6c4bf]">
                      <p className="font-semibold text-white">
                        {salesNavResult?.provider === "openai"
                          ? `Screenshot extraction used ${salesNavResult.model || "vision"}`
                          : salesNavResult?.pdlEnrichment
                            ? "PDL enrichment is available"
                            : "PDL enrichment is not available"}
                      </p>
                      <p className="mt-2">
                        {salesNavResult
                          ? `${salesNavResult.needsContact} qualified Sales Nav records still need email or phone before automated outreach.`
                          : "Preview a Sales Navigator list to see how many records can move straight into outreach."}
                      </p>
                    </div>

                    {salesNavResult?.preview?.length ? (
                      <div className="mt-4 grid gap-2">
                        {salesNavResult.preview.slice(0, 5).map((lead) => (
                          <div key={lead.id} className="rounded-md bg-white/[0.04] p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-white">{lead.companyName}</p>
                                <p className="mt-1 text-[#aebbb7]">{lead.name} - {lead.title}</p>
                              </div>
                              <span className="font-mono text-lg text-[#d8ff5f]">{lead.score}</span>
                            </div>
                            <p className="mt-2 text-xs text-[#9fb0a8]">{lead.signalSummary}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Panel>
              </>
            )}

            {active === "pipeline" && (
              <div className="grid gap-6 2xl:grid-cols-[1fr_420px]">
                <Panel title="Lead Pipeline" icon={Layers3}>
                  <div className="overflow-x-auto pb-2">
                    <div className="flex min-w-max gap-4">
                      {stages.map((stage) => {
                        const stageLeads = leads.filter((lead) => lead.stage === stage);
                        const stageValue = stageLeads.reduce((sum, lead) => sum + lead.value, 0);
                        return (
                          <div key={stage} className="w-56 shrink-0 rounded-md border border-white/10 bg-white/[0.03] p-3">
                            <div className="mb-3">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold">{stage}</h3>
                                <span className="font-mono text-xs text-[#d8ff5f]">{stageLeads.length}</span>
                              </div>
                              <p className="mt-1 font-mono text-xs text-[#9fb0a8]">{money(stageValue)}</p>
                            </div>
                            <div className="max-h-[72vh] space-y-3 overflow-y-auto pr-1">
                              {stageLeads.length ? (
                                stageLeads.map((lead) => (
                                  <PipelineCard
                                    key={lead.id || lead.company}
                                    lead={lead}
                                    selected={selectedLead.id === lead.id || selectedLead.company === lead.company}
                                    onSelect={() => selectLead(lead)}
                                    onAction={() => {
                                      selectLead(lead);
                                      setActive(lead.stage === "Call Booked" || lead.stage === "Proposal Sent" ? "proposal" : "outreach");
                                    }}
                                  />
                                ))
                              ) : (
                                <div className="rounded-md border border-dashed border-white/10 bg-[#101417] p-4 text-xs leading-5 text-[#7f8b86]">
                                  No leads here yet.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Panel>
                <LeadDetailPanel
                  lead={selectedLead}
                  editScore={editScore}
                  editValue={editValue}
                  editNextAction={editNextAction}
                  onScoreChange={setEditScore}
                  onValueChange={setEditValue}
                  onNextActionChange={setEditNextAction}
                  onSave={saveLeadEdits}
                  onStageChange={(stage) => updateLead(selectedLead.id, { stage })}
                />
              </div>
            )}

            {active === "waitlist" && (
              <div className="grid gap-6">
                <Panel title="Vega Waitlist" icon={Users}>
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <MetricCard title="Contestants" value={String(waitlistDashboard?.summary.total || 0)} detail="Total active" icon={Users} />
                    <MetricCard title="Founding" value={String(waitlistDashboard?.summary.founding || 0)} detail="Design partner fit" icon={Sparkles} />
                    <MetricCard title="Private Beta" value={String(waitlistDashboard?.summary.privateBeta || 0)} detail="Beta candidates" icon={Rocket} />
                    <MetricCard title="General" value={String(waitlistDashboard?.summary.general || 0)} detail="Product updates" icon={Inbox} />
                    <MetricCard title="Active Testers" value={String(waitlistDashboard?.summary.activeBetaInterest || 0)} detail="Wants to test" icon={CheckCircle2} />
                    <MetricCard title="Last 7 Days" value={String(waitlistDashboard?.summary.addedLast7Days || 0)} detail="New contestants" icon={CalendarClock} />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {[
                      ["all", "All"],
                      ["Founding Design Partner Candidate", "Founding"],
                      ["Private Beta Candidate", "Private beta"],
                      ["General Waitlist", "General"],
                      ["Active Beta Interest", "Active beta"],
                      ["High Lead Volume", "High volume"],
                      ["source", "Signup source"],
                      ["date", "Date joined"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setWaitlistFilter(id)}
                        className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                          waitlistFilter === id
                            ? "bg-[#d8ff5f] text-[#101417]"
                            : "bg-white/[0.06] text-[#d6dfdc] hover:bg-white/12"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 overflow-x-auto">
                    <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-[#8fa09a]">
                          <th className="py-3 pr-4">Contestant</th>
                          <th className="py-3 pr-4">Company</th>
                          <th className="py-3 pr-4">Role</th>
                          <th className="py-3 pr-4">Email</th>
                          <th className="py-3 pr-4">Phone</th>
                          <th className="py-3 pr-4">Beta</th>
                          <th className="py-3 pr-4">Volume</th>
                          <th className="py-3 pr-4">Segment</th>
                          <th className="py-3 pr-4">Score</th>
                          <th className="py-3 pr-4">Priority</th>
                          <th className="py-3 pr-4">Tools</th>
                          <th className="py-3 pr-4">Source</th>
                          <th className="py-3 pr-4">Signup</th>
                          <th className="py-3 pr-4">Latest</th>
                          <th className="py-3 pr-4">CRM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWaitlistContestants.length ? (
                          filteredWaitlistContestants.map((lead) => {
                            const fields = lead.waitlistFields || {};
                            const tools = Array.isArray(fields.currentTools) ? fields.currentTools.join(", ") : "";
                            const segment = String(fields.qualificationSegment || lead.waitlistTags.find((tag) => tag.includes("Candidate") || tag === "General Waitlist") || "");
                            return (
                              <tr key={lead.id} className="border-b border-white/5 text-[#d6dfdc]">
                                <td className="py-3 pr-4 font-semibold text-white">{lead.name}</td>
                                <td className="py-3 pr-4">{lead.companyName}</td>
                                <td className="py-3 pr-4">{lead.contact?.title || lead.contact?.role || ""}</td>
                                <td className="py-3 pr-4">{lead.contact?.email || ""}</td>
                                <td className="py-3 pr-4">{lead.contact?.phone || ""}</td>
                                <td className="py-3 pr-4">{String(fields.betaInterest || "")}</td>
                                <td className="py-3 pr-4">{String(fields.monthlyLeadVolume || "")}</td>
                                <td className="py-3 pr-4">{segment}</td>
                                <td className="py-3 pr-4 font-mono text-[#d8ff5f]">{lead.score}</td>
                                <td className="py-3 pr-4">{lead.priority || "low"}</td>
                                <td className="py-3 pr-4">{tools}</td>
                                <td className="py-3 pr-4">{String(fields.signupSource || "")}</td>
                                <td className="py-3 pr-4">{cardTime(String(fields.originalJoinedAt || lead.createdAt))}</td>
                                <td className="py-3 pr-4">{lead.interactions?.[0] ? cardTime(lead.interactions[0].createdAt) : cardTime(lead.updatedAt)}</td>
                                <td className="py-3 pr-4">{lead.crmSyncStatus || "pending"}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={15} className="py-10 text-center text-[#9fb0a8]">
                              No Vega waitlist contestants match this filter yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
            )}

            {active === "relationships" && (
              <div className="grid gap-6 2xl:grid-cols-[1fr_420px]">
                <Panel title="QR Relationships" icon={Radar}>
                  <div className="mb-4 grid gap-3 md:grid-cols-4">
                    {relationshipStages.map((stage) => (
                      <div key={stage} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                        <p className="text-xs uppercase tracking-[0.12em] text-[#83d0c2]">{stage}</p>
                        <p className="mt-2 font-mono text-2xl text-[#d8ff5f]">
                          {qrRelationships.filter((lead) => lead.stage === stage).length}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-3">
                    {qrRelationships.length ? (
                      qrRelationships.map((lead) => (
                        <div key={lead.id || lead.company} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.14em] text-[#83d0c2]">{lead.stage}</p>
                              <h3 className="mt-1 font-semibold">{lead.name}</h3>
                              <p className="mt-1 text-sm text-[#aebbb7]">{lead.company}</p>
                            </div>
                            <button
                              className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-[#e6f5ef] transition hover:border-[#32d5ff]/60"
                              onClick={() => {
                                selectLead(lead);
                                setActive("outreach");
                              }}
                            >
                              Open
                            </button>
                          </div>
                          <div className="mt-4 grid gap-2 text-xs text-[#b6c4bf] md:grid-cols-3">
                            <span className="rounded-sm bg-[#101417] px-2 py-2">{lead.source}</span>
                            <span className="rounded-sm bg-[#101417] px-2 py-2">{lead.lastTouch}</span>
                            <span className="rounded-sm bg-[#101417] px-2 py-2">{lead.score} score</span>
                          </div>
                          <p className="mt-3 text-sm text-[#c4d3ce]">{lead.next}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-md border border-dashed border-white/15 bg-white/[0.03] p-8 text-center text-sm text-[#9fb0a8]">
                        QR contact exchanges will appear here after someone sends their info from the card.
                      </div>
                    )}
                  </div>
                </Panel>
                <LeadDetailPanel
                  lead={selectedLead}
                  editScore={editScore}
                  editValue={editValue}
                  editNextAction={editNextAction}
                  onScoreChange={setEditScore}
                  onValueChange={setEditValue}
                  onNextActionChange={setEditNextAction}
                  onSave={saveLeadEdits}
                  onStageChange={(stage) => updateLead(selectedLead.id, { stage })}
                />
              </div>
            )}

            {active === "revival" && (
              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <Panel title="Dead Lead Revival System" icon={Flame}>
                  <div className="grid gap-3">
                    {revivalSteps.map((step) => {
                      const Icon = step.icon;
                      return (
                        <div key={step.title} className="flex gap-4 rounded-md border border-white/10 bg-white/[0.04] p-4">
                          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#29323a] text-[#d8ff5f]">
                            <Icon size={20} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold">{step.title}</h3>
                              <span className="rounded-sm bg-[#e2f0f0] px-2 py-1 font-mono text-xs text-[#132322]">
                                {step.metric}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-[#aebbb7]">{step.detail}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>

                <Panel title="Campaign Builder" icon={MessageSquareText}>
                  <div className="mb-4 flex rounded-md border border-white/10 bg-[#101417] p-1">
                    {["revival", "audit", "retainer"].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setCampaignMode(mode)}
                        className={`flex-1 rounded-sm px-3 py-2 text-sm capitalize ${
                          campaignMode === mode
                            ? "bg-white text-[#101417]"
                            : "text-[#aebbb7] hover:bg-white/8"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <GeneratedCopy mode={campaignMode} lead={selectedLead} />
                </Panel>

                <div className="xl:col-span-2">
                  <Panel title="CSV Import" icon={Upload}>
                    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                      <div>
                        <textarea
                          value={csvText}
                          onChange={(event) => setCsvText(event.target.value)}
                          className="min-h-52 w-full rounded-md border border-white/10 bg-[#101417] p-4 font-mono text-sm text-[#eef5f1] outline-none transition focus:border-[#83d0c2]"
                          spellCheck={false}
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={previewImport}
                            className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#d8ff5f]"
                          >
                            Preview Rows
                          </button>
                          <button
                            type="button"
                            onClick={commitImport}
                            className="rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                          >
                            Import Approved
                          </button>
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-md border border-white/10">
                        <div className="grid grid-cols-[1fr_1fr_72px] bg-white/[0.06] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[#9fb0a8]">
                          <span>Lead</span>
                          <span>Niche</span>
                          <span>Score</span>
                        </div>
                        <div className="max-h-72 overflow-auto">
                          {(importPreview.length ? importPreview : []).map((row, index) => (
                            <div
                              key={`${row.email}-${index}`}
                              className="grid grid-cols-[1fr_1fr_72px] border-t border-white/10 px-3 py-3 text-sm"
                            >
                              <span>
                                <strong className="block font-medium text-white">{row.companyName}</strong>
                                <span className="text-[#9fb0a8]">{row.name}</span>
                              </span>
                              <span className="text-[#d6dfdc]">{row.niche}</span>
                              <span className="font-mono text-[#d8ff5f]">{row.score}</span>
                            </div>
                          ))}
                          {!importPreview.length && (
                            <div className="px-3 py-8 text-sm text-[#9fb0a8]">
                              Preview rows will appear here before anything is added to the database.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {active === "outreach" && (
              <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                <Panel title="Selected Lead" icon={Inbox}>
                  <div className="space-y-3">
                    {leads.map((lead) => (
                      <button
                        key={lead.id || lead.company}
                        type="button"
                        onClick={() => selectLead(lead)}
                        className={`w-full rounded-md border p-4 text-left transition ${
                          selectedLead.company === lead.company
                            ? "border-[#d8ff5f] bg-[#d8ff5f]/10"
                            : "border-white/10 bg-white/[0.04] hover:border-[#83d0c2]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">{lead.company}</p>
                            <p className="text-sm text-[#aebbb7]">{lead.name}</p>
                          </div>
                          <span className="font-mono text-[#d8ff5f]">{lead.score}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </Panel>

                <Panel title="Outreach Console" icon={Send}>
                  <LeadBrief lead={selectedLead} />
                  <div className="mt-4 grid gap-3 rounded-md border border-white/10 bg-[#101417] p-4 sm:grid-cols-4">
                    <ProviderPill label="Mode" value={outreachStatus.mode} active={outreachStatus.mode === "live"} />
                    <ProviderPill label="Email" value="SendGrid" active={outreachStatus.sendgridConfigured} />
                    <ProviderPill label="SMS" value={outreachStatus.smsProvider} active={outreachStatus.smsProvider === "telnyx" ? outreachStatus.telnyxConfigured : outreachStatus.twilioConfigured} />
                    <ProviderPill label="Fallback" value="Twilio" active={outreachStatus.twilioConfigured} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-md bg-[#d8ff5f]/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#d8ff5f]">
                      {outreachAngle}
                    </span>
                    <button
                      type="button"
                      onClick={() => generateOutreach("outreach")}
                      className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#d8ff5f]"
                    >
                      Generate AI Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => sendOutreach("sms", smsOpener)}
                      className="rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                    >
                      Queue/Send SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => sendOutreach("email", emailFollowup)}
                      className="rounded-md bg-white/[0.08] px-4 py-2 text-sm font-semibold text-[#d6dfdc] transition hover:bg-white/12"
                    >
                      Queue/Send Email
                    </button>
                    <button
                      type="button"
                      onClick={() => queueSelectedLead("email")}
                      className="rounded-md bg-[#83d0c2] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                    >
                      Add to Approval Queue
                    </button>
                  </div>
                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <EditableCopyBlock
                      title="SMS opener"
                      value={smsOpener}
                      onChange={setSmsDraft}
                    />
                    <EditableCopyBlock
                      title="Email follow-up"
                      value={emailFollowup}
                      onChange={setEmailDraft}
                      subject={outreachSubject}
                      onSubjectChange={setEmailSubjectDraft}
                    />
                  </div>
                  <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">Three-Touch Sequence</h3>
                        <p className="mt-1 text-sm text-[#9fb0a8]">
                          Approval-ready touch plan before the lead becomes a booked call.
                        </p>
                      </div>
                      <div className="flex rounded-md border border-white/10 bg-black/20 p-1">
                        {(["fresh", "revival", "booked"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setSequenceMode(mode)}
                            className={`rounded-sm px-3 py-2 text-xs font-semibold capitalize ${
                              sequenceMode === mode ? "bg-white text-[#101417]" : "text-[#aebbb7]"
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      {sequenceSteps.map((step) => (
                        <div key={step.day} className="rounded-md border border-white/10 bg-white/[0.04] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-sm bg-[#d8ff5f]/15 px-2 py-1 text-xs font-semibold text-[#d8ff5f]">
                              {step.day}
                            </span>
                            <span className="text-xs uppercase tracking-[0.12em] text-[#83d0c2]">
                              {step.channel}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-semibold text-white">{step.goal}</p>
                          <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[#b6c4bf]">{step.copy}</p>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={draftSequenceQueue}
                      className="mt-4 rounded-md bg-[#83d0c2] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                    >
                      Save Sequence Steps
                    </button>
                  </div>
                  {generatedOutreach && (
                    <div className="mt-4">
                      <CopyBlock title="AI generated copy" text={generatedOutreach} />
                      <button
                        type="button"
                        onClick={() => saveInteraction("ai-draft", generatedOutreach, "Contacted")}
                        className="mt-3 rounded-md bg-[#83d0c2] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                      >
                        Save AI Draft
                      </button>
                    </div>
                  )}
                  <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
                    <h3 className="font-semibold">Recent Touches</h3>
                    <div className="mt-3 space-y-3">
                      {selectedLead.interactions?.length ? (
                        selectedLead.interactions.map((interaction) => (
                          <div key={interaction.id} className="rounded-md bg-white/[0.04] p-3 text-sm">
                            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[#9fb0a8]">
                              <span>{interaction.channel}</span>
                              <span>{interaction.direction}</span>
                              <span>{new Date(interaction.createdAt).toLocaleString()}</span>
                            </div>
                            <p className="whitespace-pre-line text-[#d6dfdc]">{interaction.body}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[#9fb0a8]">
                          No saved touches yet. Save an SMS, email, or AI draft to start the timeline.
                        </p>
                      )}
                    </div>
                  </div>
                </Panel>
              </div>
            )}

            {active === "queue" && (
              <div className="space-y-6">
                <Panel title="Outreach Pipeline Board" icon={ClipboardList}>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {queueBoardColumns.map((column) => (
                      <div key={column.id} className="w-72 shrink-0 rounded-md border border-white/10 bg-black/20 p-3">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold text-white">{column.title}</h3>
                            <p className="mt-1 text-xs leading-5 text-[#9fb0a8]">{column.subtitle}</p>
                          </div>
                          <span className="rounded-sm bg-[#d8ff5f]/15 px-2 py-1 font-mono text-xs text-[#d8ff5f]">
                            {column.cards.length}
                          </span>
                        </div>
                        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                          {column.cards.length ? (
                            column.cards.map((card) => (
                              <div key={`${card.kind}-${card.id}`} className="rounded-md border border-white/10 bg-white/[0.045] p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <h4 className="truncate text-sm font-semibold text-white">{card.title}</h4>
                                    {card.subtitle && (
                                      <p className="mt-1 truncate text-xs text-[#b6c4bf]">{card.subtitle}</p>
                                    )}
                                  </div>
                                  <span className="rounded-sm bg-[#283239] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b7c8c1]">
                                    {card.status}
                                  </span>
                                </div>
                                <p className="mt-3 max-h-24 overflow-hidden text-xs leading-5 text-[#9fb0a8]">
                                  {card.detail}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {card.meta.map((meta) => (
                                    <span key={meta} className="rounded-sm bg-[#101417] px-2 py-1 text-[10px] text-[#83d0c2]">
                                      {meta}
                                    </span>
                                  ))}
                                </div>
                                {card.kind === "queue" && card.queueItem?.status === "pending" && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {card.queueItem.channel === "email" && (
                                      <button
                                        type="button"
                                        onClick={() => redoQueueItem(card.queueItem!.id)}
                                        disabled={queueActionId === card.id}
                                        className="rounded-md bg-white/[0.08] px-3 py-2 text-xs font-semibold text-[#d6dfdc] disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Redo
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => openApprovalReview(card.queueItem!)}
                                      disabled={queueActionId === card.id}
                                      className="rounded-md bg-[#d8ff5f] px-3 py-2 text-xs font-semibold text-[#101417] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Review
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => rejectQueueItem(card.queueItem!.id)}
                                      disabled={queueActionId === card.id}
                                      className="rounded-md bg-white/[0.08] px-3 py-2 text-xs font-semibold text-[#d6dfdc] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                                {column.id === "engaged" &&
                                  card.leadId &&
                                  ["hot", "booked"].includes(card.status.toLowerCase()) && (
                                  <button
                                    type="button"
                                    onClick={() => markAppointmentSet(card)}
                                    disabled={queueActionId === card.id}
                                    className="mt-3 w-full rounded-md bg-[#83d0c2] px-3 py-2 text-xs font-semibold text-[#101417] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Appointment Set
                                  </button>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-4 text-center text-xs leading-5 text-[#7f918b]">
                              No records in this lane.
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Suppression Guardrails" icon={DatabaseZap}>
                  <div className="flex gap-2">
                    <input
                      value={suppressionValue}
                      onChange={(event) => setSuppressionValue(event.target.value)}
                      placeholder="email, domain, or company"
                      className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#101417] px-3 py-2 text-sm text-white outline-none focus:border-[#83d0c2]"
                    />
                    <button
                      type="button"
                      onClick={addSuppression}
                      className="rounded-md bg-[#d8ff5f] px-3 py-2 text-sm font-semibold text-[#101417]"
                    >
                      Add
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {suppressionItems.slice(0, 8).map((item) => (
                      <div key={item.id} className="rounded-md bg-white/[0.04] p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-[#d8ff5f]">{item.value}</span>
                          <span className="text-xs uppercase text-[#9fb0a8]">{item.type}</span>
                        </div>
                        <p className="mt-1 text-xs text-[#aebbb7]">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            )}

            {active === "inbox" && (
              <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                <Panel title="Record Reply" icon={MessageSquareText}>
                  <LeadBrief lead={selectedLead} />
                  <textarea
                    value={replyDraft}
                    onChange={(event) => setReplyDraft(event.target.value)}
                    className="mt-4 min-h-32 w-full rounded-md border border-white/10 bg-[#101417] p-4 text-sm text-[#eef5f1] outline-none focus:border-[#83d0c2]"
                  />
                  <button
                    type="button"
                    onClick={recordReply}
                    className="mt-3 rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417]"
                  >
                    Save & Classify
                  </button>
                </Panel>

                <Panel title="Reply Inbox" icon={Inbox}>
                  <div className="space-y-3">
                    {replyItems.length ? (
                      replyItems.map((reply) => (
                        <div key={reply.id} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#9fb0a8]">
                            <span>{reply.channel}</span>
                            <span>{reply.from}</span>
                            <span className="rounded-sm bg-[#d8ff5f] px-2 py-1 font-semibold text-[#101417]">
                              {reply.classification}
                            </span>
                          </div>
                          <p className="mt-3 whitespace-pre-line text-sm text-[#d6dfdc]">{reply.body}</p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md border border-dashed border-white/15 bg-white/[0.03] p-8 text-center text-sm text-[#9fb0a8]">
                        Replies will appear here after SendGrid, Telnyx, or manual capture.
                      </p>
                    )}
                  </div>
                </Panel>
              </div>
            )}

            {active === "analytics" && (
              <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <Panel title="Revenue Analytics" icon={Brain}>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <MetricCard title="Leads" value={String(analytics?.totals.leads || leads.length)} detail="Total in command center" icon={Target} />
                    <MetricCard title="Reply Rate" value={`${Math.round((analytics?.totals.replyRate || 0) * 100)}%`} detail="Replies / sent or queued" icon={MessageSquareText} />
                    <MetricCard title="Hot Replies" value={String(analytics?.totals.hotReplies || 0)} detail="Buying intent detected" icon={Flame} />
                    <MetricCard title="Pipeline" value={money(analytics?.totals.pipeline || stats.pipeline)} detail="Tracked opportunity value" icon={WalletCards} />
                    <MetricCard title="Suppressed" value={String(analytics?.suppressedOrFailed || 0)} detail="Failed or blocked sends" icon={DatabaseZap} />
                  </div>
                  <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
                    <h3 className="font-semibold">Sources</h3>
                    <div className="mt-3 space-y-2">
                      {Object.entries(analytics?.sourceBreakdown || {}).map(([source, count]) => (
                        <div key={source} className="flex items-center justify-between rounded-md bg-white/[0.04] px-3 py-2 text-sm">
                          <span>{source}</span>
                          <span className="font-mono text-[#d8ff5f]">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">Source Scorecard</h3>
                        <p className="mt-1 text-sm text-[#aebbb7]">
                          {analytics?.sourceScorecard?.summary.recommendation || "Vega is waiting for source performance data."}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-right text-xs">
                        <div className="rounded-sm bg-white/[0.04] px-3 py-2">
                          <p className="uppercase tracking-[0.12em] text-[#83d0c2]">Scale</p>
                          <p className="font-mono text-lg text-[#d8ff5f]">{analytics?.sourceScorecard?.summary.scaleReady || 0}</p>
                        </div>
                        <div className="rounded-sm bg-white/[0.04] px-3 py-2">
                          <p className="uppercase tracking-[0.12em] text-[#83d0c2]">Fix</p>
                          <p className="font-mono text-lg text-[#ffb3b3]">{analytics?.sourceScorecard?.summary.needsFix || 0}</p>
                        </div>
                        <div className="rounded-sm bg-white/[0.04] px-3 py-2">
                          <p className="uppercase tracking-[0.12em] text-[#83d0c2]">Sources</p>
                          <p className="font-mono text-lg text-white">{analytics?.sourceScorecard?.summary.sources || 0}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-[980px] w-full text-left text-xs">
                        <thead className="text-[#83d0c2]">
                          <tr className="border-b border-white/10">
                            <th className="py-2 pr-3 font-semibold">Source</th>
                            <th className="py-2 pr-3 font-semibold">Verdict</th>
                            <th className="py-2 pr-3 font-semibold">Leads</th>
                            <th className="py-2 pr-3 font-semibold">Sent</th>
                            <th className="py-2 pr-3 font-semibold">Delivered</th>
                            <th className="py-2 pr-3 font-semibold">Open</th>
                            <th className="py-2 pr-3 font-semibold">Click</th>
                            <th className="py-2 pr-3 font-semibold">Reply</th>
                            <th className="py-2 pr-3 font-semibold">Booked</th>
                            <th className="py-2 pr-3 font-semibold">Fail</th>
                            <th className="py-2 pr-3 font-semibold">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(analytics?.sourceScorecard?.rows || []).slice(0, 8).map((row) => (
                            <tr key={row.source} className="border-b border-white/5 align-top">
                              <td className="py-3 pr-3">
                                <p className="font-semibold text-white">{row.source}</p>
                                <p className="mt-1 max-w-[280px] text-[#aebbb7]">{row.nextMove}</p>
                              </td>
                              <td className="py-3 pr-3">
                                <span
                                  className={`rounded-sm px-2 py-1 font-semibold ${
                                    row.verdict === "scale"
                                      ? "bg-[#d8ff5f] text-[#101417]"
                                      : row.verdict === "fix"
                                        ? "bg-[#ff6b6b]/20 text-[#ffb3b3]"
                                        : "bg-white/[0.08] text-[#d6dfdc]"
                                  }`}
                                >
                                  {row.verdict}
                                </span>
                              </td>
                              <td className="py-3 pr-3 font-mono">{row.leads}</td>
                              <td className="py-3 pr-3 font-mono">{row.sent}</td>
                              <td className="py-3 pr-3 font-mono">{row.delivered}</td>
                              <td className="py-3 pr-3 font-mono">{row.openRate}%</td>
                              <td className="py-3 pr-3 font-mono">{row.clickRate}%</td>
                              <td className="py-3 pr-3 font-mono">{row.replyRate}%</td>
                              <td className="py-3 pr-3 font-mono">{row.booked}</td>
                              <td className="py-3 pr-3 font-mono">{row.failRate}%</td>
                              <td className="py-3 pr-3 font-mono text-[#d8ff5f]">{row.score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
                    <h3 className="font-semibold">Lead-to-cash funnel</h3>
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      {Object.entries(analytics?.funnel || {}).map(([stage, count]) => (
                        <div key={stage} className="rounded-md bg-white/[0.04] p-3">
                          <p className="text-xs uppercase tracking-[0.12em] text-[#83d0c2]">{stage}</p>
                          <p className="mt-2 font-mono text-xl text-white">{count}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>

                <Panel title="Integration Health" icon={Gauge}>
                  <div className="grid gap-3">
                    {Object.entries(integrations).map(([name, status]) => (
                      <div key={name} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-semibold capitalize">{name}</h3>
                          <span
                            className={`size-3 rounded-full ${
                              status.configured || status.reachable ? "bg-[#d8ff5f]" : "bg-[#6b7470]"
                            }`}
                          />
                        </div>
                        <p className="mt-2 text-sm text-[#aebbb7]">
                          {formatIntegrationStatus(status)}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Niche Attribution" icon={Target}>
                  <div className="space-y-3">
                    {Object.entries(analytics?.nicheAttribution || {}).map(([niche, row]) => (
                      <div key={niche} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-semibold">{niche}</h3>
                          <span className="font-mono text-[#d8ff5f]">{money(row.pipeline)}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-[#aebbb7]">
                          <span>{row.leads} leads</span>
                          <span>{row.queued} queued</span>
                          <span>{row.replies} replies</span>
                          <span>{row.booked} booked</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            )}

            {active === "readiness" && (
              <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
                <Panel title="Launch Readiness" icon={CheckCircle2}>
                  <div className="grid gap-3">
                    {readinessItems.map((item) => (
                      <div key={item.label} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-semibold">{item.label}</h3>
                            <p className="mt-1 text-sm text-[#aebbb7]">{item.detail}</p>
                          </div>
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-semibold ${
                              item.ok ? "bg-[#d8ff5f] text-[#101417]" : "bg-[#283239] text-[#d6dfdc]"
                            }`}
                          >
                            {item.ok ? "ready" : "needs work"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Before Paid Volume" icon={Target}>
                  <div className="space-y-3 text-sm text-[#b6c4bf]">
                    <p className="rounded-md bg-white/[0.04] p-3">Run PDL previews at 5-10 records until match quality is right.</p>
                    <p className="rounded-md bg-white/[0.04] p-3">Import only records with an email or mobile and a clear decision-maker title.</p>
                    <p className="rounded-md bg-white/[0.04] p-3">Keep outreach in approval mode until the first real replies are classified cleanly.</p>
                    <p className="rounded-md bg-white/[0.04] p-3">Use suppression rules for existing customers, competitors, and bad-fit domains.</p>
                  </div>
                </Panel>

                <Panel title="Twilio Launch Control" icon={MessageSquareText}>
                  <div className="space-y-4">
                    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold">SMS and voice readiness</h3>
                          <p className="mt-1 text-sm text-[#aebbb7]">
                            A2P is {String(twilioHealth.a2pStatus || "pending")}. Keep dry-run on until Twilio approves the campaign.
                          </p>
                        </div>
                        <span className={`rounded-sm px-2 py-1 text-xs font-semibold ${twilioReady ? "bg-[#d8ff5f] text-[#101417]" : "bg-[#283239] text-[#d6dfdc]"}`}>
                          {twilioReady ? "wired" : "needs env"}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                        {[
                          ["Mode", outreachStatus.mode],
                          ["Provider", outreachStatus.smsProvider],
                          ["From number", String(twilioHealth.fromNumber || "missing")],
                          ["Owner test", String(twilioHealth.testTo || "missing")],
                          ["A2P", String(twilioHealth.a2pStatus || "pending")],
                          ["Preferred", String(twilioHealth.preferred || false)],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-sm bg-[#101417] p-3">
                            <p className="uppercase tracking-[0.12em] text-[#8fa09a]">{label}</p>
                            <p className="mt-1 font-semibold text-white">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-white/10 bg-[#101417] p-4">
                      <h3 className="font-semibold">Webhook map</h3>
                      <div className="mt-3 space-y-2 text-xs text-[#b6c4bf]">
                        <p><span className="text-[#83d0c2]">SMS inbound:</span> /api/twilio/messaging</p>
                        <p><span className="text-[#83d0c2]">SMS status:</span> /api/twilio/messaging/status</p>
                        <p><span className="text-[#83d0c2]">Voice inbound:</span> /api/twilio/voice</p>
                        <p><span className="text-[#83d0c2]">Voice status:</span> /api/twilio/voice/status</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={sendTwilioTest}
                      disabled={twilioTestBusy || twilioHealth.testTo !== "configured"}
                      className="inline-flex items-center gap-2 rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {twilioTestBusy && <LoaderCircle className="animate-spin" size={16} />}
                      Send Owner Test
                    </button>
                    {twilioHealth.testTo !== "configured" ? (
                      <p className="text-sm text-[#9fb0a8]">Add TWILIO_TEST_TO or OWNER_PHONE_NUMBER to enable the owner test.</p>
                    ) : null}
                  </div>
                </Panel>

                <Panel title="Automation Lanes" icon={Rocket}>
                  <div className="grid gap-3">
                    {automationLanes.map((lane) => (
                      <div key={lane.title} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-semibold">{lane.title}</h3>
                            <p className="mt-1 text-sm text-[#aebbb7]">{lane.detail}</p>
                          </div>
                          <span className={`rounded-sm px-2 py-1 text-xs font-semibold ${lane.ready ? "bg-[#d8ff5f] text-[#101417]" : "bg-[#283239] text-[#d6dfdc]"}`}>
                            {lane.ready ? "ready" : lane.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            )}

            {active === "proposal" && (
              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Call Prep" icon={PhoneCall}>
                  <LeadBrief lead={selectedLead} />
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => generateOutreach("call-prep")}
                      className="rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                    >
                      Generate Call Prep
                    </button>
                    <button
                      type="button"
                      onClick={() => runBookingAgent(selectedLead, "operator")}
                      className="rounded-md bg-[#83d0c2] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                    >
                      Run Booking Agent
                    </button>
                  </div>
                  <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
                    <h3 className="font-semibold">Booking Payload</h3>
                    <div className="mt-3 grid gap-2 text-sm text-[#b6c4bf] md:grid-cols-2">
                      {buildBookingPayload(selectedLead, integrations).map((item) => (
                        <div key={item.label} className="rounded-md bg-white/[0.04] p-3">
                          <p className="text-xs uppercase tracking-[0.12em] text-[#8fa09a]">{item.label}</p>
                          <p className="mt-1 text-white">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
                    <h3 className="font-semibold">Booking Tasks</h3>
                    <div className="mt-3 space-y-2">
                      {bookingTasks.slice(0, 4).map((task) => (
                        <div key={task.id} className="rounded-md bg-white/[0.04] p-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{task.meetingTitle}</p>
                              <p className="mt-1 text-[#9fb0a8]">{task.ownerEmail || "owner missing"} - {task.durationMinutes} min</p>
                            </div>
                            <span className="rounded-sm bg-[#283239] px-2 py-1 text-xs text-[#d6dfdc]">{task.status}</span>
                          </div>
                        </div>
                      ))}
                      {!bookingTasks.length && (
                        <p className="text-sm text-[#9fb0a8]">Booking tasks will appear after the Booking Agent runs.</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3">
                    {(callPrep
                      ? callPrep.split("\n").filter(Boolean)
                      : [
                      "Lead waste is the opening pain.",
                      "Demo the revival board before discussing technology.",
                      "Offer setup plus monthly optimization, with optional rev share.",
                      "Close on a 7-day pilot against old contacts.",
                    ]).map((item) => (
                      <div key={item} className="flex gap-3 rounded-md bg-white/[0.04] p-3 text-sm text-[#d6dfdc]">
                        <CheckCircle2 size={18} className="shrink-0 text-[#83d0c2]" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Proposal Stack" icon={FileText}>
                  <button
                    type="button"
                    onClick={createProposalFromLead}
                    className="mb-4 rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                  >
                    Generate Proposal
                  </button>
                  <button
                    type="button"
                    onClick={syncSelectedLeadToCrm}
                    className="mb-4 ml-2 rounded-md bg-[#83d0c2] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
                  >
                    Sync to GhostCRM
                  </button>
                  {proposalShareUrl && (
                    <a
                      href={proposalShareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-4 ml-2 inline-flex rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#d8ff5f]"
                    >
                      Open Proposal
                    </a>
                  )}
                  <div className="space-y-4">
                    {projectOfferLines.map((line) => (
                      <OfferLine key={line.title} title={line.title} price={line.price} detail={line.detail} />
                    ))}
                  </div>
                  <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
                    <h3 className="font-semibold">Next Money-Path Agents</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {[
                        ["Booking Agent", "Turns booked replies into calendar holds, Zoom links, reminders, and prep notes."],
                        ["Slack Ops Agent", "Posts hot replies, booking alerts, failed sends, and proposal-ready updates."],
                        ["Retention Agent", "After close, tracks install milestones, client check-ins, and expansion offers."],
                        ["Rev Share Tracker", "Connects won/recovered revenue back to campaign source and offer path."],
                      ].map(([title, detail]) => (
                        <div key={title} className="rounded-md bg-white/[0.04] p-3">
                          <p className="font-semibold text-white">{title}</p>
                          <p className="mt-1 text-xs leading-5 text-[#aebbb7]">{detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {proposalSummary && (
                    <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
                      <h3 className="font-semibold">Generated Proposal Draft</h3>
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#d6dfdc]">
                        {proposalSummary}
                      </p>
                    </div>
                  )}
                </Panel>
                <Panel title="Reply Classifier" icon={MessageSquareText}>
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    className="min-h-32 w-full rounded-md border border-white/10 bg-[#101417] p-4 text-sm text-[#eef5f1] outline-none transition focus:border-[#83d0c2]"
                  />
                  <button
                    type="button"
                    onClick={classifyReply}
                    className="mt-3 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-[#d8ff5f]"
                  >
                    Classify Reply
                  </button>
                  <div className="mt-4 rounded-md bg-white/[0.04] p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-[#9fb0a8]">
                      Classification
                    </p>
                    <p className="mt-2 font-mono text-2xl text-[#d8ff5f]">
                      {replyClassification || "waiting"}
                    </p>
                  </div>
                </Panel>
                <Panel title="Sequence Queue" icon={ClipboardList}>
                  <div className="space-y-2">
                    {sequenceQueue.slice(0, 6).map((step) => (
                      <div key={step.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">
                              Step {step.stepNumber}: {step.channel}
                            </p>
                            <p className="mt-1 line-clamp-2 text-[#aebbb7]">{step.body}</p>
                          </div>
                          <span className="rounded-sm bg-[#283239] px-2 py-1 text-xs text-[#d6dfdc]">{step.status}</span>
                        </div>
                      </div>
                    ))}
                    {!sequenceQueue.length && (
                      <p className="rounded-md border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm text-[#9fb0a8]">
                        Saved outreach sequence steps will appear here before they are approved or scheduled.
                      </p>
                    )}
                  </div>
                </Panel>
              </div>
            )}

            {active === "library" && (
              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <Panel title="Agent Library" icon={Bot}>
                  <div className="grid gap-4 md:grid-cols-2">
                    {agentTemplates.map((agent) => (
                      <div key={agent.id || agent.name} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <h3 className="font-semibold">{agent.name}</h3>
                          <PlayCircle size={18} className="text-[#d8ff5f]" />
                        </div>
                        <p className="text-sm text-[#aebbb7]">{agent.use}</p>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-sm bg-[#283239] px-2 py-1 text-[#b7c8c1]">{agent.source}</span>
                          <span className="rounded-sm bg-[#e2f0f0] px-2 py-1 font-mono text-[#132322]">{agent.price}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Prompt Library" icon={Sparkles}>
                  <div className="space-y-3">
                    {prompts.map((prompt) => (
                      <div key={prompt.id || prompt.body} className="rounded-md border border-white/10 bg-[#151a1e] p-4">
                        <p className="text-sm text-[#d6dfdc]">{prompt.body}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Gauge;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-[#151a1e] p-5">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-[#aebbb7]">{title}</p>
        <Icon size={18} className="text-[#83d0c2]" />
      </div>
      <p className="font-mono text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-[#8fa09a]">{detail}</p>
    </div>
  );
}

function StatusBanner({ mode, message }: { mode: "live" | "demo" | "connecting"; message: string }) {
  const tone = {
    live: {
      label: "Live data",
      className: "border-[#83d0c2]/30 bg-[#83d0c2]/8 text-[#cfe7e0]",
      dot: "bg-[#d8ff5f]",
    },
    demo: {
      label: "Demo fallback",
      className: "border-[#d8ff5f]/30 bg-[#d8ff5f]/10 text-[#f0ffd0]",
      dot: "bg-[#d8ff5f]",
    },
    connecting: {
      label: "Connecting",
      className: "border-white/15 bg-white/[0.04] text-[#d6dfdc]",
      dot: "bg-[#83d0c2]",
    },
  }[mode];

  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${tone.className}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-sm bg-[#101417]/80 px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em]">
          <span className={`size-2 rounded-full ${tone.dot}`} />
          {tone.label}
        </span>
        <span className="leading-5">{message}</span>
      </div>
    </div>
  );
}

function buildNextBestAction(lead: Lead, demoMode: boolean) {
  const prefix = demoMode ? "Demo next move" : "Highest leverage move";
  if (lead.stage === "Call Booked") {
    return {
      label: prefix,
      title: `Prep the call for ${lead.company}.`,
      detail: `${lead.name} is booked. Bring the demo path, pricing angle, and close question before this turns into a loose follow-up.`,
    };
  }
  if (lead.stage === "Replied") {
    return {
      label: prefix,
      title: `Turn ${lead.company}'s reply into a booked audit.`,
      detail: `${lead.name} already engaged. Send the next concrete step, offer two times, and keep the ask simple.`,
    };
  }
  if (lead.stage === "Proposal Sent") {
    return {
      label: prefix,
      title: `Close the proposal loop with ${lead.company}.`,
      detail: `Use the value angle, restate the pilot path, and ask for approval to start the install.`,
    };
  }
  return {
    label: prefix,
    title: `Queue the first-touch opener for ${lead.company}.`,
    detail: `${lead.name} is the highest-scored lead in view. Review fit, then queue the source-aware outreach draft.`,
  };
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Gauge;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-[#151a1e] p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Icon size={19} className="text-[#d8ff5f]" />
      </div>
      {children}
    </section>
  );
}

function ProviderPill({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="rounded-md bg-white/[0.04] px-3 py-2">
      <p className="text-xs uppercase tracking-[0.14em] text-[#8fa09a]">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold capitalize text-[#eef5f1]">{value}</span>
        <span
          className={`size-2 rounded-full ${active ? "bg-[#d8ff5f]" : "bg-[#6b7470]"}`}
        />
      </div>
    </div>
  );
}

function LeadBrief({ lead }: { lead: Lead }) {
  const buyerFit = lead.next.match(/Buyer fit: ([^.]+)/)?.[1];
  return (
    <div className="rounded-md border border-white/10 bg-[#101417] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.14em] text-[#83d0c2]">
            {lead.niche}
          </p>
          <h3 className="mt-1 text-2xl font-semibold">{lead.company}</h3>
          <p className="mt-1 text-sm text-[#aebbb7]">{lead.name}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-mono text-3xl text-[#d8ff5f]">{lead.score}</p>
          <p className="text-sm text-[#aebbb7]">{money(lead.value)}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        <span className="rounded-sm bg-white/[0.04] px-3 py-2">{lead.stage}</span>
        <span className="rounded-sm bg-white/[0.04] px-3 py-2">{lead.source}</span>
        <span className="rounded-sm bg-white/[0.04] px-3 py-2">{lead.lastTouch}</span>
      </div>
      {buyerFit ? (
        <p className="mt-3 inline-flex rounded-sm bg-[#d8ff5f]/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#d8ff5f]">
          Buyer fit: {buyerFit}
        </p>
      ) : null}
      <p className="mt-4 text-sm text-[#d6dfdc]">{lead.next}</p>
    </div>
  );
}

function AutomationEventLog({ events }: { events: AutomationEvent[] }) {
  return (
    <Panel title="Automation Event Log" icon={Rocket}>
      <div className="grid gap-3 lg:grid-cols-3">
        {events.slice(0, 6).map((event) => (
          <div key={event.id} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-white">{event.title}</h3>
              <span
                className={`rounded-sm px-2 py-1 text-xs font-semibold ${
                  event.status === "done"
                    ? "bg-[#d8ff5f] text-[#101417]"
                    : event.status === "blocked"
                      ? "bg-[#3a2b2b] text-[#ffc7c7]"
                      : "bg-[#283239] text-[#d6dfdc]"
                }`}
              >
                {event.status}
              </span>
            </div>
            <p className="mt-2 text-sm leading-5 text-[#aebbb7]">{event.detail}</p>
            <p className="mt-3 text-xs text-[#7f8b86]">
              {event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : "Session start"}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PipelineCard({
  lead,
  selected,
  onSelect,
  onAction,
}: {
  lead: Lead;
  selected: boolean;
  onSelect: () => void;
  onAction: () => void;
}) {
  const action = lead.stage === "Call Booked" || lead.stage === "Proposal Sent" ? "Prep" : "Work";
  const fit = lead.next.match(/Buyer fit: ([^.]+)/)?.[1];
  return (
    <div
      className={`rounded-md border p-3 transition ${
        selected ? "border-[#d8ff5f] bg-[#d8ff5f]/10" : "border-white/10 bg-[#151a1e] hover:border-[#83d0c2]"
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-5">{lead.company}</p>
          <span className="font-mono text-sm text-[#d8ff5f]">{lead.score}</span>
        </div>
        <p className="mt-1 text-xs text-[#9fb0a8]">{lead.name}</p>
        <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
          <span className="rounded-sm bg-[#101417] px-2 py-1 text-[#b7c8c1]">{lead.niche}</span>
          {fit ? <span className="rounded-sm bg-[#d8ff5f]/15 px-2 py-1 text-[#d8ff5f]">{fit}</span> : null}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span className="font-mono text-[#d6dfdc]">{money(lead.value)}</span>
          <span className="text-[#8fa09a]">{lead.lastTouch}</span>
        </div>
      </button>
      <button
        type="button"
        onClick={onAction}
        className="mt-3 w-full rounded-sm bg-white/[0.07] px-2 py-2 text-xs font-semibold text-[#d6dfdc] transition hover:bg-[#d8ff5f] hover:text-[#101417]"
      >
        {action}
      </button>
    </div>
  );
}

function LeadDetailPanel({
  lead,
  editScore,
  editValue,
  editNextAction,
  onScoreChange,
  onValueChange,
  onNextActionChange,
  onSave,
  onStageChange,
}: {
  lead: Lead;
  editScore: string;
  editValue: string;
  editNextAction: string;
  onScoreChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onNextActionChange: (value: string) => void;
  onSave: () => void;
  onStageChange: (stage: Stage) => void;
}) {
  return (
    <Panel title="Lead Detail" icon={Inbox}>
      <LeadBrief lead={lead} />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm text-[#aebbb7]">
          Score
          <input
            value={editScore}
            onChange={(event) => onScoreChange(event.target.value)}
            className="rounded-md border border-white/10 bg-[#101417] px-3 py-2 font-mono text-white outline-none focus:border-[#83d0c2]"
            inputMode="numeric"
          />
        </label>
        <label className="grid gap-2 text-sm text-[#aebbb7]">
          Value
          <input
            value={editValue}
            onChange={(event) => onValueChange(event.target.value)}
            className="rounded-md border border-white/10 bg-[#101417] px-3 py-2 font-mono text-white outline-none focus:border-[#83d0c2]"
            inputMode="numeric"
          />
        </label>
      </div>
      <label className="mt-4 grid gap-2 text-sm text-[#aebbb7]">
        Next action
        <textarea
          value={editNextAction}
          onChange={(event) => onNextActionChange(event.target.value)}
          className="min-h-24 rounded-md border border-white/10 bg-[#101417] px-3 py-2 text-white outline-none focus:border-[#83d0c2]"
        />
      </label>
      <button
        type="button"
        onClick={onSave}
        className="mt-3 rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white"
      >
        Save Lead
      </button>
      <div className="mt-5">
        <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[#9fb0a8]">
          Stage
        </p>
        <div className="grid grid-cols-2 gap-2">
          {stages.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => onStageChange(stage)}
              className={`rounded-md px-3 py-2 text-xs font-medium transition ${
                lead.stage === stage
                  ? "bg-[#d8ff5f] text-[#101417]"
                  : "bg-white/[0.06] text-[#d6dfdc] hover:bg-white/12"
              }`}
            >
              {stage}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 rounded-md border border-white/10 bg-[#101417] p-4">
        <h3 className="font-semibold">Timeline</h3>
        <div className="mt-3 space-y-3">
          {lead.interactions?.length ? (
            lead.interactions.map((interaction) => (
              <div key={interaction.id} className="rounded-md bg-white/[0.04] p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[#9fb0a8]">
                  <span>{interaction.channel}</span>
                  <span>{interaction.direction}</span>
                  <span>{interaction.classification || "unclassified"}</span>
                </div>
                <p className="line-clamp-4 whitespace-pre-line text-[#d6dfdc]">
                  {interaction.body}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[#9fb0a8]">No timeline activity yet.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function CopyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <MessageSquareText size={17} className="text-[#83d0c2]" />
      </div>
      <p className="whitespace-pre-line text-sm leading-6 text-[#d6dfdc]">{text}</p>
    </div>
  );
}

function isQualitySourceLead(lead: SourceLead) {
  const hasContact = Boolean(lead.email || lead.phone);
  const fit = lead.buyerFit.toLowerCase();
  const company = lead.companyName.toLowerCase();
  const hasSignal = Boolean(lead.signalSummary || lead.intentSignals?.length);
  const badCompany = ["association", "university", "school", "government", "municipal"].some((term) =>
    company.includes(term),
  );
  return hasContact && hasSignal && lead.score >= 70 && !fit.includes("risk") && !badCompany;
}

function extractBuyerSignal(lead: Lead) {
  const match = lead.next.match(/Signal: ([^.]+)/i);
  return match?.[1]?.trim() || "";
}

function buildOutreachSequence(lead: Lead, mode: "fresh" | "revival" | "booked") {
  const firstName = lead.name.split(" ")[0] || "there";
  const niche = lead.niche.toLowerCase();
  const signal = extractBuyerSignal(lead) || "your team may be leaking qualified conversations before they reach the calendar";
  if (mode === "booked") {
    return [
      {
        day: "Now",
        channel: "Email",
        goal: "Confirm the call",
        copy: `${firstName}, confirming the call. I will bring a simple workflow map for where ${lead.company} can recover missed leads and speed up follow-up.`,
      },
      {
        day: "T-2h",
        channel: "SMS",
        goal: "Reduce no-show risk",
        copy: `Quick reminder for our call today. I will keep it tight: current lead flow, missed revenue, and the fastest automation install.`,
      },
      {
        day: "After",
        channel: "Email",
        goal: "Send proposal path",
        copy: `Good talking. Here is the simple path: install the follow-up workflow, classify replies, book the interested ones, then optimize weekly.`,
      },
    ];
  }
  if (mode === "revival") {
    return [
      {
        day: "Day 0",
        channel: "SMS",
        goal: "Reopen old demand",
        copy: `Hey ${firstName}, are you still trying to convert the older ${niche} leads sitting in ${lead.company}'s pipeline?`,
      },
      {
        day: "Day 2",
        channel: "Email",
        goal: "Show ROI angle",
        copy: `I built a dead-lead workflow that writes follow-up, classifies replies, and books interested contacts. Worth seeing against your old list?`,
      },
      {
        day: "Day 5",
        channel: "SMS",
        goal: "Book the audit",
        copy: `Want me to show the 15-minute version? If there is no recovered revenue path, we skip it.`,
      },
    ];
  }
  return [
    {
      day: "Day 0",
      channel: "Email",
      goal: "Open with buyer signal",
      copy: `${firstName}, quick idea for ${lead.company}: I noticed ${signal}. I can show the signal-to-meeting workflow I would run to turn that into qualified calls.`,
    },
    {
      day: "Day 2",
      channel: "SMS",
      goal: "Human nudge",
      copy: `Worth a quick look if I showed how this would work against your current ${niche} pipeline?`,
    },
    {
      day: "Day 6",
      channel: "Email",
      goal: "Offer proof/demo",
      copy: `I can show the actual board: buyer signals, enrichment, approved outreach, reply routing, and booked-call handoff.`,
    },
  ];
}

function buildAutomationLanes(integrations: IntegrationPayload, outreachStatus: OutreachStatus) {
  return [
    {
      title: "Booking to Calendar",
      status: integrations.calendar?.configured ? "payload ready" : "needs env",
      ready: Boolean(integrations.calendar?.configured),
      detail: "When a reply is classified as booked, create a calendar event, attach call prep, and move the lead to Call Booked.",
    },
    {
      title: "Zoom Link Generation",
      status: integrations.zoom?.configured || integrations.zoom?.meetingLink === "static" ? "link ready" : "needs env",
      ready: Boolean(integrations.zoom?.configured || integrations.zoom?.meetingLink === "static"),
      detail: "Generate or attach a meeting link during booking confirmation so every call has one source of truth.",
    },
    {
      title: "Slack Revenue Alerts",
      status: integrations.slack?.configured ? "payload ready" : "needs env",
      ready: Boolean(integrations.slack?.configured),
      detail: "Notify the operator when a hot reply, booked call, approval failure, or won proposal happens.",
    },
    {
      title: "GhostCRM Qualified Sync",
      status: integrations.ghostcrm?.configured ? "guarded" : "needs env",
      ready: Boolean(integrations.ghostcrm?.configured),
      detail: "Only push qualified, replied, booked, proposal, or won records into GhostCRM.",
    },
    {
      title: "Provider Failover",
      status: outreachStatus.telnyxConfigured || outreachStatus.twilioConfigured ? "partial" : "needs env",
      ready: outreachStatus.telnyxConfigured && outreachStatus.twilioConfigured,
      detail: "Use Telnyx first, then Twilio fallback for SMS after approval.",
    },
  ];
}

function buildBookingPrep(lead: Lead) {
  return [
    {
      label: "Opening",
      detail: `Confirm ${lead.company}'s current lead flow and where missed requests are leaking.`,
    },
    {
      label: "Proof",
      detail: `Show the Lead Command path: source/import, approve outreach, classify replies, and book calls.`,
    },
    {
      label: "Offer",
      detail: "Position a 7-day pilot with setup, response desk, and optional recovered-revenue share.",
    },
    {
      label: "Close",
      detail: "Ask for approval to start with one segment and measure booked calls.",
    },
  ];
}

function buildBookingPayload(lead: Lead, integrations: IntegrationPayload) {
  const calendarReady = Boolean(integrations.calendar?.configured);
  const zoomReady = Boolean(integrations.zoom?.configured || integrations.zoom?.meetingLink === "static");
  return [
    { label: "Lead", value: `${lead.name} at ${lead.company}` },
    { label: "Stage", value: lead.stage },
    { label: "Calendar", value: calendarReady ? `Ready via ${integrations.calendar?.provider}` : "Blocked: calendar env missing" },
    { label: "Meeting link", value: zoomReady ? "Ready" : "Blocked: Zoom/static meeting URL missing" },
    { label: "Duration", value: `${integrations.calendar?.defaultDuration || "30"} minutes` },
    { label: "Owner", value: integrations.calendar?.owner === "configured" ? "Booking owner configured" : "Blocked: BOOKING_OWNER_EMAIL missing" },
  ];
}

function parseSequenceDay(day: string) {
  const lower = day.toLowerCase();
  if (lower.includes("t-") || lower.includes("now")) return 0;
  const match = lower.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function EditableCopyBlock({
  title,
  value,
  onChange,
  subject,
  onSubjectChange,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  subject?: string;
  onSubjectChange?: (value: string) => void;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <MessageSquareText size={17} className="text-[#83d0c2]" />
      </div>
      {onSubjectChange ? (
        <label className="mb-3 grid gap-2 text-xs uppercase tracking-[0.12em] text-[#8fa09a]">
          Subject
          <input
            value={subject || ""}
            onChange={(event) => onSubjectChange(event.target.value)}
            className="rounded-md border border-white/10 bg-[#101417] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-[#83d0c2]"
          />
        </label>
      ) : null}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-44 w-full resize-y rounded-md border border-white/10 bg-[#101417] p-3 text-sm leading-6 text-[#d6dfdc] outline-none focus:border-[#83d0c2]"
      />
    </div>
  );
}

function isFreshSourcedLead(lead: Lead) {
  return lead.source.toLowerCase().includes("people data labs") || lead.next.toLowerCase().includes("first-touch");
}

function buildOutreachCopy(lead: Lead) {
  const firstName = lead.name.split(" ")[0] || "there";
  const company = lead.company;
  const niche = lead.niche.toLowerCase();
  const signal = extractBuyerSignal(lead);

  if (isFreshSourcedLead(lead)) {
    const signalLine = signal || "you look like a fit for a signal-based outbound test";
    return {
      subject: "signal-to-meeting idea",
      sms: `Hey ${firstName}, noticed ${signalLine}. I am building a signal-to-meeting engine for ${niche} teams. Worth a quick look at how it would find and book warmer prospects for ${company}?`,
      email: `Subject: signal-to-meeting idea\n\n${firstName}, quick idea for ${company}.\n\nI noticed ${signalLine}.\n\nI am building a lead engine that finds warm buyer signals, enriches the account, writes the first touch, and routes replies into booked calls for ${niche} teams.\n\nWorth a quick look if I showed the exact workflow I would run for ${company}?`,
    };
  }

  return {
    subject: "old leads hiding revenue",
    sms: `Hey ${firstName}, quick one: are you still trying to convert the old ${niche} leads sitting in ${company}'s pipeline? I can show you an AI follow-up system that revives them and only takes 15 minutes to demo.`,
    email: `Subject: old leads hiding revenue\n\n${firstName}, I built a dead-lead revival workflow for businesses like ${company}. It pulls old inquiries, writes human follow-up, classifies replies, and books the interested ones.\n\nWorth a quick look this week?`,
  };
}

function buildProjectOfferLines(lead: Lead) {
  const niche = lead.niche.toLowerCase();
  const value = Math.max(lead.value || 7500, 3500);
  const pilotValue = `$${value.toLocaleString()}`;
  const fresh = isFreshSourcedLead(lead);
  const hasBuyingSignal = lead.score >= 90 || ["replied", "call booked", "proposal sent"].includes(lead.stage.toLowerCase());
  const setupFee = value >= 10000 || lead.score >= 95 ? 3500 : value >= 6500 ? 2500 : 1500;
  const monthlyFee = hasBuyingSignal ? 1500 : 1000;
  const revShare = value >= 10000 ? 10 : 12;
  const project = fresh ? "Fresh lead capture sprint" : "Lead recovery sprint";

  return [
    {
      title: `${project}`,
      price: `$${setupFee.toLocaleString()}`,
      detail: fresh
        ? `Map how ${lead.company} handles missed calls, estimate requests, and slow follow-up for ${niche} buyers.`
        : `Import and segment ${lead.company}'s older ${niche} contacts, then restart the highest-intent conversations.`,
    },
    {
      title: "AI response desk",
      price: `$${monthlyFee.toLocaleString()}/mo`,
      detail: "Classify replies, surface hot leads, prep calls, and keep the follow-up path improving after launch.",
    },
    {
      title: "Booked-call demo pack",
      price: "$1,500",
      detail: `Build the proof path around ${lead.company}: lead intake, approval queue, reply routing, booking prep, and CRM sync.`,
    },
    {
      title: "Upside share",
      price: `${revShare}%`,
      detail: `Optional recovered-revenue share when attribution is visible; current target opportunity is about ${pilotValue}.`,
    },
  ];
}

function GeneratedCopy({ mode, lead }: { mode: string; lead: Lead }) {
  const outreachCopy = buildOutreachCopy(lead);
  const copy = {
    revival: outreachCopy.email,
    audit: isFreshSourcedLead(lead)
      ? `${lead.company} could probably recover missed revenue in three places: missed calls, slow estimate follow-up, and form fills that never get worked. I can run a quick AI follow-up audit and show the exact workflow I would install.`
      : `${lead.company} could probably recover missed revenue in three places: old leads, slow follow-up, and untracked calls. I can run a quick AI audit and show the exact automation stack I would install.`,
    retainer: `After the revival install, the monthly layer keeps improving replies, call prep, offers, and follow-up. The goal is simple: every lead gets worked, every reply gets routed, and every booked call gets a proposal.`,
  }[mode];

  return (
    <div className="rounded-md border border-white/10 bg-[#101417] p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm uppercase tracking-[0.14em] text-[#83d0c2]">
          Generated sequence
        </p>
        <span className="rounded-sm bg-[#d8ff5f] px-2 py-1 text-xs font-semibold text-[#111]">
          {mode}
        </span>
      </div>
      <p className="text-lg leading-8 text-[#eef5f1]">{copy}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MiniMetric label="Reply target" value="12-18%" />
        <MiniMetric label="Book target" value="4-7%" />
        <MiniMetric label="Pilot close" value="$2.5k+" />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/[0.05] p-3">
      <p className="text-xs text-[#9fb0a8]">{label}</p>
      <p className="mt-1 font-mono text-lg text-white">{value}</p>
    </div>
  );
}

function OfferLine({
  title,
  price,
  detail,
}: {
  title: string;
  price: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <span className="font-mono text-[#d8ff5f]">{price}</span>
      </div>
      <p className="mt-2 text-sm text-[#aebbb7]">{detail}</p>
    </div>
  );
}


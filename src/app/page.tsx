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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Stage =
  | "Imported"
  | "Contacted"
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
  score: number;
  confidence: string;
};

type SourcingStatus = {
  pdlConfigured: boolean;
  ghostLeadAgentConfigured: boolean;
  mockSourceEnabled: boolean;
  maxPreviewSize: number;
};

type SourceCampaign = {
  id: string;
  name: string;
  provider: "pdl" | "ghost-lead-agent";
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
  queueByStatus: Record<string, number>;
  repliesByClass: Record<string, number>;
};

type IntegrationPayload = Record<string, Record<string, string | boolean>>;

type ActionToast = {
  phase: "loading" | "success" | "error";
  title: string;
  detail: string;
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

const stages: Stage[] = [
  "Imported",
  "Contacted",
  "Replied",
  "Call Booked",
  "Proposal Sent",
  "Won",
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
  { id: "source", label: "Source", icon: Target },
  { id: "pipeline", label: "Pipeline", icon: Layers3 },
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

export default function Home() {
  const [active, setActive] = useState("dashboard");
  const [liveLeads, setLiveLeads] = useState(seedLeads);
  const [liveAgents, setLiveAgents] = useState(seedAgentTemplates);
  const [livePrompts, setLivePrompts] = useState(seedPrompts);
  const [selectedLead, setSelectedLead] = useState(seedLeads[0]);
  const [campaignMode, setCampaignMode] = useState("revival");
  const [csvText, setCsvText] = useState(sampleCsv);
  const [importPreview, setImportPreview] = useState<ImportPreview[]>([]);
  const [operationStatus, setOperationStatus] = useState("Database connected. Ready to work leads.");
  const [actionToast, setActionToast] = useState<ActionToast | null>(null);
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
    mockSourceEnabled: false,
    maxPreviewSize: 100,
  });
  const [sourceProvider, setSourceProvider] = useState<"pdl" | "ghost-lead-agent">("pdl");
  const [sourceQuery, setSourceQuery] = useState("owners of dental, HVAC, roofing, med spa businesses");
  const [sourceLocation, setSourceLocation] = useState("United States");
  const [sourceIndustry, setSourceIndustry] = useState("Dental, HVAC, Roofing, Med Spa");
  const [sourceLimit, setSourceLimit] = useState("25");
  const [sourceResults, setSourceResults] = useState<SourceLead[]>([]);
  const [sourceStatus, setSourceStatus] = useState("Ready to find fresh contacts.");
  const [sourceScrollToken, setSourceScrollToken] = useState<string | null>(null);
  const [sourceCampaigns, setSourceCampaigns] = useState<SourceCampaign[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [replyItems, setReplyItems] = useState<ReplyItem[]>([]);
  const [suppressionItems, setSuppressionItems] = useState<SuppressionItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationPayload>({});
  const [replyDraft, setReplyDraft] = useState("Can you send pricing and a few times this week?");
  const [suppressionValue, setSuppressionValue] = useState("");
  const [generatedOutreach, setGeneratedOutreach] = useState("");
  const [replyText, setReplyText] = useState("Sounds interesting. Can you send pricing and maybe book something this week?");
  const [replyClassification, setReplyClassification] = useState("");
  const [proposalSummary, setProposalSummary] = useState("");
  const [editScore, setEditScore] = useState(String(seedLeads[0].score));
  const [editValue, setEditValue] = useState(String(seedLeads[0].value));
  const [editNextAction, setEditNextAction] = useState(seedLeads[0].next);
  const leads = liveLeads;
  const agentTemplates = liveAgents;
  const prompts = livePrompts;

  function selectLead(lead: Lead) {
    setSelectedLead(lead);
    setEditScore(String(lead.score));
    setEditValue(String(lead.value));
    setEditNextAction(lead.next);
  }

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

        if (!cancelled && leadsResponse.ok) {
          const payload = await leadsResponse.json();
          const mappedLeads = (payload.leads || []).map(mapApiLead);
          if (mappedLeads.length) {
            setLiveLeads(mappedLeads);
            selectLead(mappedLeads[0]);
          }
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

        if (!cancelled && integrationsResponse.ok) {
          setIntegrations(await integrationsResponse.json());
        }
      } catch {
        // Seed data keeps the cockpit usable if the local DB is not ready yet.
      }
    }

    loadLiveData();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshLeads() {
    const response = await fetch("/api/leads");
    if (!response.ok) return;
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
        },
      }),
    });
    if (!response.ok) {
      setOperationStatus("AI generation failed.");
      return;
    }
    const payload = await response.json();
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
        titles: ["Owner", "Founder", "CEO", "Marketing Director", "Operations Manager"],
        size: Number(sourceLimit || 25),
        scrollToken: scrollToken || undefined,
      }),
    });

    if (!response.ok) {
      setSourceStatus("Source search failed. Check provider settings.");
      return;
    }

    const payload = await response.json();
    setSourceResults((current) => (scrollToken ? [...current, ...(payload.leads || [])] : payload.leads || []));
    setSourceScrollToken(payload.scrollToken || null);
    setSourceStatus(
      `${payload.leads?.length || 0} fresh contacts found${payload.dryRun ? " in mock mode" : ""}${payload.scrollToken ? ". More available." : "."}`,
    );
  }

  async function importSourceResults() {
    if (!sourceResults.length) {
      setSourceStatus("Search before importing.");
      return;
    }

    const response = await fetch("/api/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        records: sourceResults.map((lead) => ({
          name: lead.name,
          companyName: lead.companyName,
          email: lead.email,
          phone: lead.phone,
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
      `Imported ${payload.count || 0} fresh leads into the pipeline. Skipped ${payload.skipped || 0} duplicates.`,
    );
    setOperationStatus(
      `Fresh sourcing added ${payload.count || 0} pipeline leads and skipped ${payload.skipped || 0} duplicates.`,
    );
    await refreshLeads();
    await refreshOpsData();
  }

  async function refreshOpsData() {
    const campaignsResponse = await fetch("/api/source/campaigns");
    const queueResponse = await fetch("/api/outreach/queue");
    const repliesResponse = await fetch("/api/replies");
    const suppressionResponse = await fetch("/api/suppression");
    const analyticsResponse = await fetch("/api/analytics");
    const integrationsResponse = await fetch("/api/health/integrations");

    if (campaignsResponse.ok) setSourceCampaigns((await campaignsResponse.json()).campaigns || []);
    if (queueResponse.ok) setQueueItems((await queueResponse.json()).items || []);
    if (repliesResponse.ok) setReplyItems((await repliesResponse.json()).replies || []);
    if (suppressionResponse.ok) setSuppressionItems((await suppressionResponse.json()).records || []);
    if (analyticsResponse.ok) setAnalytics(await analyticsResponse.json());
    if (integrationsResponse.ok) setIntegrations(await integrationsResponse.json());
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
        titles: ["Owner", "Founder", "CEO", "Marketing Director", "Operations Manager"],
        dailyLimit: Number(sourceLimit || 25),
        scoreThreshold: 70,
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

  async function ensureSelectedLeadRecord() {
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
        subject: `Quick idea for ${leadToQueue.company}`,
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

  async function approveQueueItem(id: string) {
    const response = await fetch(`/api/outreach/queue/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setOperationStatus(response.ok ? "Approved queue item." : "Approval failed.");
    await refreshOpsData();
    await refreshLeads();
  }

  async function rejectQueueItem(id: string) {
    await fetch(`/api/outreach/queue/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Rejected in approval queue." }),
    });
    setOperationStatus("Rejected queue item.");
    await refreshOpsData();
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
      setOperationStatus("Reply recorded and classified.");
      await refreshOpsData();
      await refreshLeads();
    }
  }

  async function syncSelectedLeadToCrm() {
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
        classification.includes("hot") || classification.includes("booked")
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
          setupFee: 2500,
          monthlyFee: 1000,
          revSharePct: 12,
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
    setOperationStatus(`Created proposal for ${mapped.company}.`);
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

  const readinessItems = [
    {
      label: "Database",
      ok: operationStatus.toLowerCase().includes("database connected") || leads.length > 0,
      detail: operationStatus,
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
      label: "Outreach mode",
      ok: outreachStatus.mode !== "live",
      detail:
        outreachStatus.mode === "live"
          ? "Live sending is enabled. Keep approvals tight."
          : "Dry-run mode is active, so outreach will queue safely.",
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
      ok: Boolean(integrations.ghostcrm?.configured),
      detail: integrations.ghostcrm?.configured ? "GhostCRM endpoint configured." : "GhostCRM sync is not fully configured.",
    },
    {
      label: "Approval queue",
      ok: queueItems.filter((item) => item.status === "pending").length < 25,
      detail: `${queueItems.filter((item) => item.status === "pending").length} drafts waiting for approval.`,
    },
  ];

  const smsOpener = `Hey ${selectedLead.name.split(" ")[0]}, quick one: are you still trying to convert the old ${selectedLead.niche.toLowerCase()} leads sitting in ${selectedLead.company}'s pipeline? I can show you an AI follow-up system that revives them and only takes 15 minutes to demo.`;
  const emailFollowup = `Subject: old leads hiding revenue\n\n${selectedLead.name.split(" ")[0]}, I built a dead-lead revival workflow for businesses like ${selectedLead.company}. It pulls old inquiries, writes human follow-up, classifies replies, and books the interested ones. Worth a quick look this week?`;

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

          <div className="space-y-6 px-5 py-6 md:px-8">
            {active !== "queue" && (
              <div className="rounded-md border border-[#83d0c2]/25 bg-[#83d0c2]/8 px-4 py-3 text-sm text-[#cfe7e0]">
                {operationStatus}
              </div>
            )}

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
                        Highest leverage move
                      </p>
                      <h3 className="mt-3 text-2xl font-semibold">
                        Send Maya a dead-lead ROI proof and book the audit.
                      </h3>
                      <p className="mt-3 text-sm text-[#43514d]">
                        She replied from a revival list, has high intent, and the med spa niche can buy a same-week SMS follow-up install.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          selectLead(leads[0]);
                          setActive("outreach");
                        }}
                        className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#111815] px-4 py-3 text-sm font-semibold text-white"
                      >
                        Open outreach <ArrowRight size={16} />
                      </button>
                    </div>
                  </Panel>
                </div>
              </>
            )}

            {active === "source" && (
              <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
                <Panel title="Fresh Lead Source" icon={Target}>
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <p className="text-sm text-[#aebbb7]">Provider</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: "pdl", label: "People Data Labs", active: sourcingStatus.pdlConfigured },
                          { id: "ghost-lead-agent", label: "Ghost Lead Agent", active: sourcingStatus.ghostLeadAgentConfigured },
                        ].map((provider) => (
                          <button
                            key={provider.id}
                            type="button"
                            onClick={() => setSourceProvider(provider.id as "pdl" | "ghost-lead-agent")}
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
                      {sourceProvider === "ghost-lead-agent" ? "Domains or websites" : "Search brief"}
                      <textarea
                        value={sourceQuery}
                        onChange={(event) => setSourceQuery(event.target.value)}
                        placeholder={
                          sourceProvider === "ghost-lead-agent"
                            ? "example.com\nhttps://acme.io"
                            : "owners of dental, HVAC, roofing, med spa businesses"
                        }
                        className="min-h-24 rounded-md border border-white/10 bg-[#101417] px-3 py-2 text-white outline-none focus:border-[#83d0c2]"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
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
                        Use PDL to find broad contact volume, then send the best company websites through the Ghost Lead Agent for scoring, AI opportunity, and outreach context.
                      </p>
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
                        className="rounded-md bg-white/[0.08] px-4 py-2 text-sm font-semibold text-[#d6dfdc] transition hover:bg-white/12"
                      >
                        Import Results
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
                              Limit {campaign.dailyLimit} · threshold {campaign.scoreThreshold}
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
                                {lead.name} · {lead.title}
                              </p>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="font-mono text-2xl text-[#d8ff5f]">{lead.score}</p>
                              <p className="text-xs text-[#9fb0a8]">{lead.confidence}</p>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-2 text-xs text-[#b6c4bf] md:grid-cols-3">
                            <span className="rounded-sm bg-[#101417] px-2 py-2">{lead.email || "no email"}</span>
                            <span className="rounded-sm bg-[#101417] px-2 py-2">{lead.phone || "no phone"}</span>
                            <span className="rounded-sm bg-[#101417] px-2 py-2">{lead.location || lead.source}</span>
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
            )}

            {active === "pipeline" && (
              <div className="grid gap-6 2xl:grid-cols-[1fr_420px]">
                <Panel title="Lead Pipeline" icon={Layers3}>
                  <div className="grid gap-4 xl:grid-cols-6">
                    {stages.map((stage) => (
                      <div key={stage} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-semibold">{stage}</h3>
                          <span className="font-mono text-xs text-[#9fb0a8]">
                            {leads.filter((lead) => lead.stage === stage).length}
                          </span>
                        </div>
                        <div className="space-y-3">
                          {leads
                            .filter((lead) => lead.stage === stage)
                            .map((lead) => (
                              <button
                                key={lead.id || lead.company}
                                type="button"
                                onClick={() => selectLead(lead)}
                                className={`w-full rounded-md border p-3 text-left transition ${
                                  selectedLead.id === lead.id
                                    ? "border-[#d8ff5f] bg-[#d8ff5f]/10"
                                    : "border-white/10 bg-[#151a1e] hover:border-[#83d0c2]"
                                }`}
                              >
                                <p className="font-medium">{lead.company}</p>
                                <p className="mt-1 text-xs text-[#9fb0a8]">{lead.niche}</p>
                                <div className="mt-3 flex items-center justify-between text-xs">
                                  <span className="font-mono text-[#d8ff5f]">{lead.score}</span>
                                  <span>{money(lead.value)}</span>
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
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
                    <CopyBlock
                      title="SMS opener"
                      text={smsOpener}
                    />
                    <CopyBlock
                      title="Email follow-up"
                      text={emailFollowup}
                    />
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
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Panel title="Outreach Approval Queue" icon={ClipboardList}>
                  <div className="space-y-3">
                    {queueItems.length ? (
                      queueItems.map((item) => (
                        <div key={item.id} className="rounded-md border border-white/10 bg-white/[0.04] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold">
                                  {item.lead?.company || item.lead?.companyName || "Queued outreach"}
                                </h3>
                                <span className="rounded-sm bg-[#283239] px-2 py-1 text-xs text-[#b7c8c1]">
                                  {item.channel}:{item.provider}
                                </span>
                                <span className="rounded-sm bg-[#e2f0f0] px-2 py-1 text-xs font-semibold text-[#132322]">
                                  {item.status}
                                </span>
                              </div>
                              {item.subject && <p className="mt-2 text-sm text-[#eef5f1]">{item.subject}</p>}
                              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#b6c4bf]">{item.body}</p>
                              {item.reason && <p className="mt-2 text-xs text-[#9fb0a8]">{item.reason}</p>}
                            </div>
                            {item.status === "pending" ? (
                              <div className="flex shrink-0 gap-2">
                                <button
                                  type="button"
                                  onClick={() => approveQueueItem(item.id)}
                                  className="rounded-md bg-[#d8ff5f] px-3 py-2 text-xs font-semibold text-[#101417]"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectQueueItem(item.id)}
                                  className="rounded-md bg-white/[0.08] px-3 py-2 text-xs font-semibold text-[#d6dfdc]"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="rounded-md bg-white/[0.05] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9fb0a8]">
                                Final
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md border border-dashed border-white/15 bg-white/[0.03] p-8 text-center text-sm text-[#9fb0a8]">
                        No queued outreach yet.
                      </p>
                    )}
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
                  <div className="grid gap-4 md:grid-cols-2">
                    <MetricCard title="Leads" value={String(analytics?.totals.leads || leads.length)} detail="Total in command center" icon={Target} />
                    <MetricCard title="Reply Rate" value={`${Math.round((analytics?.totals.replyRate || 0) * 100)}%`} detail="Replies / sent or queued" icon={MessageSquareText} />
                    <MetricCard title="Hot Replies" value={String(analytics?.totals.hotReplies || 0)} detail="Buying intent detected" icon={Flame} />
                    <MetricCard title="Pipeline" value={money(analytics?.totals.pipeline || stats.pipeline)} detail="Tracked opportunity value" icon={WalletCards} />
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
                          {Object.entries(status).map(([key, value]) => `${key}: ${value}`).join(" · ")}
                        </p>
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
              </div>
            )}

            {active === "proposal" && (
              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Call Prep" icon={PhoneCall}>
                  <LeadBrief lead={selectedLead} />
                  <div className="mt-5 grid gap-3">
                    {[
                      "Lead waste is the opening pain.",
                      "Demo the revival board before discussing technology.",
                      "Offer setup plus monthly optimization, with optional rev share.",
                      "Close on a 7-day pilot against old contacts.",
                    ].map((item) => (
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
                  <div className="space-y-4">
                    <OfferLine title="Revival install" price="$2,500" detail="Import, segment, and launch old-lead follow-up." />
                    <OfferLine title="AI response desk" price="$1,000/mo" detail="Classify replies, route hot leads, prep calls." />
                    <OfferLine title="Agent demo pack" price="$1,500" detail="Website audit, missed-call bot, and intake assistant." />
                    <OfferLine title="Upside share" price="12%" detail="Optional percentage of recovered revenue." />
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
      <p className="mt-4 text-sm text-[#d6dfdc]">{lead.next}</p>
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

function GeneratedCopy({ mode, lead }: { mode: string; lead: Lead }) {
  const copy = {
    revival: `Hey ${lead.name.split(" ")[0]}, I noticed ${lead.company} likely has old inquiries that never converted. We install an AI revival system that reopens those conversations, qualifies replies, and books the interested ones. Want me to show you what it would look like with your list?`,
    audit: `${lead.company} could probably recover missed revenue in three places: old leads, slow follow-up, and untracked calls. I can run a quick AI audit and show the exact automation stack I would install.`,
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

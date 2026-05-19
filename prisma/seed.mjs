import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const leads = [
  ["Maya Collins", "BrightPath Med Spa", "Wellness", "Replied", 92, 5400, "Dead lead import", "18m ago", "Send revival case study and book audit call."],
  ["Drew Landry", "Bayou Home Services", "HVAC", "Call Booked", 88, 7200, "Ghostbot", "42m ago", "Prep missed-call text-back demo."],
  ["Nia Porter", "Porter Dental Group", "Dental", "Proposal Sent", 83, 9600, "Custom CRM sync", "2h ago", "Follow up with ROI guarantee option."],
  ["Luis Rojas", "Rojas Auto Detail", "Local services", "Contacted", 76, 3000, "CSV upload", "3h ago", "Second touch with 15-minute booking CTA."],
  ["Erin Vale", "Vale Leadership Lab", "Consulting", "Won", 95, 12500, "Referral", "Today", "Install Ghostbot and start week-one revival."],
  ["Owen Price", "Price Consulting", "B2B services", "Imported", 64, 4200, "Legacy list", "Never", "Run first reactivation opener."],
];

const agents = [
  ["Dead Lead Revival Agent", "ghostbot-chat + relateos", "Reactivates old CRM records and classifies replies.", "$2,500 setup", "Show the old-list import, generated sequence, reply classifier, and booked-call tracker."],
  ["AI Website Audit Agent", "content-scrapper", "Builds pain-point proof for the sales call.", "$1,500 setup", "Run a site audit and turn the findings into a same-call proposal hook."],
  ["Missed Call Text-Back Bot", "GhostVoice + ghostcrm", "Captures calls that local businesses are wasting.", "$500/mo", "Show a missed-call event becoming a booked appointment in under one minute."],
  ["Authority Site + Admin", "ghost-enterprise-template", "Ships the client-facing delivery portal.", "$5,000 build", "Open the client portal and show services, contact capture, and admin controls."],
];

const prompts = [
  ["Revival sequence", "Write a three-touch revival sequence for old HVAC estimate requests.", "outreach"],
  ["Call brief", "Summarize this lead before the sales call with pain, money angle, and demo hook.", "call-prep"],
  ["Proposal builder", "Turn this discovery call into a two-option AI automation proposal.", "proposal"],
  ["Reply classifier", "Classify this reply as hot, nurture, objection, booked, or dead.", "classification"],
];

async function main() {
  const workspace = await prisma.workspace.upsert({
    where: { slug: "ghost-ai-solutions" },
    update: {},
    create: { name: "Ghost AI Solutions", slug: "ghost-ai-solutions" },
  });

  for (const [name, companyName, niche, stage, score, value, source, lastTouch, nextAction] of leads) {
    const company = await prisma.company.upsert({
      where: { id: `${workspace.id}:${companyName}` },
      update: {},
      create: {
        id: `${workspace.id}:${companyName}`,
        workspaceId: workspace.id,
        name: companyName,
        niche,
        crmSource: source,
      },
    });

    const contact = await prisma.contact.upsert({
      where: { id: `${workspace.id}:${name}` },
      update: {},
      create: {
        id: `${workspace.id}:${name}`,
        workspaceId: workspace.id,
        companyId: company.id,
        name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        role: "Owner",
      },
    });

    const lead = await prisma.lead.upsert({
      where: { id: `${workspace.id}:${companyName}:lead` },
      update: { stage, score, value, lastTouch, nextAction },
      create: {
        id: `${workspace.id}:${companyName}:lead`,
        workspaceId: workspace.id,
        companyId: company.id,
        contactId: contact.id,
        name,
        companyName,
        niche,
        stage,
        score,
        value,
        source,
        lastTouch,
        nextAction,
      },
    });

    await prisma.opportunity.upsert({
      where: { id: `${workspace.id}:${companyName}:opportunity` },
      update: { stage, value },
      create: {
        id: `${workspace.id}:${companyName}:opportunity`,
        companyId: company.id,
        leadId: lead.id,
        title: `${companyName} AI revival install`,
        stage,
        value,
        probability: Math.min(95, Math.max(20, score)),
      },
    });
  }

  const campaign = await prisma.campaign.upsert({
    where: { id: `${workspace.id}:dead-lead-revival` },
    update: {},
    create: {
      id: `${workspace.id}:dead-lead-revival`,
      workspaceId: workspace.id,
      name: "Dead Lead Revival",
      mode: "revival",
      audience: "Old CRM contacts and stale quote requests",
      status: "draft",
      replyTarget: 0.16,
      bookingTarget: 0.06,
      steps: {
        create: [
          { dayOffset: 0, channel: "sms", body: "Quick question: are you still looking for help with the request you made a while back?" },
          { dayOffset: 2, channel: "email", body: "We built an AI follow-up system that revives old inquiries and books the interested ones." },
          { dayOffset: 5, channel: "sms", body: "Want me to close the loop or show you what this would look like for your old list?" },
        ],
      },
    },
  });

  const sourceCampaigns = [
    ["Dallas Med Spas", "pdl", "owners and founders of med spas", "Dallas, TX", "Med Spa, Wellness", "Owner, Founder, CEO", 50, 78, "active"],
    ["Texas HVAC Owners", "pdl", "HVAC owners with service businesses", "Texas", "HVAC, Home Services", "Owner, Founder, Operations Manager", 75, 74, "active"],
    ["Website AI Opportunity", "ghost-lead-agent", "example.com\nhttps://ghostai.solutions", "United States", "Local Services, B2B Services", "Owner, Founder", 25, 70, "draft"],
  ];

  for (const [name, provider, query, location, industries, titles, dailyLimit, scoreThreshold, status] of sourceCampaigns) {
    await prisma.sourcingCampaign.upsert({
      where: { id: `${workspace.id}:source:${name}` },
      update: { provider, query, location, industries, titles, dailyLimit, scoreThreshold, status },
      create: {
        id: `${workspace.id}:source:${name}`,
        workspaceId: workspace.id,
        name,
        provider,
        query,
        location,
        industries,
        titles,
        dailyLimit,
        scoreThreshold,
        status,
      },
    });
  }

  const suppressionRecords = [
    ["email", "stop@example.com", "Manual stop request", "seed"],
    ["domain", "competitor.example", "Competitor domain", "seed"],
  ];

  for (const [type, value, reason, source] of suppressionRecords) {
    await prisma.suppressionRecord.upsert({
      where: { workspaceId_type_value: { workspaceId: workspace.id, type, value } },
      update: { reason, source },
      create: { workspaceId: workspace.id, type, value, reason, source },
    });
  }

  const maya = await prisma.lead.findUnique({ where: { id: `${workspace.id}:BrightPath Med Spa:lead` } });
  if (maya) {
    await prisma.outreachQueueItem.upsert({
      where: { id: `${workspace.id}:queue:maya-email` },
      update: {},
      create: {
        id: `${workspace.id}:queue:maya-email`,
        workspaceId: workspace.id,
        leadId: maya.id,
        channel: "email",
        provider: "sendgrid",
        subject: "Quick teardown for BrightPath",
        body: "Maya, I found a few places where AI follow-up could recover old consult requests. Want me to send a 1-page teardown?",
        status: "pending",
        reason: "High score and replied stage.",
      },
    });

    await prisma.reply.upsert({
      where: { id: `${workspace.id}:reply:maya-hot` },
      update: {},
      create: {
        id: `${workspace.id}:reply:maya-hot`,
        workspaceId: workspace.id,
        leadId: maya.id,
        channel: "email",
        from: "maya.collins@example.com",
        body: "Yes, send pricing and a few times for this week.",
        classification: "hot",
        source: "seed",
      },
    });
  }

  await prisma.proposal.upsert({
    where: { id: `${workspace.id}:revival-proposal` },
    update: {},
    create: {
      id: `${workspace.id}:revival-proposal`,
      workspaceId: workspace.id,
      title: "AI Dead Lead Revival Install",
      status: "template",
      setupFee: 2500,
      monthlyFee: 1000,
      revSharePct: 12,
      summary: "Import stale leads, revive conversations, classify replies, book calls, and attribute recovered revenue.",
    },
  });

  for (const [name, source, useCase, price, demoScript] of agents) {
    await prisma.agentTemplate.upsert({
      where: { id: `${workspace.id}:${name}` },
      update: { source, useCase, price, demoScript },
      create: { id: `${workspace.id}:${name}`, workspaceId: workspace.id, name, source, useCase, price, demoScript },
    });
  }

  for (const [title, body, category] of prompts) {
    await prisma.promptTemplate.upsert({
      where: { id: `${workspace.id}:${title}` },
      update: { body, category },
      create: { id: `${workspace.id}:${title}`, workspaceId: workspace.id, title, body, category },
    });
  }

  console.log(`Seeded ${workspace.name} with ${leads.length} leads, campaign ${campaign.name}, agents, prompts, and proposal template.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

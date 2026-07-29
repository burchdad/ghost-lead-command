export type PublicVegaPlan = {
  code: "vega_scout" | "vega_reach" | "vega_convert" | "vega_managed";
  name: string;
  label?: string;
  tone?: "ghost";
  target: string;
  priceLabel: string;
  vegaHandles: string;
  customerHandles: string;
  outcome: string;
};

export const publicPromptExamples = [
  {
    id: "detailing_dealerships",
    text: "Find dealership accounts for my mobile detailing company",
  },
  {
    id: "hvac_commercial_tyler",
    text: "Help my HVAC company reach commercial customers near Tyler",
  },
  {
    id: "property_managers_dallas",
    text: "Find property managers within 50 miles of Dallas",
  },
];

export const publicVegaPlans: PublicVegaPlan[] = [
  {
    code: "vega_scout",
    name: "Vega Scout",
    target: "Find the market",
    priceLabel: "Starting at $497/month",
    vegaHandles: "Qualified prospects, contact paths, buying signals, and recommended next actions.",
    customerHandles: "You review the market direction and decide which accounts should move forward.",
    outcome: "A researched, prioritized target list.",
  },
  {
    code: "vega_reach",
    name: "Vega Reach",
    target: "Start conversations",
    priceLabel: "Starting at $1,250/month",
    vegaHandles: "Personalized outreach, approval controls, follow-up automation, tracking, and sender protection.",
    customerHandles: "You approve the campaign rules and decide how much sending Vega can handle.",
    outcome: "Controlled outreach with clear visibility into response signals.",
  },
  {
    code: "vega_convert",
    name: "Vega Convert",
    label: "Full conversion workflow",
    target: "Move interest toward appointments",
    priceLabel: "Starting at $2,500/month",
    vegaHandles: "Reply handling, phone-assist tasks, callbacks, booking workflows, and pipeline management.",
    customerHandles: "Your team handles key calls, or Ghost can help work the queue.",
    outcome: "Interested prospects moved toward qualified conversations.",
  },
  {
    code: "vega_managed",
    name: "Vega Managed",
    tone: "ghost",
    target: "Let Ghost run the operation",
    priceLabel: "Custom based on territory, volume, and human support",
    vegaHandles: "Ghost operates the campaign, supports follow-up, manages the work queue, and reports the pipeline.",
    customerHandles: "You approve direction, review opportunities, and handle sales conversations when needed.",
    outcome: "A managed acquisition workflow with human oversight.",
  },
];

export const publicOperatingProof = [
  {
    label: "Safe outreach",
    value: "Email + call",
    detail: "sender-governed email with phone-assist tasks when human follow-up adds value",
  },
  {
    label: "Decision lanes",
    value: "5",
    detail: "auto-email, executive review, call-first, research, and suppress",
  },
  {
    label: "Learning loop",
    value: "7-day",
    detail: "source quality, sender health, call outcomes, replies, meetings, and campaign recommendations",
  },
  {
    label: "Human leverage",
    value: "Calls",
    detail: "Vega reserves people for trust-heavy moments instead of asking them to work every lead manually",
  },
];

export const publicMarketPositioning = [
  {
    title: "Not just a lead list",
    text: "Vega does not stop at prospect discovery. She decides whether each opportunity should be emailed, called, researched, reviewed, or suppressed.",
  },
  {
    title: "Not a cold-email blaster",
    text: "Sender health, contact confidence, suppression, and follow-up timing govern how much automation Vega is allowed to run.",
  },
  {
    title: "Not a replacement for humans",
    text: "Vega handles the repetitive sales operation and routes people toward conversations, callbacks, and booking handoffs.",
  },
];

export const publicProofMilestones = [
  "qualified conversations created safely",
  "human phone tasks increasing meeting rates",
  "campaign learning improving results across cycles",
];

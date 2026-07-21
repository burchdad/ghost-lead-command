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
    label: "Found",
    value: "65",
    detail: "buyer and referral accounts in a local detailing campaign",
  },
  {
    label: "Qualified",
    value: "20",
    detail: "prospects identified in a targeted HVAC run",
  },
  {
    label: "Generated",
    value: "17",
    detail: "phone follow-up tasks from recent successful outreach",
  },
  {
    label: "Connected",
    value: "5",
    detail: "email, click, call, reply, and booking workflow lanes",
  },
];

// Stable legacy codes preserve existing quotes, subscriptions, and database records.
// Display names are independent of the AI director's identity.
export const servicePriceVersion = "ghost-commercial-2026-10-01";
export const servicePlans = {
  VEGA_SCOUT: { name: "Scout", setup: 75000, recurring: 49700, leads: 50, outreach: 0, research: 50, calls: 0 },
  VEGA_REACH: { name: "Reach", setup: 150000, recurring: 125000, leads: 150, outreach: 75, research: 150, calls: 0 },
  VEGA_CONVERT: { name: "Convert", setup: 250000, recurring: 250000, leads: 300, outreach: 150, research: 300, calls: 50 },
  VEGA_MANAGED: { name: "Managed", setup: 400000, recurring: 350000, leads: 500, outreach: 250, research: 500, calls: 150 },
  VEGA_WHITE_LABEL: { name: "White Label", setup: 750000, recurring: 500000, leads: 750, outreach: 350, research: 750, calls: 200 },
} as const;

export type ServicePlanCode = keyof typeof servicePlans;
export function servicePlanName(code: string) {
  return servicePlans[code as ServicePlanCode]?.name || "Custom service";
}
export function serviceMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
export const serviceScope = {
  included: "Base scope includes one campaign and one territory. Monthly allowances are activity limits, not promises of replies, meetings, or sales.",
  qualification: "A qualified prospect is a researched business account that meets the agreed fit and territory criteria and has an identified contact path. It has not necessarily expressed interest, and it is not an appointment or a sale.",
  outreach: "One outreach unit is one approved email send, including a follow-up send. Research-only Scout does not include sending. Sender readiness and campaign approval are required before live outreach.",
  calling: "One managed call unit is one human call attempt, whether or not someone answers. Call support, availability, and responsibility must be confirmed in the proposal; phone tasks alone are not completed calls.",
  exclusions: "Ad spend, purchased third-party subscriptions, additional mailboxes or domains, and custom integration work are not included unless expressly listed in the proposal. No unlimited calling, guaranteed appointments, or guaranteed revenue.",
  changes: "Additional activity is quoted before approval: $6 per researched lead, $9 per approved email send, and $12 per managed call attempt. No automatic overage billing is implemented. Additional campaigns add $350 to setup, territories $200 to setup, and integrations $150 each to setup; advanced setup may cost more.",
  billing: "Starting prices are in USD, with one-time setup shown separately. The accepted proposal controls the final price, service period, renewal, cancellation, and any different payment schedule. Review it before accepting or paying; existing agreements are not changed by this page.",
};

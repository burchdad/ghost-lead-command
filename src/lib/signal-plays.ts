import type { SourceProvider } from "@/lib/sourcing";

export type SignalPlay = {
  id: string;
  name: string;
  provider: SourceProvider;
  query: string;
  location: string;
  industries: string[];
  titles: string[];
  minScore: number;
  size: number;
  signal: string;
};

export const signalPlays: SignalPlay[] = [
  {
    id: "b2b-saas-growth",
    name: "B2B SaaS Growth Signals",
    provider: "pdl",
    query: "founders heads of growth revenue leaders at B2B SaaS companies",
    location: "United States",
    industries: ["Software", "SaaS", "Technology"],
    titles: ["Founder", "CEO", "Head of Growth", "VP Sales", "Revenue Operations"],
    minScore: 84,
    size: 35,
    signal: "company change and revenue-growth buyer signal",
  },
  {
    id: "agency-pipeline",
    name: "Agency Pipeline Pressure",
    provider: "pdl",
    query: "agency founders growth operators marketing agency owners",
    location: "United States",
    industries: ["Marketing", "Advertising", "Consulting", "B2B Services"],
    titles: ["Founder", "Owner", "CEO", "Head of Growth", "VP Sales"],
    minScore: 82,
    size: 35,
    signal: "pipeline leak and qualified-call demand signal",
  },
  {
    id: "local-high-ticket",
    name: "Local High-Ticket Demand",
    provider: "google-maps",
    query: "high ticket local services with quote requests and missed calls",
    location: "United States",
    industries: ["Home Services", "Professional Services", "Healthcare"],
    titles: ["Owner", "Founder", "CEO", "General Manager", "Operations Manager"],
    minScore: 82,
    size: 25,
    signal: "search and website signal",
  },
  {
    id: "recruiting-staffing",
    name: "Recruiting Sales Motion",
    provider: "pdl",
    query: "founders sales leaders recruiting staffing companies",
    location: "United States",
    industries: ["Staffing", "Recruiting", "Human Resources"],
    titles: ["Founder", "CEO", "VP Sales", "Head of Growth", "Owner"],
    minScore: 82,
    size: 35,
    signal: "company change and outbound-fit signal",
  },
  {
    id: "linkedin-competitor-engagement",
    name: "LinkedIn Competitor Engagement",
    provider: "pdl",
    query: "founders CEOs revenue leaders discussing lead generation automation LinkedIn outreach CRM follow up AI sales",
    location: "United States",
    industries: ["Software", "SaaS", "Marketing", "Advertising", "Consulting", "B2B Services"],
    titles: ["Founder", "CEO", "Owner", "Head of Growth", "VP Sales", "Revenue Operations"],
    minScore: 80,
    size: 35,
    signal: "social intent and competitor-engagement buyer signal",
  },
  {
    id: "event-led-growth",
    name: "Event-Led Growth Signals",
    provider: "pdl",
    query: "founders marketers operators hosting webinars communities events workshops lead generation",
    location: "United States",
    industries: ["Events", "Marketing", "Software", "Professional Services", "Education"],
    titles: ["Founder", "CEO", "Head of Growth", "Marketing Director", "Community Lead"],
    minScore: 78,
    size: 30,
    signal: "event, community, and public-audience intent signal",
  },
  {
    id: "local-hvac-missed-call",
    name: "Local HVAC Missed-Call Opportunity",
    provider: "google-maps",
    query: "HVAC contractors heating air conditioning emergency repair quote requests missed calls",
    location: "Tyler, TX; Lindale, TX; Mineola, TX; Canton, TX; Wills Point, TX; Terrell, TX; Forney, TX; Dallas, TX",
    industries: ["HVAC", "Home Services", "Contractors"],
    titles: ["Owner", "Founder", "CEO", "General Manager", "Operations Manager"],
    minScore: 75,
    size: 35,
    signal: "local search demand and missed-call conversion leak signal",
  },
];

export function getSignalPlay(id: string) {
  return signalPlays.find((play) => play.id === id);
}

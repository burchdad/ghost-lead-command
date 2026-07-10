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
];

export function getSignalPlay(id: string) {
  return signalPlays.find((play) => play.id === id);
}

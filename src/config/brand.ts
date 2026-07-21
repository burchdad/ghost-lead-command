export const brand = {
  companyName: "Ghost AI Solutions",
  companyShortName: "Ghost",
  productName: "Ghost Lead Command",
  productDescriptor: "AI customer-acquisition platform",
  aiDirectorName: "Vega",
  aiDirectorTitle: "AI Sales Director",
  poweredByText: "Powered by Ghost AI Solutions",
  productAttributionText: "A product of Ghost AI Solutions",
  legalAttributionText:
    "Ghost Lead Command is a product of Ghost AI Solutions. Vega is the AI Sales Director within Ghost Lead Command.",
  publicSupportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@ghostai.solutions",
  publicCompanyUrl: "https://ghostai.solutions",
  productUrl: "https://leadgen.ghostai.solutions",
  onboardingUrl: "/onboarding/ai",
} as const;

export const publicMetadata = {
  title: "Ghost Lead Command | AI Customer Acquisition Directed by Vega",
  description:
    "Ghost Lead Command is an AI customer-acquisition platform by Ghost AI Solutions. Vega finds and qualifies prospects, prepares outreach, supports follow-up, and helps move real interest toward booked calls.",
  openGraphTitle: "Ghost Lead Command | Vega AI Sales Director",
  openGraphDescription:
    "Ghost Lead Command by Ghost AI Solutions gives Vega the operating lane to find qualified prospects, prepare outreach, support follow-up, and move real interest toward booked calls.",
} as const;

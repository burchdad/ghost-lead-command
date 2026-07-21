import type { Metadata } from "next";
import VegaCommercialOnboarding from "@/components/VegaCommercialOnboarding";

export const metadata: Metadata = {
  title: "Vega Commercial Onboarding | Ghost Lead Command",
  description: "AI-led commercial onboarding for Vega Lead Command.",
};

export default function AIOnboardingPage() {
  return <VegaCommercialOnboarding />;
}

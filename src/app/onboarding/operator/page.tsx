import type { Metadata } from "next";
import VegaOperatorOnboarding from "@/components/VegaOperatorOnboarding";

export const metadata: Metadata = {
  title: "Vega Operational Onboarding | Ghost Lead Command",
  description: "Internal readiness, policy, integration, and calibration control plane for Vega.",
};

export default function VegaOperatorOnboardingPage() {
  return <VegaOperatorOnboarding />;
}

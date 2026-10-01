import type { Metadata } from "next";
import VegaOperatorOnboarding from "@/components/VegaOperatorOnboarding";

export const metadata: Metadata = {
  title: "Ghost Director Operational Onboarding | Ghost Lead Command",
  description: "Internal readiness, policy, integration, and calibration control plane for Ghost Director.",
};

export default function VegaOperatorOnboardingPage() {
  return <VegaOperatorOnboarding />;
}

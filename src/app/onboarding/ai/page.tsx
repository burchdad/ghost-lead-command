import type { Metadata } from "next";
import VegaCommercialOnboarding from "@/components/VegaCommercialOnboarding";
import { brand, publicMetadata } from "@/config/brand";

export const metadata: Metadata = {
  title: `${brand.aiDirectorName} AI Onboarding | ${brand.productName}`,
  description: publicMetadata.description,
};

export default function AIOnboardingPage() {
  return <VegaCommercialOnboarding />;
}

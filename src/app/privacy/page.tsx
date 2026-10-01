import type { Metadata } from "next";
import { ServicePolicyPage } from "@/components/ServicePolicyPage";
import { brand } from "@/config/brand";
import { privacySections } from "@/config/service-policies";
export const metadata: Metadata = { title: `Privacy Notice | ${brand.productName}`, description: "Ghost Lead Command service policies, scope, data, and responsibilities." };
export default function PolicyPage() { return <ServicePolicyPage title="Privacy Notice" sections={privacySections} />; }

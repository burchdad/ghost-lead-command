import type { Metadata } from "next";
import { ServicePolicyPage } from "@/components/ServicePolicyPage";
import { brand } from "@/config/brand";
import { termsSections } from "@/config/service-policies";
export const metadata: Metadata = { title: `Service Terms | ${brand.productName}`, description: "Ghost Lead Command service policies, scope, data, and responsibilities." };
export default function PolicyPage() { return <ServicePolicyPage title="Service Terms" sections={termsSections} />; }

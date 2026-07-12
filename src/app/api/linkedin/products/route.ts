import { NextResponse } from "next/server";
import { getLinkedInProductStatus } from "@/lib/linkedin-products";

export async function GET() {
  return NextResponse.json(getLinkedInProductStatus());
}

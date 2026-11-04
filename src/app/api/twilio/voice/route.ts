import { twilioRetirementResponse } from "@/lib/twilio-retirement";

export const runtime = "nodejs";
export async function POST() { return twilioRetirementResponse(); }
export async function GET() { return twilioRetirementResponse(); }

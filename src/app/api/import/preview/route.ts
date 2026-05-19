import { NextResponse } from "next/server";
import { parseCsv } from "@/lib/csv";

export async function POST(request: Request) {
  const body = await request.json();
  const csv = String(body.csv || "");
  const parsed = parseCsv(csv);
  const records = parsed.records.slice(0, 25).map((record) => ({
    name: record.name || record.contact || record.full_name || "",
    companyName: record.company || record.company_name || record.business || "",
    email: record.email || "",
    phone: record.phone || record.mobile || "",
    niche: record.niche || record.industry || "General",
    source: record.source || "csv",
    score: scoreRecord(record),
  }));

  return NextResponse.json({
    headers: parsed.headers,
    totalRows: parsed.records.length,
    preview: records,
  });
}

function scoreRecord(record: Record<string, string>) {
  let score = 45;
  const text = Object.values(record).join(" ").toLowerCase();
  if (record.email) score += 10;
  if (record.phone || record.mobile) score += 15;
  if (text.includes("quote") || text.includes("estimate") || text.includes("consult")) score += 15;
  if (text.includes("urgent") || text.includes("asap")) score += 15;
  return Math.min(100, score);
}

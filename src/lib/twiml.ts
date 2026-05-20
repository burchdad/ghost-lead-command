import { NextResponse } from "next/server";

export function twimlResponse(xml: string, init?: ResponseInit) {
  return new NextResponse(xml, {
    ...init,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

export async function readTwilioForm(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return {};

  return Object.fromEntries(
    Array.from(form.entries()).map(([key, value]) => [key, String(value)]),
  ) as Record<string, string>;
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

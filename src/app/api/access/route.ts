import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

const COOKIE_NAME = "ghost_lead_command_access";

function accessHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: Request) {
  const accessKey = (process.env.LEAD_COMMAND_ACCESS_KEY || "").trim();
  if (!accessKey) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const body = await request.json().catch(() => ({}));
  const submittedAccessKey = String(body.accessKey || "").trim();

  if (submittedAccessKey !== accessKey) {
    return NextResponse.json({ error: "Invalid access key" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, accessHash(accessKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}

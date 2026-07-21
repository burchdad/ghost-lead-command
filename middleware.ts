import { NextRequest, NextResponse } from "next/server";
import { getLeadCommandAccessKey, hashLeadCommandAccessKey, LEAD_COMMAND_ACCESS_COOKIE } from "@/lib/access";

const PUBLIC_FILE = /\.(.*)$/;

function isAllowedPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/" ||
    pathname === "/access" ||
    pathname === "/waitlist" ||
    pathname === "/onboarding/ai" ||
    pathname === "/privacy" ||
    pathname.startsWith("/proposals/") ||
    pathname === "/api/access" ||
    pathname === "/api/access/logout" ||
    pathname === "/api/onboarding/ai" ||
    pathname === "/api/waitlist/analytics" ||
    pathname === "/api/agent/digest" ||
    pathname === "/api/agent/director" ||
    pathname === "/api/agent/recommend" ||
    pathname === "/api/agent/run" ||
    pathname === "/api/automation/contact-card/run" ||
    pathname === "/api/automation/sequence/run" ||
    pathname.startsWith("/api/sendgrid/") ||
    pathname === "/api/source/intake" ||
    pathname === "/api/waitlist" ||
    pathname.startsWith("/api/twilio/") ||
    pathname === "/api/webhooks/contact-card" ||
    pathname === "/api/slack/command" ||
    pathname === "/api/slack/events" ||
    pathname === "/api/slack/interactions" ||
    pathname.startsWith("/api/slack/actions/") ||
    PUBLIC_FILE.test(pathname)
  );
}

export async function middleware(request: NextRequest) {
  const accessKey = getLeadCommandAccessKey();
  if (!accessKey || isAllowedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(LEAD_COMMAND_ACCESS_COOKIE)?.value;
  if (cookieValue && cookieValue === (await hashLeadCommandAccessKey(accessKey))) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/access";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

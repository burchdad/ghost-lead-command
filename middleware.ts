import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "ghost_lead_command_access";
const PUBLIC_FILE = /\.(.*)$/;

function getAccessKey() {
  return (process.env.LEAD_COMMAND_ACCESS_KEY || "").trim();
}

async function accessHash(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isAllowedPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/access" ||
    pathname === "/api/access" ||
    pathname === "/api/access/logout" ||
    pathname === "/api/agent/recommend" ||
    pathname.startsWith("/api/slack/actions/") ||
    PUBLIC_FILE.test(pathname)
  );
}

export async function middleware(request: NextRequest) {
  const accessKey = getAccessKey();
  if (!accessKey || isAllowedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieValue && cookieValue === (await accessHash(accessKey))) {
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

import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "ghost_lead_command_access";
const PUBLIC_FILE = /\.(.*)$/;

function getAccessKey() {
  return (process.env.LEAD_COMMAND_ACCESS_KEY || "").trim();
}

function isAllowedPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/api/access" ||
    PUBLIC_FILE.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const accessKey = getAccessKey();
  if (!accessKey || isAllowedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieValue === accessKey) {
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

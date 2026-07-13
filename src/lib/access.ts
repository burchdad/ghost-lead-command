export const LEAD_COMMAND_ACCESS_COOKIE = "ghost_lead_command_access";

export function getLeadCommandAccessKey() {
  return (process.env.LEAD_COMMAND_ACCESS_KEY || "").trim();
}

export async function hashLeadCommandAccessKey(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getCookieValue(cookieHeader: string, name: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function isLeadCommandRequestAuthorized(request: Request) {
  const accessKey = getLeadCommandAccessKey();
  if (!accessKey) return true;

  const cookieValue = getCookieValue(request.headers.get("cookie") || "", LEAD_COMMAND_ACCESS_COOKIE);
  return Boolean(cookieValue && cookieValue === (await hashLeadCommandAccessKey(accessKey)));
}

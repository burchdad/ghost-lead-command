import type { SourceLead } from "./sourcing";

export function callSourceDecision(lead: SourceLead, suppressions: { type: string; value: string }[]) {
  const phone = (value: string) => value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const normalized = (value: string) => value.trim().toLowerCase();
  let domain = "";
  try { domain = new URL(lead.website || "").hostname.replace(/^www\./, ""); } catch { /* No website evidence. */ }
  const blocked = suppressions.some((record) =>
    (record.type === "phone" && phone(record.value) === phone(lead.phone)) ||
    (record.type === "company" && normalized(record.value) === normalized(lead.companyName)) ||
    (record.type === "domain" && domain && normalized(record.value).replace(/^www\./, "") === domain),
  );
  if (blocked) return "suppressed";
  if (!/^\d{10,15}$/.test(phone(lead.phone))) return "missing-usable-phone";
  if (!lead.companyName || lead.companyName === "Unknown Company" || lead.score < 45 ||
    /vendor risk|institutional risk/i.test(lead.buyerFit)) return "poor-fit";
  return "call-ready";
}

/** Retirement-only mitigation: deliberately no provider SDK, secret lookup or enable path. */
export function twilioRetirementResponse() {
  return Response.json({ error: "Twilio processing is retired for this lead system." }, { status: 410 });
}

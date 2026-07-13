import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#08070d] px-5 py-12 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-[#c4b5fd]">Vega</Link>
        <h1 className="mt-8 text-4xl font-semibold">Privacy Notice</h1>
        <p className="mt-4 leading-7 text-[#d8d4e8]">
          Ghost AI Solutions collects the information you submit through Vega forms so we can review product-interest requests, qualify early-access candidates, communicate product updates, and improve Lead Command operations.
        </p>

        <section className="mt-8 space-y-4 text-[#d8d4e8]">
          <h2 className="text-xl font-semibold text-white">What We Collect</h2>
          <p>
            Waitlist forms may collect your name, business contact details, company, role, lead-generation tooling, lead volume, business challenge, notes, consent timestamp, page URL, referring URL, browser user agent, and campaign attribution parameters such as UTM values.
          </p>
          <h2 className="text-xl font-semibold text-white">How We Use It</h2>
          <p>
            We use this information to store or update your contact record in Ghost CRM, score and segment waitlist requests, notify operators about high-priority candidates, send confirmation or product communications, and maintain an internal interaction history.
          </p>
          <h2 className="text-xl font-semibold text-white">Communications</h2>
          <p>
            By joining the waitlist, you agree to receive Vega early-access and product communications. You can unsubscribe from future product emails or ask us to update your communication preferences.
          </p>
          <h2 className="text-xl font-semibold text-white">Data Handling</h2>
          <p>
            We do not intentionally collect sensitive personal information through waitlist forms. We keep operational records only as needed for qualification, communication, CRM sync, audit, and abuse prevention.
          </p>
        </section>
      </div>
    </main>
  );
}

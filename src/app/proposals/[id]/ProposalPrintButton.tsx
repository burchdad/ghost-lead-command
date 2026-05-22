"use client";

export default function ProposalPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-[#d8ff5f] px-4 py-2 text-sm font-semibold text-[#101417] transition hover:bg-white print:hidden"
    >
      Print / Save PDF
    </button>
  );
}

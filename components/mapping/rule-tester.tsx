"use client";

import { useState, useTransition } from "react";
import { testMappingRule, type RuleTesterResult } from "@/app/mapping/actions";
import { inputClass } from "@/components/master-data/form-field";

const EXCEPTION_LABELS: Record<string, string> = {
  outlet_not_detected: "Outlet tidak terdeteksi",
  coa_not_detected: "COA tidak terdeteksi",
  unknown_classification: "Klasifikasi belum pernah dikonfigurasi",
  ambiguous_mapping: "Ambiguous — beberapa rule cocok sama kuat",
  interbank_transfer: "Kandidat transfer antar rekening/unit",
  shared_cost_candidate: "Kandidat biaya bersama (perlu dialokasikan)",
};

/**
 * Rule Tester (spec item 12) — calls the exact same server-side
 * mapBankTransaction() the real Reprocess Engine and post-import mapping
 * run use (testMappingRule wraps it read-only, no DB write), so this is
 * never a second, drift-prone reimplementation of the matching logic —
 * "what you test here is what would actually happen."
 */
export function RuleTester({
  banks,
  outlets,
  coa,
}: {
  banks: { id: string; bank_name: string }[];
  outlets: { id: string; outlet_name: string }[];
  coa: { id: string; code: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RuleTesterResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const outletName = (id: string | null) => (id ? outlets.find((o) => o.id === id)?.outlet_name ?? id : "—");
  const coaName = (id: string | null) => (id ? coa.find((c) => c.id === id)?.name ?? id : "—");

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        setResult(await testMappingRule(formData));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal menguji rule.");
      }
    });
  }

  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-navy mb-1">Rule Tester</h3>
      <p className="text-xs text-gray-500 mb-3">
        Uji kombinasi bank/unit/klasifikasi/deskripsi/nominal hipotetis terhadap seluruh rule aktif saat ini — tanpa menyimpan apa pun.
      </p>
      <form action={handleSubmit} className="grid grid-cols-2 gap-3">
        <select name="bank_id" className={inputClass} defaultValue="">
          <option value="">Bank apa saja (wildcard)</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.bank_name}
            </option>
          ))}
        </select>
        <input name="unit_raw" placeholder="Unit (opsional)" className={inputClass} />
        <input name="classification_raw" placeholder="Klasifikasi" className={inputClass} />
        <input name="description_raw" placeholder="Deskripsi" className={inputClass} />
        <input name="debit" placeholder="Debit (default 0)" className={inputClass} />
        <input name="credit" placeholder="Kredit (default 0)" className={inputClass} />
        <div className="col-span-2">
          <button type="submit" disabled={pending} className="bg-navy text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {pending ? "Menguji…" : "Uji Rule"}
          </button>
        </div>
      </form>

      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {result && (
        <div className="mt-4 border-t border-border pt-3 text-sm space-y-1">
          <div>
            <span className="text-gray-500">Outlet terdeteksi:</span>{" "}
            <span className="font-medium">
              {outletName(result.detectedOutletId)}
              {result.matchedOutletRuleId && ` (rule ${result.matchedOutletRuleId.slice(0, 8)}…)`}
            </span>
          </div>
          <div>
            <span className="text-gray-500">COA terdeteksi:</span>{" "}
            <span className="font-medium">
              {coaName(result.detectedCoaId)}
              {result.matchedCoaRuleId && ` (rule ${result.matchedCoaRuleId.slice(0, 8)}…)`}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Interbank/interunit candidate:</span>{" "}
            <span className="font-medium">{result.isInterbankTransfer ? "Ya" : "Tidak"}</span>
          </div>
          <div>
            <span className="text-gray-500">Shared cost candidate:</span>{" "}
            <span className="font-medium">{result.isSharedCostCandidate ? "Ya" : "Tidak"}</span>
          </div>
          {result.exceptionType ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <div className="font-semibold">{EXCEPTION_LABELS[result.exceptionType] ?? result.exceptionType}</div>
              <div className="text-xs mt-1">{result.exceptionNote}</div>
              {(result.outletAmbiguousRuleIds.length > 0 || result.coaAmbiguousRuleIds.length > 0) && (
                <div className="text-xs mt-1">
                  Rule yang bertabrakan: {[...result.outletAmbiguousRuleIds, ...result.coaAmbiguousRuleIds].map((id) => id.slice(0, 8)).join(", ")}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-800">
              Baris ini akan terpetakan bersih, tanpa exception.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

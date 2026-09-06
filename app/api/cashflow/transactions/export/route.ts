import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCashflowAccess } from "@/lib/cashflow/access";
import type { CashflowTransactionType } from "@/types/database.types";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await requireCashflowAccess(supabase); // redirects if unauthenticated/unauthorized

  const params = request.nextUrl.searchParams;
  let query = supabase
    .from("v_cashflow_running_balance")
    .select("transaction_date, bank_accounts(account_name, bank_name), description, classification, cashflow_categories(name), cash_in, cash_out, running_balance, transaction_type, source_sheet, source_row_id")
    .order("transaction_date", { ascending: false })
    .limit(50_000);

  const account = params.get("account");
  const from = params.get("from");
  const to = params.get("to");
  const category = params.get("category");
  const type = params.get("type");
  const q = params.get("q");
  if (account) query = query.eq("bank_account_id", account);
  if (from) query = query.gte("transaction_date", from);
  if (to) query = query.lte("transaction_date", to);
  if (category) query = query.eq("category_id", category);
  if (type) query = query.eq("transaction_type", type as CashflowTransactionType);
  if (q) query = query.ilike("description", `%${q}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = ["Tanggal", "Rekening", "Bank", "Deskripsi", "Klasifikasi", "Kategori", "Cash In", "Cash Out", "Saldo", "Tipe", "Source Sheet", "Source Row"];
  const lines = [header.join(",")];
  for (const r of data ?? []) {
    const bank = r.bank_accounts as unknown as { account_name: string; bank_name: string } | null;
    const category = r.cashflow_categories as unknown as { name: string } | null;
    lines.push(
      [
        r.transaction_date,
        bank?.account_name ?? "",
        bank?.bank_name ?? "",
        r.description ?? "",
        r.classification ?? "",
        category?.name ?? "",
        r.cash_in,
        r.cash_out,
        r.running_balance,
        r.transaction_type,
        r.source_sheet ?? "",
        r.source_row_id ?? "",
      ]
        .map((v) => csvEscape(String(v ?? "")))
        .join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cashflow-transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

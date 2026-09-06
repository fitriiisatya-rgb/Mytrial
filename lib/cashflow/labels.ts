/** Centralized Indonesian display labels — keep DB enum values in English/SNAKE_CASE (stable, code-facing), translate only at render time. */

export const ALERT_TYPE_LABELS: Record<string, string> = {
  LOW_BALANCE: "Saldo Rendah",
  NEGATIVE_PROJECTED_BALANCE: "Proyeksi Saldo Negatif",
  LARGE_PAYMENT: "Pembayaran Besar",
  RECONCILIATION_DIFFERENCE: "Selisih Rekonsiliasi",
  STALE_SYNC: "Sinkronisasi Tertunda",
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  CASH_IN: "Penerimaan",
  CASH_OUT: "Pengeluaran",
  INTERNAL_TRANSFER_IN: "Transfer Masuk",
  INTERNAL_TRANSFER_OUT: "Transfer Keluar",
};

export const PLANNED_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Direncanakan",
  APPROVED: "Disetujui",
  PAID: "Sudah Dibayar",
  RECEIVED: "Sudah Diterima",
  CANCELLED: "Dibatalkan",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Terjadwal",
  APPROVED: "Disetujui",
  PAID: "Sudah Dibayar",
  CANCELLED: "Dibatalkan",
};

export const RECONCILIATION_LABELS: Record<string, string> = {
  MATCHED: "Cocok",
  DIFFERENCE: "Selisih",
  NEED_REVIEW: "Perlu Ditinjau",
};

export const SYNC_ISSUE_LABELS: Record<string, string> = {
  invalid_date: "Tanggal Tidak Valid",
  unknown_account: "Rekening Baru",
  invalid_amount: "Nominal Tidak Valid",
  both_debit_credit_filled: "Debit & Kredit Terisi Bersamaan",
  duplicate_suspected: "Diduga Duplikat",
  missing_description: "Deskripsi Kosong",
  running_balance_mismatch: "Saldo Tidak Cocok",
  account_mapping_missing: "Rekening Tidak Terbaca",
  other: "Lainnya",
};

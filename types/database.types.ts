/**
 * Hand-written to match supabase/migrations/*.sql exactly as of Phase 1.
 * This file exists so the app compiles before a real Supabase project is
 * connected. THE MOMENT you run `supabase db reset` against a real
 * project, regenerate this with:
 *
 *   npm run db:types
 *
 * ...and delete everything below manual maintenance. Hand-maintaining
 * this file long-term is exactly the kind of drift that causes runtime
 * errors tsc can't catch — treat it as scaffolding, not a permanent file.
 */

export type UserRole = "super_admin" | "accounting" | "finance_manager" | "management" | "investor";
export type AccountType =
  | "asset" | "liability" | "equity" | "revenue" | "cogs"
  | "operating_expense" | "other_income" | "other_expense";
export type NormalBalance = "debit" | "credit";
export type JournalStatus = "draft" | "reviewed" | "approved" | "posted" | "reversed";
export type JournalSourceType =
  | "bank_expense" | "revenue" | "manual" | "allocation"
  | "interbank_transfer" | "opening_balance";
export type PnlStatus = "draft" | "reviewed" | "approved" | "published";
export type PeriodStatus = "open" | "review" | "closed" | "published";
export type DistributionStatus = "calculated" | "reviewed" | "approved" | "paid";
export type ExceptionType =
  | "outlet_not_detected" | "coa_not_detected" | "missing_bank_coa"
  | "duplicate_suspected" | "invalid_amount" | "invalid_date"
  | "unknown_classification" | "interbank_transfer" | "possible_reversal"
  | "malformed_data" | "ownership_invalid" | "revenue_source_incomplete";
export type ExceptionStatus = "open" | "resolved" | "ignored";
export type AllocationMethod = "equal" | "revenue_percentage" | "custom_percentage" | "manual_amount";
export type MatchType = "exact" | "keyword" | "regex";
export type ImportSourceType = "csv_upload" | "excel_upload" | "google_sheet";

/** Every monetary column is NUMERIC(18,2) in Postgres, which the Supabase
 * JS client surfaces as `string` (not `number`) to avoid float precision
 * loss in transit. Always pass these through lib/money.ts's toSen()
 * before doing arithmetic — never `parseFloat` them directly. */
type Numeric = string;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string; role: UserRole; active: boolean; created_at: string; updated_at: string };
        Insert: { id: string; full_name: string; role: UserRole; active?: boolean };
        Update: Partial<{ full_name: string; role: UserRole; active: boolean }>;
        Relationships: [];
      };
      entities: {
        Row: { id: string; code: string; name: string; active: boolean; created_at: string };
        Insert: { id?: string; code: string; name: string; active?: boolean };
        Update: Partial<{ code: string; name: string; active: boolean }>;
        Relationships: [];
      };
      coa: {
        Row: {
          id: string; code: string; name: string; account_type: AccountType;
          parent_id: string | null; normal_balance: NormalBalance;
          pnl_category: "revenue" | "cogs" | "opex" | "other_income" | "other_expense" | null;
          reporting_order: number; active: boolean; created_at: string;
        };
        Insert: {
          id?: string; code: string; name: string; account_type: AccountType;
          parent_id?: string | null; normal_balance: NormalBalance;
          pnl_category?: string | null; reporting_order?: number; active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["coa"]["Insert"]>;
        Relationships: [];
      };
      outlets: {
        Row: {
          id: string; entity_id: string; outlet_code: string; outlet_name: string;
          area: string | null; address: string | null; status: string;
          opening_date: string | null; partnership_start: string | null; partnership_end: string | null;
          active: boolean; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; entity_id: string; outlet_code: string; outlet_name: string;
          area?: string | null; address?: string | null; status?: string;
          opening_date?: string | null; partnership_start?: string | null; partnership_end?: string | null;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["outlets"]["Insert"]>;
        Relationships: [];
      };
      banks: {
        Row: {
          id: string; entity_id: string; account_no: string; account_name: string;
          bank_name: string; coa_id: string; active: boolean; created_at: string;
        };
        Insert: {
          id?: string; entity_id: string; account_no: string; account_name: string;
          bank_name: string; coa_id: string; active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["banks"]["Insert"]>;
        Relationships: [];
      };
      investors: {
        Row: {
          id: string; investor_code: string; full_name: string; email: string | null;
          phone: string | null; profile_id: string | null; status: string; created_at: string;
        };
        Insert: {
          id?: string; investor_code: string; full_name: string; email?: string | null;
          phone?: string | null; profile_id?: string | null; status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["investors"]["Insert"]>;
        Relationships: [];
      };
      partnership_contracts: {
        Row: {
          id: string; outlet_id: string; contract_number: string; start_date: string; end_date: string;
          duration_months: number | null; total_investment: Numeric;
          profit_distribution_pct: Numeric; retained_profit_pct: Numeric; active: boolean; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; contract_number: string; start_date: string; end_date: string;
          duration_months?: number | null; total_investment?: Numeric;
          profit_distribution_pct: Numeric; active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["partnership_contracts"]["Insert"]>;
        Relationships: [];
      };
      investor_ownerships: {
        Row: {
          id: string; investor_id: string; outlet_id: string; contract_id: string;
          ownership_pct: Numeric; investment_amount: Numeric; start_date: string; end_date: string | null;
          active: boolean; created_at: string; created_by: string | null;
        };
        Insert: {
          id?: string; investor_id: string; outlet_id: string; contract_id: string;
          ownership_pct: Numeric; investment_amount?: Numeric; start_date: string; end_date?: string | null;
          active?: boolean; created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["investor_ownerships"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "investor_ownerships_outlet_id_fkey";
            columns: ["outlet_id"];
            isOneToOne: false;
            referencedRelation: "outlets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investor_ownerships_investor_id_fkey";
            columns: ["investor_id"];
            isOneToOne: false;
            referencedRelation: "investors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investor_ownerships_contract_id_fkey";
            columns: ["contract_id"];
            isOneToOne: false;
            referencedRelation: "partnership_contracts";
            referencedColumns: ["id"];
          }
        ];
      };
      accounting_periods: {
        Row: {
          id: string; entity_id: string; period_month: number; period_year: number; status: PeriodStatus;
          bank_import_complete: boolean; revenue_import_complete: boolean; allocation_complete: boolean;
          closed_at: string | null; closed_by: string | null; published_at: string | null;
          reopened_at: string | null; reopened_by: string | null; reopen_reason: string | null; created_at: string;
        };
        Insert: {
          id?: string; entity_id: string; period_month: number; period_year: number; status?: PeriodStatus;
          bank_import_complete?: boolean; revenue_import_complete?: boolean; allocation_complete?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["accounting_periods"]["Row"]>;
        Relationships: [];
      };
      revenue_sources: {
        Row: { id: string; code: string; name: string; clearing_coa_id: string; active: boolean; created_at: string };
        Insert: { id?: string; code: string; name: string; clearing_coa_id: string; active?: boolean };
        Update: Partial<Database["public"]["Tables"]["revenue_sources"]["Insert"]>;
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string; source: ImportSourceType; source_ref: string | null; imported_by: string | null;
          imported_at: string; row_count: number; duplicate_count: number; error_count: number; status: string;
        };
        Insert: {
          id?: string; source: ImportSourceType; source_ref?: string | null; imported_by?: string | null;
          row_count?: number; duplicate_count?: number; error_count?: number; status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["import_batches"]["Insert"]>;
        Relationships: [];
      };
      bank_transactions_raw: {
        Row: {
          id: string; import_batch_id: string | null; bank_id: string | null; bank_label_raw: string;
          txn_date: string; unit_raw: string | null; classification_raw: string | null; description_raw: string | null;
          debit: Numeric; credit: Numeric; running_balance: Numeric | null; external_ref: string | null;
          source_row_ref: string | null; fingerprint: string; dedupe_key: string;
          detected_outlet_id: string | null; detected_coa_id: string | null; is_interbank_transfer: boolean;
          transfer_pair_id: string | null; journal_id: string | null; processed: boolean;
          exception_status: ExceptionStatus | null; created_at: string;
        };
        Insert: {
          id?: string; import_batch_id?: string | null; bank_id?: string | null; bank_label_raw: string;
          txn_date: string; unit_raw?: string | null; classification_raw?: string | null; description_raw?: string | null;
          debit?: Numeric; credit?: Numeric; running_balance?: Numeric | null; external_ref?: string | null;
          source_row_ref?: string | null; fingerprint: string;
          detected_outlet_id?: string | null; detected_coa_id?: string | null; is_interbank_transfer?: boolean;
          processed?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["bank_transactions_raw"]["Row"]>;
        Relationships: [];
      };
      revenue_transactions_raw: {
        Row: {
          id: string; import_batch_id: string | null; revenue_source_id: string; txn_date: string;
          outlet_id: string | null; outlet_raw: string | null; description: string | null;
          revenue_category: string | null; amount: Numeric; external_ref: string | null;
          fingerprint: string; dedupe_key: string; journal_id: string | null; processed: boolean; created_at: string;
        };
        Insert: {
          id?: string; import_batch_id?: string | null; revenue_source_id: string; txn_date: string;
          outlet_id?: string | null; outlet_raw?: string | null; description?: string | null;
          revenue_category?: string | null; amount: Numeric; external_ref?: string | null;
          fingerprint: string; processed?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["revenue_transactions_raw"]["Row"]>;
        Relationships: [];
      };
      outlet_mapping_rules: {
        Row: {
          id: string; bank_id: string | null; unit_value: string | null; classification: string | null;
          match_type: MatchType; match_value: string | null; direction: string | null;
          output_outlet_id: string; priority: number; active: boolean; created_by: string | null; created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["outlet_mapping_rules"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["outlet_mapping_rules"]["Row"]>;
        Relationships: [];
      };
      coa_mapping_rules: {
        Row: {
          id: string; bank_id: string | null; outlet_id: string | null; unit_value: string | null;
          classification: string | null; description_keyword: string | null; direction: string | null;
          amount_min: Numeric | null; amount_max: Numeric | null; source_type: JournalSourceType | null;
          result_coa_id: string; bank_coa_override_id: string | null; no_outlet_needed: boolean;
          priority: number; active: boolean; created_by: string | null; created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["coa_mapping_rules"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["coa_mapping_rules"]["Row"]>;
        Relationships: [];
      };
      exceptions: {
        Row: {
          id: string; source_table: "bank_transactions_raw" | "revenue_transactions_raw"; source_id: string;
          exception_type: ExceptionType; suggested_outlet_id: string | null; suggested_coa_id: string | null;
          status: ExceptionStatus; resolved_outlet_id: string | null; resolved_coa_id: string | null;
          create_rule_on_resolve: boolean; resolution_note: string | null; resolved_by: string | null;
          resolved_at: string | null; created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["exceptions"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["exceptions"]["Row"]>;
        Relationships: [];
      };
      journal_headers: {
        Row: {
          id: string; journal_number: string; journal_date: string; source_type: JournalSourceType;
          source_id: string | null; batch_id: string | null; entity_id: string; accounting_period_id: string;
          status: JournalStatus; description: string | null; created_by: string | null;
          reviewed_by: string | null; reviewed_at: string | null; approved_by: string | null; approved_at: string | null;
          posted_at: string | null; reversal_of_id: string | null; created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["journal_headers"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["journal_headers"]["Row"]>;
        Relationships: [];
      };
      journal_lines: {
        Row: {
          id: string; journal_id: string; line_no: number; coa_id: string; entity_id: string;
          outlet_id: string | null; bank_account_id: string | null; department_id: string | null;
          cost_center_id: string | null; debit: Numeric; credit: Numeric; description: string | null; created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["journal_lines"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["journal_lines"]["Row"]>;
        Relationships: [];
      };
      allocation_rules: {
        Row: {
          id: string; source_coa_id: string; source_journal_line_id: string | null; method: AllocationMethod;
          effective_date: string; total_amount: Numeric; resulting_journal_id: string | null;
          active: boolean; created_by: string | null; created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["allocation_rules"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["allocation_rules"]["Row"]>;
        Relationships: [];
      };
      allocation_rule_outlets: {
        Row: {
          id: string; allocation_rule_id: string; outlet_id: string; percentage: Numeric | null;
          weight_basis: Numeric | null; manual_amount: Numeric | null; allocated_amount: Numeric;
        };
        Insert: Omit<Database["public"]["Tables"]["allocation_rule_outlets"]["Row"], "id"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["allocation_rule_outlets"]["Row"]>;
        Relationships: [];
      };
      pnl_reports: {
        Row: {
          id: string; outlet_id: string; entity_id: string; accounting_period_id: string;
          revenue: Numeric; cogs: Numeric; gross_profit: Numeric; operating_expense: Numeric;
          operating_profit: Numeric; other_income: Numeric; other_expense: Numeric; net_profit: Numeric;
          status: PnlStatus; generated_at: string; approved_by: string | null; approved_at: string | null;
          published_at: string | null;
        };
        Insert: {
          id?: string; outlet_id: string; entity_id: string; accounting_period_id: string;
          revenue?: Numeric; cogs?: Numeric; operating_expense?: Numeric; other_income?: Numeric;
          other_expense?: Numeric; status?: PnlStatus;
        };
        Update: Partial<Database["public"]["Tables"]["pnl_reports"]["Insert"]>;
        Relationships: [];
      };
      profit_distributions: {
        Row: {
          id: string; outlet_id: string; accounting_period_id: string; pnl_report_id: string; contract_id: string;
          net_profit_snapshot: Numeric; distribution_pct_snapshot: Numeric; distributable_profit: Numeric;
          status: DistributionStatus; approved_by: string | null; approved_at: string | null; created_at: string;
        };
        Insert: {
          id?: string; outlet_id: string; accounting_period_id: string; pnl_report_id: string; contract_id: string;
          net_profit_snapshot: Numeric; distribution_pct_snapshot: Numeric; status?: DistributionStatus;
        };
        Update: Partial<Database["public"]["Tables"]["profit_distributions"]["Row"]>;
        Relationships: [];
      };
      investor_profit_shares: {
        Row: {
          id: string; profit_distribution_id: string; investor_id: string; ownership_pct_snapshot: Numeric;
          share_amount: Numeric; status: DistributionStatus; payment_date: string | null;
          payment_reference: string | null; proof_of_payment_url: string | null; notes: string | null; created_at: string;
        };
        Insert: {
          id?: string; profit_distribution_id: string; investor_id: string; ownership_pct_snapshot: Numeric;
          share_amount: Numeric; status?: DistributionStatus;
        };
        Update: Partial<Database["public"]["Tables"]["investor_profit_shares"]["Row"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string; user_id: string | null; action: string; entity_table: string; entity_id: string;
          old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["audit_log"]["Row"], "id" | "created_at"> & { id?: string };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      v_posted_journal_lines: {
        Row: Database["public"]["Tables"]["journal_lines"]["Row"] & {
          journal_date: string; accounting_period_id: string; source_type: JournalSourceType; journal_status: JournalStatus;
        };
        Relationships: [];
      };
    };
    Functions: {
      fn_ownership_as_of: {
        Args: { p_outlet_id: string; p_as_of: string };
        Returns: { investor_id: string; ownership_pct: Numeric }[];
      };
      fn_period_readiness: {
        Args: { p_period_id: string; p_outlet_id: string };
        Returns: Record<string, unknown>; // jsonb — see 0007_pnl_distribution.sql for shape
      };
      fn_publish_pnl: { Args: { p_pnl_report_id: string; p_actor: string }; Returns: void };
      fn_reopen_period: { Args: { p_period_id: string; p_actor: string; p_reason: string }; Returns: void };
    };
    Enums: {
      user_role: UserRole;
      account_type: AccountType;
      normal_balance: NormalBalance;
      journal_status: JournalStatus;
      journal_source_type: JournalSourceType;
      pnl_status: PnlStatus;
      period_status: PeriodStatus;
      distribution_status: DistributionStatus;
      exception_type: ExceptionType;
      exception_status: ExceptionStatus;
      allocation_method: AllocationMethod;
      match_type: MatchType;
      import_source_type: ImportSourceType;
    };
    CompositeTypes: Record<string, never>;
  };
}

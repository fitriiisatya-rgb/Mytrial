import type { CashflowTransactionType } from "@/types/database.types";

/** RULE 1: Ending Balance = Opening Balance + Cash In - Cash Out, always computed per single account. */
export function calculateEndingBalance(opening: number, cashIn: number, cashOut: number): number {
  return opening + cashIn - cashOut;
}

export interface NetCashflowTxn {
  type: CashflowTransactionType;
  cashIn: number;
  cashOut: number;
}

/** RULE 3: internal transfer legs net to zero on the consolidated/external view — only true CASH_IN/CASH_OUT count. */
export function calculateExternalNetCashflow(transactions: NetCashflowTxn[]): number {
  return transactions.reduce((sum, t) => {
    if (t.type === "INTERNAL_TRANSFER_IN" || t.type === "INTERNAL_TRANSFER_OUT") return sum;
    return sum + t.cashIn - t.cashOut;
  }, 0);
}

export interface AccountLedger {
  accountId: string;
  opening: number;
  transactions: NetCashflowTxn[];
}

/** RULE 1: current balance per account, never mixed with another account's transactions. */
export function calculateAccountBalance(ledger: AccountLedger): number {
  const net = ledger.transactions.reduce((sum, t) => sum + t.cashIn - t.cashOut, 0);
  return ledger.opening + net;
}

/** RULE 2: consolidated cash position = sum of each active account's own balance. */
export function calculateConsolidatedCashPosition(accountBalances: number[]): number {
  return accountBalances.reduce((sum, b) => sum + b, 0);
}

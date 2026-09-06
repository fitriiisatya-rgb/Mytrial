/** Projected Balance = Current Balance + Future Cash In - Future Cash Out (per account or consolidated — caller decides scope). */
export function calculateProjectedBalance(currentBalance: number, upcomingCashIn: number, upcomingCashOut: number): number {
  return currentBalance + upcomingCashIn - upcomingCashOut;
}

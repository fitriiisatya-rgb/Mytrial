import { allocateEqually, allocateProportionally, type Weighted } from "@/lib/money";
import { checkBalance, type JournalDraft } from "./types";

export interface SharedCostOutletShare {
  outletId: string;
  /** Omit for an equal split across every listed outlet; provide to
   * weight by percentage/revenue/whatever basis the allocation_rules
   * row (0006) was configured with. */
  weight?: number;
}

export interface SharedCostJournalInput {
  bankTransactionId: string;
  importBatchId: string | null;
  entityId: string;
  txnDate: string;
  /** The one expense COA every outlet's Dr line uses (allocation_rules.
   * source_coa_id, 0006) — only the outlet dimension differs per line. */
  expenseCoaId: string;
  bankId: string;
  bankCoaId: string;
  amountSen: bigint;
  outlets: SharedCostOutletShare[];
  description: string | null;
}

/**
 * Spec F — Shared Cost: never posted to one outlet. Splits the total
 * across every outlet in `outlets` — equally if no weights are given,
 * proportionally by weight otherwise — using lib/money.ts's
 * allocateProportionally()/allocateEqually(), the same largest-remainder
 * method already used for profit-distribution splits (Phase 1), so
 * sum(outlet Dr lines) === total Cr line exactly, with any leftover sen
 * assigned deterministically rather than lost to rounding. One Cr line
 * for the full amount against the bank's own COA — same rule as Bank
 * Expense, never a generic cash account.
 */
export function buildSharedCostJournal(input: SharedCostJournalInput): JournalDraft {
  if (input.amountSen <= 0n) {
    throw new Error(`buildSharedCostJournal: amount must be positive, got ${input.amountSen}`);
  }
  if (input.outlets.length < 2) {
    throw new Error(`buildSharedCostJournal: shared cost needs at least 2 outlets to split across, got ${input.outlets.length}`);
  }

  const hasWeights = input.outlets.some((o) => o.weight !== undefined);
  const allShares = hasWeights
    ? allocateProportionally(
        input.amountSen,
        input.outlets.map((o): Weighted<string> => ({ key: o.outletId, weight: o.weight ?? 0 }))
      )
    : allocateEqually(
        input.amountSen,
        input.outlets.map((o) => o.outletId)
      );

  // A zero-weight outlet can legitimately receive a 0-sen share from
  // allocateProportionally — that outlet gets no line at all rather than
  // an invalid 0/0 line (spec H: a line may never be both-zero).
  const shares = allShares.filter((s) => s.amount > 0n);
  if (shares.length < 2) {
    throw new Error(`buildSharedCostJournal: fewer than 2 outlets ended up with a non-zero share (got ${shares.length}) — not a real split.`);
  }

  const draft: JournalDraft = {
    journalDate: input.txnDate,
    sourceType: "allocation",
    sourceId: input.bankTransactionId,
    batchId: input.importBatchId,
    entityId: input.entityId,
    description: input.description,
    lines: [
      ...shares.map((share) => ({
        coaId: input.expenseCoaId,
        entityId: input.entityId,
        outletId: share.key,
        bankAccountId: null,
        departmentId: null,
        costCenterId: null,
        debitSen: share.amount,
        creditSen: 0n,
        description: input.description,
      })),
      {
        coaId: input.bankCoaId,
        entityId: input.entityId,
        outletId: null,
        bankAccountId: input.bankId,
        departmentId: null,
        costCenterId: null,
        debitSen: 0n,
        creditSen: input.amountSen,
        description: input.description,
      },
    ],
  };

  const check = checkBalance(draft.lines);
  if (!check.balanced) throw new Error(`buildSharedCostJournal produced an unbalanced draft: ${check.errors.join("; ")}`);
  return draft;
}

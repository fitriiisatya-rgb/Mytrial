import { BatchDetail } from "@/components/import/batch-detail";

export default function BankExpenseBatchDetailPage({ params }: { params: { batchId: string } }) {
  return <BatchDetail batchId={params.batchId} />;
}

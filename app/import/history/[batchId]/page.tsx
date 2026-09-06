import { BatchDetail } from "@/components/import/batch-detail";

export default function HistoryBatchDetailPage({ params }: { params: { batchId: string } }) {
  return <BatchDetail batchId={params.batchId} />;
}

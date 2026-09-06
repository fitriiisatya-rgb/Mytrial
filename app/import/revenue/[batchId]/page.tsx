import { BatchDetail } from "@/components/import/batch-detail";

export default function RevenueBatchDetailPage({ params }: { params: { batchId: string } }) {
  return <BatchDetail batchId={params.batchId} />;
}

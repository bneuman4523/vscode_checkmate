import { useParams } from "wouter";
import DataRetentionSettings from "@/components/DataRetentionSettings";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export default function DataRetention() {
  const { customerId } = useParams<{ customerId: string }>();

  if (!customerId) {
    return <div className="p-6 text-muted-foreground">No customer selected.</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <Breadcrumbs />
      <DataRetentionSettings customerId={customerId} />
    </div>
  );
}

import QRScanner from "@/components/QRScanner";

export default function Scanner() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">QR Scanner</h1>
        <p className="text-muted-foreground">Scan attendee QR codes for quick check-in</p>
      </div>
      <div className="max-w-2xl">
        <QRScanner />
      </div>
    </div>
  );
}

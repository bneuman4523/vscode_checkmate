import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, Download, FileSpreadsheet, AlertCircle } from "lucide-react";
import { parseCSV } from "./csv-utils";
import type { AttendeeFormValues } from "./useAttendeeMutations";

interface AttendeeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (data: AttendeeFormValues[]) => void;
  isPending: boolean;
}

export function AttendeeImportDialog({
  open,
  onOpenChange,
  onImport,
  isPending,
}: AttendeeImportDialogProps) {
  const [importData, setImportData] = useState<AttendeeFormValues[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setImportData([]);
      setImportErrors([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { data, errors } = parseCSV(text);
      setImportData(data);
      setImportErrors(errors);
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = () => {
    if (importData.length > 0) {
      onImport(importData);
      setImportData([]);
      setImportErrors([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]" data-testid="dialog-import-attendees">
        <DialogHeader>
          <DialogTitle>Import Attendees</DialogTitle>
          <DialogDescription>
            Upload a CSV file with attendee data. Required columns: First Name, Last Name, Email.
            Optional columns: Company, Title, Type.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
              data-testid="input-file-upload"
            />
            <label htmlFor="csv-upload">
              <Button variant="outline" className="cursor-pointer" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Select CSV File
                </span>
              </Button>
            </label>
            <p className="text-xs text-muted-foreground mt-2">
              CSV files only. Max 1000 rows recommended.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs text-primary underline-offset-4 hover:underline"
              onClick={() => {
                const template = "First Name,Last Name,Email,Company,Title,Attendee Type,Reg Code\nJane,Doe,jane@example.com,Acme Corp,VP Marketing,Attendee,REG001\nJohn,Smith,john@example.com,Widget Inc,Engineer,VIP,REG002\n";
                const blob = new Blob([template], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "attendee-import-template.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
              data-testid="button-download-csv-template"
            >
              <Download className="h-3 w-3 mr-1" />
              Download CSV Template
            </Button>
          </div>

          {importErrors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="font-medium text-sm">Import Errors</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {importErrors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {importData.length > 0 && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">
                Ready to import {importData.length} attendees
              </p>
              <div className="max-h-32 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Email</TableHead>
                      <TableHead className="text-xs">Attendee Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importData.slice(0, 5).map((attendee, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs py-1">
                          {attendee.firstName} {attendee.lastName}
                        </TableCell>
                        <TableCell className="text-xs py-1">{attendee.email}</TableCell>
                        <TableCell className="text-xs py-1">{attendee.participantType}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {importData.length > 5 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    ...and {importData.length - 5} more
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImportConfirm}
            disabled={importData.length === 0 || isPending}
            data-testid="button-confirm-import"
          >
            {isPending
              ? `Importing ${importData.length}...`
              : `Import ${importData.length} Attendees`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

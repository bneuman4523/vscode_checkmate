import { z } from "zod";
import type { AttendeeFormValues } from "./useAttendeeMutations";

const attendeeFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  company: z.string().optional(),
  title: z.string().optional(),
  participantType: z.string().min(1, "Attendee type is required"),
  externalId: z.string().optional(),
  registrationStatus: z.string().optional(),
});

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV(text: string): { data: AttendeeFormValues[]; errors: string[] } {
  const lines = text.trim().split("\n");
  if (lines.length < 2) {
    return { data: [], errors: ["CSV must have a header row and at least one data row"] };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const headerMap: Record<string, string> = {
    "first name": "firstName",
    "firstname": "firstName",
    "first_name": "firstName",
    "last name": "lastName",
    "lastname": "lastName",
    "last_name": "lastName",
    "email": "email",
    "email address": "email",
    "company": "company",
    "organization": "company",
    "title": "title",
    "job title": "title",
    "job_title": "title",
    "position": "title",
    "job position": "title",
    "type": "participantType",
    "participant type": "participantType",
    "participant_type": "participantType",
    "attendee type": "participantType",
  };

  const columnIndices: Record<string, number> = {};
  headers.forEach((header, index) => {
    const mappedField = headerMap[header];
    if (mappedField) {
      columnIndices[mappedField] = index;
    }
  });

  const requiredFields = ["firstName", "lastName", "email"];
  const missingFields = requiredFields.filter((f) => columnIndices[f] === undefined);
  if (missingFields.length > 0) {
    return {
      data: [],
      errors: [`Missing required columns: ${missingFields.join(", ")}. Expected: First Name, Last Name, Email`],
    };
  }

  const data: AttendeeFormValues[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: AttendeeFormValues = {
      firstName: values[columnIndices.firstName]?.trim() || "",
      lastName: values[columnIndices.lastName]?.trim() || "",
      email: values[columnIndices.email]?.trim() || "",
      company: columnIndices.company !== undefined ? values[columnIndices.company]?.trim() : "",
      title: columnIndices.title !== undefined ? values[columnIndices.title]?.trim() : "",
      participantType: columnIndices.participantType !== undefined
        ? values[columnIndices.participantType]?.trim() || ""
        : "",
    };

    const result = attendeeFormSchema.safeParse(row);
    if (result.success) {
      data.push(row);
    } else {
      errors.push(`Row ${i + 1}: ${result.error.errors.map((e) => e.message).join(", ")}`);
    }
  }

  return { data, errors };
}

export function exportAttendeesToCSV(attendees: Array<{
  externalId: string | null;
  orderCode?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  title: string | null;
  participantType: string;
  registrationStatus: string | null;
  checkedIn: boolean;
  checkedInAt: string | Date | null;
  badgePrinted: boolean | null;
  badgePrintedAt: string | Date | null;
  createdAt: string | Date | null;
}>, eventId: string): void {
  const headers = ["Registration Code", "Order Code", "First Name", "Last Name", "Email", "Company", "Title", "Type", "Registration Status", "Checked In", "Checked In At", "Badge Printed", "Badge Printed At", "Created At"];
  const rows = attendees.map((a) => [
    a.externalId || "",
    a.orderCode || "",
    a.firstName,
    a.lastName,
    a.email,
    a.company || "",
    a.title || "",
    a.participantType,
    a.registrationStatus || "Registered",
    a.checkedIn ? "Yes" : "No",
    a.checkedInAt ? new Date(a.checkedInAt).toLocaleString() : "",
    a.badgePrinted ? "Yes" : "No",
    a.badgePrintedAt ? new Date(a.badgePrintedAt).toLocaleString() : "",
    a.createdAt ? new Date(a.createdAt).toLocaleString() : "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `attendees-${eventId}-${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

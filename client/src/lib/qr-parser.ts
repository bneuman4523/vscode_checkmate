import type { Attendee } from "@shared/schema";

export type QrMatchResult = {
  type: "found";
  attendee: Attendee;
  matchedBy: string;
} | {
  type: "not_found";
  scannedValue: string;
};

type FoundResult = Extract<QrMatchResult, { type: "found" }>;

const KNOWN_ID_FIELDS = [
  "externalId",
  "externalProfileId",
  "code",
  "registrationCode",
  "regCode",
  "reg_code",
  "registration_code",
  "attendeeId",
  "attendee_id",
  "confirmationCode",
  "confirmation_code",
  "barcode",
  "badge_id",
  "badgeId",
  "id",
];

const KNOWN_EMAIL_FIELDS = ["email", "emailAddress", "email_address", "e_mail"];

const KNOWN_NAME_FIELDS = {
  first: ["firstName", "first_name", "fname", "givenName", "given_name"],
  last: ["lastName", "last_name", "lname", "familyName", "family_name", "surname"],
};

function findFieldValue(obj: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase() === lower && typeof v === "string" && v.trim()) {
        return v.trim();
      }
    }
  }
  return undefined;
}

function tryMatchById(attendees: Attendee[], value: string, suffix?: string): FoundResult | null {
  let found = attendees.find((a) => a.externalId === value);
  if (found) return { type: "found", attendee: found, matchedBy: suffix ? `Registration Code (${suffix})` : "Registration Code" };

  found = attendees.find((a) => (a as any).externalProfileId === value);
  if (found) return { type: "found", attendee: found, matchedBy: suffix ? `External Profile ID (${suffix})` : "External Profile ID" };

  found = attendees.find((a) => a.id === value);
  if (found) return { type: "found", attendee: found, matchedBy: suffix ? `id (${suffix})` : "id" };

  return null;
}

function tryMatchByEmail(attendees: Attendee[], value: string, suffix?: string): FoundResult | null {
  const lower = value.toLowerCase();
  const found = attendees.find((a) => a.email?.toLowerCase() === lower);
  if (found) return { type: "found", attendee: found, matchedBy: suffix ? `email (${suffix})` : "email" };
  return null;
}

function tryMatchByName(attendees: Attendee[], firstName: string, lastName: string, suffix?: string): FoundResult | null {
  const found = attendees.find(
    (a) =>
      a.firstName?.toLowerCase() === firstName.toLowerCase() &&
      a.lastName?.toLowerCase() === lastName.toLowerCase()
  );
  if (found) return { type: "found", attendee: found, matchedBy: suffix ? `name (${suffix})` : "name" };
  return null;
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not JSON
  }
  return null;
}

function tryParseUrl(raw: string): { params: Record<string, string>; pathValue: string | null } | null {
  let urlStr = raw;
  if (!urlStr.includes("://") && urlStr.includes(".")) {
    urlStr = "https://" + urlStr;
  }
  try {
    const url = new URL(urlStr);
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const pathValue = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : null;
    if (Object.keys(params).length > 0 || pathValue) {
      return { params, pathValue };
    }
  } catch {
    // not a URL
  }
  return null;
}

function matchFromObject(attendees: Attendee[], obj: Record<string, unknown>, source: string): FoundResult | null {
  const idValue = findFieldValue(obj, KNOWN_ID_FIELDS);
  if (idValue) {
    const result = tryMatchById(attendees, idValue, source);
    if (result) return result;
  }

  const emailValue = findFieldValue(obj, KNOWN_EMAIL_FIELDS);
  if (emailValue) {
    const result = tryMatchByEmail(attendees, emailValue, source);
    if (result) return result;
  }

  const firstName = findFieldValue(obj, KNOWN_NAME_FIELDS.first);
  const lastName = findFieldValue(obj, KNOWN_NAME_FIELDS.last);
  if (firstName && lastName) {
    const result = tryMatchByName(attendees, firstName, lastName, source);
    if (result) return result;
  }

  return null;
}

function tryDelimited(attendees: Attendee[], raw: string, separator: string, label: string): FoundResult | null {
  const parts = raw.split(separator).map((p) => p.trim());
  if (parts.length < 2) return null;

  for (const part of parts) {
    const idResult = tryMatchById(attendees, part, label);
    if (idResult) return idResult;
  }

  for (const part of parts) {
    if (part.includes("@")) {
      const emailResult = tryMatchByEmail(attendees, part, label);
      if (emailResult) return emailResult;
    }
  }

  if (parts.length >= 2) {
    const nameResult = tryMatchByName(attendees, parts[0], parts[1], label);
    if (nameResult) return nameResult;
  }

  return null;
}

export function parseQrCode(raw: string, attendees: Attendee[]): QrMatchResult {
  const trimmed = raw.trim();
  if (!trimmed) return { type: "not_found", scannedValue: raw };

  const jsonObj = tryParseJson(trimmed);
  if (jsonObj) {
    const result = matchFromObject(attendees, jsonObj, "JSON");
    if (result) return result;
  }

  const urlData = tryParseUrl(trimmed);
  if (urlData) {
    if (urlData.pathValue) {
      const idResult = tryMatchById(attendees, urlData.pathValue, "URL path");
      if (idResult) return idResult;
    }
    if (Object.keys(urlData.params).length > 0) {
      const result = matchFromObject(attendees, urlData.params, "URL");
      if (result) return result;
    }
  }

  const plainIdResult = tryMatchById(attendees, trimmed);
  if (plainIdResult) return plainIdResult;

  const emailResult = tryMatchByEmail(attendees, trimmed);
  if (emailResult) return emailResult;

  if (trimmed.includes("|")) {
    const result = tryDelimited(attendees, trimmed, "|", "pipe-separated");
    if (result) return result;
  }

  if (trimmed.includes(",")) {
    const result = tryDelimited(attendees, trimmed, ",", "comma-separated");
    if (result) return result;
  }

  if (trimmed.includes("\t")) {
    const result = tryDelimited(attendees, trimmed, "\t", "tab-separated");
    if (result) return result;
  }

  if (trimmed.includes(";")) {
    const result = tryDelimited(attendees, trimmed, ";", "semicolon-separated");
    if (result) return result;
  }

  return { type: "not_found", scannedValue: trimmed };
}

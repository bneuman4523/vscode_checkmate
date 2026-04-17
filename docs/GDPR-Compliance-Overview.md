# Greet — GDPR & Data Privacy Compliance Overview

**Last Updated:** April 2026
**Product:** Greet (Event Registration & Check-In Platform)
**Data Role:** Data Processor (on behalf of event organizers who act as Data Controllers)

---

## 1. Architecture & Data Protection by Design

Greet is built with privacy-by-design principles in accordance with GDPR Article 25.

### Tenant Isolation
- All data is strictly separated per customer account at the database level using row-level tenant isolation via `customer_id`.
- No data is shared or accessible across customer accounts.
- All attendee endpoints enforce ownership validation server-side.

### Encryption
- **At rest:** Sensitive credentials (API keys, OAuth tokens, integration secrets) are encrypted using AES-256-GCM.
- **In transit:** All data transmitted between client, server, and third-party services uses TLS encryption.

### Session Security
- Admin sessions: automatic idle timeout after 4 hours.
- Staff sessions: automatic idle timeout after 8 hours.
- Warning dialogs are shown before session expiry, giving users the opportunity to extend.
- Session tokens are invalidated on logout and cleared on re-login.

### Access Control
- Role-based access control (Super Admin, Admin, Staff) with least-privilege enforcement.
- Per-endpoint authorization middleware validates both role and tenant ownership.
- Kiosk mode uses PIN-based access with per-event + IP rate limiting to prevent brute force.

---

## 2. Data Minimization

Greet collects and processes only the minimum personal data necessary for event check-in and badge printing operations.

### Attendee Data Stored
| Field | Purpose | Required |
|-------|---------|----------|
| First Name | Badge printing, identification | Yes |
| Last Name | Badge printing, identification | Yes |
| Email | Deduplication only | Yes |
| Company | Badge field (if configured) | No |
| Title | Badge field (if configured) | No |
| Custom Fields | Badge merge fields (configurable) | No |

### Badge Printing
- Only the specific fields configured on the badge template are rendered and transmitted for printing.
- The full attendee record is never sent to the printer — only the fields visible on the badge.

### Session Attendance Tracking
- Session check-in/out is recorded **only** when a badge is actively scanned.
- There is no passive tracking, no location beacons, and no background monitoring.
- The system records: attendee ID, session ID, timestamp, and source (e.g., kiosk, staff scanner).
- The act of presenting a badge for scanning is a deliberate, voluntary action.

---

## 3. Automated Data Retention

Greet includes a built-in data retention engine to support GDPR storage limitation requirements (Article 5(1)(e)).

### Account-Level Policy
Administrators can configure a retention policy per customer account:
- **Retention period:** Number of days after the reference date before data is processed (e.g., 30, 60, 90, 180, 365 days).
- **Reference date:** Either the event end date or the date of the last check-in activity.
- **Action:** Choose between:
  - **Anonymize** — Replaces all PII (names, emails, companies, titles, custom fields) with placeholder values. Removes signatures and workflow responses. Preserves aggregate data (check-in counts, timestamps, attendance numbers) for reporting.
  - **Delete** — Permanently removes the event and all associated data (attendees, check-in logs, sessions, badges, signatures).
- **Advance notice:** Configurable number of days before the action is executed, during which a notification is logged to give administrators time to export reports.

### Event-Level Overrides
Individual events can have their own retention settings that override the account default. This supports scenarios where specific events have contractual or regulatory requirements for shorter or longer retention.

### Audit Trail
Every retention action (notification, anonymization, deletion) is recorded in a dedicated audit log (`data_retention_log`) that captures:
- Customer and event identification
- Action taken and number of attendees affected
- Retention period and reference basis
- Policy source (account-level or event override)
- Timestamp of processing

### Background Processing
A background worker runs daily to:
1. Identify events approaching their retention window and log advance notifications.
2. Process events that have passed their retention window according to the configured policy.
3. Record all actions in the audit log.

---

## 4. Remote / Offsite Printing

Greet supports both local browser-based printing and remote cloud printing via PrintNode. When using remote printing:

### Data in Transit
- All communication between Greet and PrintNode uses TLS encryption.
- Only badge-relevant fields are transmitted — not the full attendee record.

### Access Control
- PrintNode access is controlled via API credentials stored encrypted (AES-256-GCM) in the database.
- Only the specific customer account's configured printers receive print jobs.

### Sub-Processor Considerations
- PrintNode operates as a data sub-processor and publishes its own GDPR compliance documentation.
- Event organizers should ensure PrintNode is listed as a sub-processor in their Data Processing Agreement (DPA).
- Physical badge handling and disposal at offsite print locations is the responsibility of the event organizer.

### Local Alternative
- Browser-based printing is available as an alternative that keeps all data processing entirely local with no third-party data transmission.

---

## 5. Consent & Legal Basis

Greet is a **data processor**. The legal basis for collecting and processing attendee data is determined by the event organizer (data controller), not by Greet.

### Typical Legal Bases Used by Event Organizers
- **Legitimate interest** — Managing event attendance, safety, and logistics.
- **Contractual necessity** — Fulfilling event registration terms.
- **Consent** — Where explicitly obtained during registration.

### Recommendations for Event Organizers
- Include session attendance tracking and badge data collection in your event privacy notice.
- Ensure your registration terms reference the use of check-in and badge printing technology.
- Configure retention policies in Greet to align with your organization's data retention schedule.

---

## 6. Data Subject Rights

Greet provides the tools necessary for data controllers to fulfill data subject requests:

| Right | How Greet Supports It |
|-------|---------------------------|
| **Access** (Art. 15) | Attendee data is searchable and exportable by authorized administrators. |
| **Rectification** (Art. 16) | Attendee records can be edited by authorized administrators. |
| **Erasure** (Art. 17) | Individual attendees can be deleted. Automated retention policies handle bulk erasure. |
| **Restriction** (Art. 18) | Event data can be frozen (sync frozen) to prevent further processing. |
| **Portability** (Art. 20) | Attendee data can be exported in standard formats. |

---

## 7. Third-Party Services & Sub-Processors

| Service | Purpose | Data Shared |
|---------|---------|-------------|
| **Neon PostgreSQL** | Primary database | All application data (encrypted at rest by provider) |
| **PrintNode** | Cloud printing | Badge-relevant fields only (encrypted in transit) |
| **Twilio** | SMS notifications / OTP | Phone numbers, message content |
| **Resend** | Email notifications / OTP | Email addresses, message content |

---

## 8. Incident Response

- All application errors are logged to the database with context for forensic review.
- Production logging is focused on errors, retries, and completions — not routine data access.
- Rate limiting is applied to sensitive endpoints (authentication, kiosk PIN entry) to mitigate abuse.

---

## 9. Responsibilities Summary

| Responsibility | Owner |
|---------------|-------|
| Legal basis for data collection | Event Organizer (Controller) |
| Privacy notice to attendees | Event Organizer (Controller) |
| Data Processing Agreement (DPA) | Business/Legal teams |
| Data retention policy configuration | Event Organizer (via Greet admin UI) |
| Sub-processor documentation | Event Organizer (Controller) |
| Technical security controls | Greet (Processor) |
| Encryption at rest and in transit | Greet (Processor) |
| Tenant isolation and access control | Greet (Processor) |
| Automated retention and anonymization | Greet (Processor) |
| Physical badge disposal at offsite locations | Event Organizer (Controller) |

---

*This document is provided for informational purposes and describes the technical capabilities of the Greet platform. It is not legal advice. Event organizers should consult with their legal or data protection teams to ensure their use of Greet complies with applicable regulations.*

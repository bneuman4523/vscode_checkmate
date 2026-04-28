# Badge Headshot Photos — Implementation Plan

**Status:** Planned (not yet implemented)
**Trigger:** Customer request after launch
**Priority:** Medium — build when requested, not speculatively

---

## Overview

Allow attendees to have headshot photos displayed on their printed badges. Photos are uploaded by admins or synced from external platforms, stored in S3, and rendered on the badge canvas alongside merge fields.

## Schema Change

Add to `attendees` table:
```
photoUrl: text("photo_url")  — S3 object path (e.g., "/objects/uploads/photos/uuid.jpg")
```

No binary storage in DB. Photo referenced by URL only.

## Storage

- **Location:** Same S3 bucket as other uploads (`greet-uploads` or equivalent)
- **Path format:** `uploads/photos/{attendeeId}-{uuid}.jpg`
- **Access:** Private bucket, served via presigned GET URLs (15 min TTL)
- **Upload:** Presigned PUT URL flow (same as existing image upload pattern in s3-storage.ts)
- **Max size:** 2MB per photo
- **Formats:** JPEG, PNG, WebP

## Privacy & Compliance

**PII classification:** Photos are biometric-adjacent PII under GDPR and CCPA.

**Mitigations:**
1. S3 bucket is private by default — no public access
2. Presigned URLs expire after 15 minutes
3. Server-side encryption on S3 (AES-256, AWS-managed keys)
4. Photos follow same data retention policy as attendee records
5. When attendee is deleted (soft or hard), S3 photo object must be deleted too
6. Photos are NOT cached in IndexedDB for offline kiosk mode (PII on uncontrolled device)

**Consent:** Attendees consent implicitly via event registration — the badge is worn publicly. No additional consent flow required for badge photos.

## Badge Rendering

- Add `photo` element type to badge designer (alongside logo, banner, image)
- Photo positioned via drag-and-drop like other elements
- Render as circular or rectangular crop (configurable)
- Fallback: initials circle (existing pattern) when no photo available
- DPI: 300 DPI minimum for print quality at badge sizes

## Data Flow

### Admin Upload
1. Admin opens attendee edit dialog
2. Clicks "Upload Photo" — requests presigned PUT URL
3. Client uploads directly to S3
4. `photoUrl` saved on attendee record

### Integration Sync
1. External platform provides photo URL in attendee data
2. Sync orchestrator downloads photo, re-uploads to S3
3. `photoUrl` saved on attendee record
4. Original external URL not stored (prevents broken links)

### Inbound API
1. Partner sends `photoUrl` field in attendee payload (external URL)
2. Greet downloads and re-stores in S3 (same as sync)
3. Alternatively: partner uses presigned upload flow first, then references the S3 path

### Badge Print
1. Badge render surface fetches photo via presigned GET URL
2. Renders into canvas at configured position/size
3. Photo embedded in PDF for PrintNode cloud printing
4. Offline: photo not available (no caching), badge prints with initials fallback

## Cleanup Requirements

**CRITICAL:** When implementing, must add S3 object deletion to:
- Attendee hard delete
- Attendee soft delete (data retention policy execution)
- Customer cascade delete
- Photo replacement (delete old before uploading new)

This is not implemented today for any S3 objects — it's a gap that needs fixing for all uploads, not just photos.

## Estimated Effort

| Task | Effort |
|------|--------|
| Schema + migration | 15 min |
| Admin upload UI in attendee edit | 2 hrs |
| Badge designer photo element | 3 hrs |
| Badge render surface photo support | 2 hrs |
| S3 cleanup on delete | 1 hr |
| Integration sync photo download | 2 hrs |
| Inbound API photo support | 1 hr |
| **Total** | **~11 hrs** |

## Dependencies

- S3 storage must be configured (`S3_BUCKET_NAME` + `AWS_REGION`)
- Badge designer needs new element type
- Print orchestrator needs photo rendering support

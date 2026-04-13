import { createChildLogger } from '../logger';
import type { Express, Request, Response } from "express";
import ExcelJS from "exceljs";
import { storage } from "../storage";
import { requireAuth, getEffectiveCustomerId } from "../auth";
import type { Attendee, AttendeeWorkflowResponse, AttendeeSignature, EventBuyerQuestion, Session, SessionCheckin } from "@shared/schema";

const logger = createChildLogger('Reports');

const TIMEZONE_LABEL_MAP: Record<string, string> = {
  '(UTC-12:00)': 'Etc/GMT+12',
  '(UTC-11:00)': 'Pacific/Midway',
  '(UTC-10:00)': 'Pacific/Honolulu',
  '(UTC-09:00)': 'America/Anchorage',
  '(UTC-08:00)': 'America/Los_Angeles',
  '(UTC-07:00)': 'America/Denver',
  '(UTC-06:00)': 'America/Chicago',
  '(UTC-05:00)': 'America/New_York',
  '(UTC-04:00)': 'America/Halifax',
  '(UTC-03:30)': 'America/St_Johns',
  '(UTC-03:00)': 'America/Sao_Paulo',
  '(UTC-02:00)': 'Etc/GMT+2',
  '(UTC-01:00)': 'Atlantic/Azores',
  '(UTC+00:00)': 'UTC',
  '(UTC)': 'UTC',
  '(UTC+01:00)': 'Europe/London',
  '(UTC+02:00)': 'Europe/Berlin',
  '(UTC+03:00)': 'Europe/Moscow',
  '(UTC+03:30)': 'Asia/Tehran',
  '(UTC+04:00)': 'Asia/Dubai',
  '(UTC+04:30)': 'Asia/Kabul',
  '(UTC+05:00)': 'Asia/Karachi',
  '(UTC+05:30)': 'Asia/Kolkata',
  '(UTC+05:45)': 'Asia/Kathmandu',
  '(UTC+06:00)': 'Asia/Dhaka',
  '(UTC+06:30)': 'Asia/Yangon',
  '(UTC+07:00)': 'Asia/Bangkok',
  '(UTC+08:00)': 'Asia/Singapore',
  '(UTC+09:00)': 'Asia/Tokyo',
  '(UTC+09:30)': 'Australia/Darwin',
  '(UTC+10:00)': 'Australia/Sydney',
  '(UTC+11:00)': 'Pacific/Noumea',
  '(UTC+12:00)': 'Pacific/Auckland',
  '(UTC+13:00)': 'Pacific/Tongatapu',
};

function resolveIANATimezone(tz: string): string | undefined {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    // Not a valid IANA timezone - try to extract UTC offset from label like "(UTC-08:00) Pacific Time"
  }
  const offsetMatch = tz.match(/\(UTC([+-]\d{2}:\d{2})?\)/);
  if (offsetMatch) {
    const key = offsetMatch[0];
    if (TIMEZONE_LABEL_MAP[key]) return TIMEZONE_LABEL_MAP[key];
  }
  return undefined;
}

function formatDateForTimezone(date: Date | string | null | undefined, timezone?: string | null): string {
  if (!date) return '';
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return '';
    const ianaZone = timezone ? resolveIANATimezone(timezone) : undefined;
    const d = new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: ianaZone || 'UTC',
      timeZoneName: 'short',
    }).format(dateObj);
    return d;
  } catch {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toISOString();
  }
}

async function resolveEventTimezone(event: { timezone?: string | null; locationId?: string | null }): Promise<string> {
  if (event.timezone) return event.timezone;
  if (event.locationId) {
    const location = await storage.getLocation(event.locationId);
    if (location?.timezone) return location.timezone;
  }
  return 'UTC';
}

export function registerReportRoutes(app: Express): void {
  
  // Get event check-in report data
  app.get("/api/reports/events/:eventId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const customerId = getEffectiveCustomerId(req);
      
      // Get event and verify access
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      if (customerId && event.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get all attendees with their check-in data
      const attendees: Attendee[] = await storage.getAttendees(eventId);
      
      // Get workflow responses for all attendees
      const workflowResponses: AttendeeWorkflowResponse[] = await storage.getAttendeeWorkflowResponsesByEvent(eventId);
      
      // Get signatures for all attendees
      const signatures: AttendeeSignature[] = await storage.getAttendeeSignaturesByEvent(eventId);
      
      // Get buyer questions for the event
      const buyerQuestions: EventBuyerQuestion[] = await storage.getEventBuyerQuestions(eventId);
      
      // Get sessions for the event
      const sessions: Session[] = await storage.getSessions(eventId);
      
      // Get session check-ins for all sessions
      const sessionCheckins: SessionCheckin[] = await storage.getSessionCheckinsByEvent(eventId);
      
      // Build report data with structure expected by frontend
      const reportData = attendees.map(attendee => {
        const attendeeResponses = workflowResponses.filter(r => r.attendeeId === attendee.id);
        const attendeeSignature = signatures.find(s => s.attendeeId === attendee.id);
        const attendeeSessionCheckins = sessionCheckins.filter(c => c.attendeeId === attendee.id);
        
        // Build custom responses array for frontend
        const customResponses = attendeeResponses.map(response => {
          const question = buyerQuestions.find(q => q.id === response.questionId);
          return {
            questionId: response.questionId,
            questionText: question?.questionText || '',
            response: response.responseValues ? response.responseValues.join('; ') : response.responseValue || '',
            responseType: question?.questionType || 'text',
          };
        });
        
        // Build session check-in data - preserve all chronological events, pair check-ins with checkouts
        const sortedSessionEvents = [...attendeeSessionCheckins].sort((a, b) => 
          a.timestamp.getTime() - b.timestamp.getTime()
        );
        const sessionData: Array<{ sessionId: string; sessionName: string; checkinTime: string; checkoutTime?: string }> = [];
        const usedCheckoutIds = new Set<string>();
        
        for (const event of sortedSessionEvents) {
          if (event.action !== 'checkin') continue;
          const session = sessions.find(s => s.id === event.sessionId);
          // Find next unused checkout for same session after this checkin
          const matchingCheckout = sortedSessionEvents.find(c => 
            c.sessionId === event.sessionId && 
            c.action === 'checkout' && 
            c.timestamp > event.timestamp &&
            !usedCheckoutIds.has(c.id)
          );
          if (matchingCheckout) usedCheckoutIds.add(matchingCheckout.id);
          sessionData.push({
            sessionId: event.sessionId,
            sessionName: session?.name || 'Unknown Session',
            checkinTime: event.timestamp.toISOString(),
            checkoutTime: matchingCheckout?.timestamp?.toISOString(),
          });
        }
        
        // Build check-ins array for frontend (simulated from attendee status)
        const checkIns = attendee.checkedIn ? [{
          id: `checkin-${attendee.id}`,
          checkinType: 'event',
          checkinTime: attendee.checkedInAt?.toISOString() || new Date().toISOString(),
          badgePrinted: attendee.badgePrinted || false,
        }] : [];
        
        return {
          attendee: {
            id: attendee.id,
            firstName: attendee.firstName,
            lastName: attendee.lastName,
            email: attendee.email,
            company: attendee.company,
            registrationType: attendee.participantType,
            status: attendee.registrationStatus,
          },
          checkIns,
          badgePrintCount: attendee.badgePrinted ? 1 : 0,
          lastBadgePrintTime: attendee.badgePrintedAt?.toISOString(),
          customResponses,
          signature: attendeeSignature ? {
            id: attendeeSignature.id,
            signatureData: attendeeSignature.signatureData,
            signatureFileUrl: attendeeSignature.signatureFileUrl,
            thumbnailFileUrl: attendeeSignature.thumbnailFileUrl,
            signedAt: attendeeSignature.signedAt?.toISOString() || '',
          } : undefined,
          sessionCheckins: sessionData,
        };
      });
      
      // Calculate summary stats matching frontend expectations
      // uniqueCheckins = number of unique attendees who checked in at least once
      // totalCheckins = total number of check-in scan events
      const uniqueCheckins = attendees.filter(a => a.checkedIn).length;
      const totalCheckins = sessionCheckins.filter(c => c.action === 'checkin').length + uniqueCheckins;
      
      const tz = await resolveEventTimezone(event);
      
      res.json({
        event: {
          id: event.id,
          name: event.name,
          eventDate: event.eventDate,
          startDate: event.startDate,
          endDate: event.endDate,
          timezone: tz || null,
        },
        questions: buyerQuestions.map(q => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options,
        })),
        sessions: sessions.map(s => ({
          id: s.id,
          name: s.name,
          sessionCode: s.sessionCode,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        attendees: reportData,
        summary: {
          totalAttendees: attendees.length,
          totalCheckins,
          uniqueCheckins,
          badgesPrinted: attendees.filter(a => a.badgePrinted).length,
          signaturesCollected: signatures.length,
          customQuestionsAnswered: workflowResponses.length,
          sessionCheckinsTotal: sessionCheckins.length,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error generating event report");
      res.status(500).json({ error: "Failed to generate report" });
    }
  });
  
  // Get session-specific report
  app.get("/api/reports/events/:eventId/sessions/:sessionId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { eventId, sessionId } = req.params;
      const customerId = getEffectiveCustomerId(req);
      
      // Get event and verify access
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      if (customerId && event.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get session
      const session = await storage.getSession(sessionId);
      if (!session || session.eventId !== eventId) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Get session registrations
      const registrations = await storage.getSessionRegistrations(sessionId);
      
      // Get session check-ins
      const checkins = await storage.getSessionCheckins(sessionId);
      
      // Get attendee details for each registration
      const attendeeIds = registrations.map(r => r.attendeeId);
      const attendees = await Promise.all(attendeeIds.map(id => storage.getAttendee(id)));
      
      const reportData = registrations.map(reg => {
        const attendee = attendees.find(a => a?.id === reg.attendeeId);
        const checkin = checkins.find(c => c.attendeeId === reg.attendeeId);
        
        return {
          registrationId: reg.id,
          attendeeId: reg.attendeeId,
          firstName: attendee?.firstName || '',
          lastName: attendee?.lastName || '',
          email: attendee?.email || '',
          company: attendee?.company || '',
          participantType: attendee?.participantType || '',
          registrationStatus: reg.status,
          registeredAt: reg.registeredAt,
          checkedIn: checkin?.action === 'checkin',
          checkedInAt: checkin?.timestamp,
          checkInSource: checkin?.source,
        };
      });
      
      res.json({
        event: {
          id: event.id,
          name: event.name,
        },
        session: {
          id: session.id,
          name: session.name,
          sessionCode: session.sessionCode,
          startTime: session.startTime,
          endTime: session.endTime,
          location: session.location,
          capacity: session.capacity,
        },
        attendees: reportData,
        summary: {
          totalRegistered: registrations.length,
          checkedIn: checkins.filter(c => c.action === 'checkin').length,
          capacity: session.capacity,
          utilizationPercent: session.capacity 
            ? Math.round((checkins.filter(c => c.action === 'checkin').length / session.capacity) * 100) 
            : null,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error generating session report");
      res.status(500).json({ error: "Failed to generate report" });
    }
  });
  
  // Standalone session report endpoint (without eventId in URL) for frontend
  app.get("/api/reports/sessions/:sessionId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const customerId = getEffectiveCustomerId(req);
      
      // Get session
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Get event and verify access
      const event = await storage.getEvent(session.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      if (customerId && event.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get session registrations
      const registrations = await storage.getSessionRegistrations(sessionId);
      
      // Get session check-ins
      const checkins = await storage.getSessionCheckins(sessionId);
      
      // Get attendee details for each registration
      const attendeeIds = registrations.map(r => r.attendeeId);
      const attendees = await Promise.all(attendeeIds.map(id => storage.getAttendee(id)));
      
      // Calculate currently attending by finding last action per attendee
      const attendeeLastAction = new Map<string, { action: string; time: Date }>();
      for (const checkin of checkins) {
        const existing = attendeeLastAction.get(checkin.attendeeId);
        if (!existing || checkin.timestamp > existing.time) {
          attendeeLastAction.set(checkin.attendeeId, { action: checkin.action, time: checkin.timestamp });
        }
      }
      const currentlyAttending = Array.from(attendeeLastAction.values()).filter(a => a.action === 'checkin').length;
      const checkedInCount = new Set(checkins.filter(c => c.action === 'checkin').map(c => c.attendeeId)).size;
      const checkedOutCount = new Set(checkins.filter(c => c.action === 'checkout').map(c => c.attendeeId)).size;
      
      const reportData = registrations.map(reg => {
        const attendee = attendees.find(a => a?.id === reg.attendeeId);
        // Sort attendee's checkins chronologically to get accurate first/last times
        const attendeeCheckins = checkins
          .filter(c => c.attendeeId === reg.attendeeId)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // Get first check-in and latest checkout
        const firstCheckin = attendeeCheckins.find(c => c.action === 'checkin');
        const lastCheckout = [...attendeeCheckins].reverse().find(c => c.action === 'checkout');
        const lastAction = attendeeLastAction.get(reg.attendeeId);
        
        let status = 'registered';
        if (lastAction) {
          status = lastAction.action === 'checkin' ? 'checked_in' : 'checked_out';
        }
        
        return {
          attendeeId: reg.attendeeId,
          firstName: attendee?.firstName || '',
          lastName: attendee?.lastName || '',
          email: attendee?.email || '',
          company: attendee?.company || '',
          checkinTime: firstCheckin?.timestamp ? firstCheckin.timestamp.toISOString() : undefined,
          checkoutTime: lastCheckout?.timestamp ? lastCheckout.timestamp.toISOString() : undefined,
          status,
        };
      });
      
      res.json({
        session: {
          id: session.id,
          name: session.name,
          startTime: session.startTime ? session.startTime.toISOString() : undefined,
          endTime: session.endTime ? session.endTime.toISOString() : undefined,
          capacity: session.capacity,
        },
        summary: {
          totalRegistered: registrations.length,
          totalCheckedIn: checkedInCount,
          totalCheckedOut: checkedOutCount,
          currentlyAttending,
        },
        attendees: reportData,
      });
    } catch (error) {
      logger.error({ err: error }, "Error generating session report");
      res.status(500).json({ error: "Failed to generate report" });
    }
  });
  
  // Export event report as CSV
  app.get("/api/reports/events/:eventId/export", requireAuth, async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      const { format = 'csv', includeSignatures = 'false' } = req.query;
      const customerId = getEffectiveCustomerId(req);
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      if (customerId && event.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const tz = await resolveEventTimezone(event);
      const attendees: Attendee[] = await storage.getAttendees(eventId);
      const workflowResponses: AttendeeWorkflowResponse[] = await storage.getAttendeeWorkflowResponsesByEvent(eventId);
      const signatures: AttendeeSignature[] = await storage.getAttendeeSignaturesByEvent(eventId);
      const buyerQuestions: EventBuyerQuestion[] = await storage.getEventBuyerQuestions(eventId);
      
      const safeFilename = event.name.replace(/[^a-zA-Z0-9]/g, '_');
      const dateStamp = new Date().toISOString().split('T')[0];

      if (format === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Attendee Report');

        const tzLabel = tz ? ` (${tz})` : '';
        const columns: Partial<ExcelJS.Column>[] = [
          { header: 'External ID', key: 'externalId', width: 15 },
          { header: 'First Name', key: 'firstName', width: 15 },
          { header: 'Last Name', key: 'lastName', width: 15 },
          { header: 'Email', key: 'email', width: 25 },
          { header: 'Company', key: 'company', width: 20 },
          { header: 'Title', key: 'title', width: 15 },
          { header: 'Attendee Type', key: 'participantType', width: 15 },
          { header: 'Registration Status', key: 'registrationStatus', width: 15 },
          { header: 'Checked In', key: 'checkedIn', width: 10 },
          { header: `Check-In Time${tzLabel}`, key: 'checkinTime', width: 25 },
          { header: 'Badge Printed', key: 'badgePrinted', width: 12 },
          { header: `Badge Print Time${tzLabel}`, key: 'badgePrintTime', width: 25 },
        ];

        for (const q of buyerQuestions) {
          columns.push({ header: q.questionText, key: `q_${q.id}`, width: 20 });
        }

        columns.push({ header: 'Signature Captured', key: 'sigCaptured', width: 15 });
        columns.push({ header: `Signature Time${tzLabel}`, key: 'sigTime', width: 25 });

        if (includeSignatures === 'true') {
          columns.push({ header: 'Signature', key: 'sigImage', width: 25 });
        }

        sheet.columns = columns;

        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2958' } };
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

        for (let i = 0; i < attendees.length; i++) {
          const attendee = attendees[i];
          const attendeeResponses = workflowResponses.filter(r => r.attendeeId === attendee.id);
          const attendeeSignature = signatures.find(s => s.attendeeId === attendee.id);

          const rowData: Record<string, any> = {
            externalId: attendee.externalId || '',
            firstName: attendee.firstName,
            lastName: attendee.lastName,
            email: attendee.email,
            company: attendee.company || '',
            title: attendee.title || '',
            participantType: attendee.participantType,
            registrationStatus: attendee.registrationStatus,
            checkedIn: attendee.checkedIn ? 'Yes' : 'No',
            checkinTime: formatDateForTimezone(attendee.checkedInAt, tz),
            badgePrinted: attendee.badgePrinted ? 'Yes' : 'No',
            badgePrintTime: formatDateForTimezone(attendee.badgePrintedAt, tz),
            sigCaptured: attendeeSignature ? 'Yes' : 'No',
            sigTime: attendeeSignature ? formatDateForTimezone(attendeeSignature.signedAt, tz) : '',
          };

          for (const q of buyerQuestions) {
            const response = attendeeResponses.find(r => r.questionId === q.id);
            rowData[`q_${q.id}`] = response ? (response.responseValues ? response.responseValues.join('; ') : response.responseValue || '') : '';
          }

          if (includeSignatures === 'true') {
            rowData['sigImage'] = '';
          }

          const row = sheet.addRow(rowData);
          const rowNum = i + 2;

          if (includeSignatures === 'true' && attendeeSignature?.signatureData) {
            try {
              let base64Data = attendeeSignature.signatureData;
              if (base64Data.startsWith('data:')) {
                base64Data = base64Data.split(',')[1];
              }

              const imageId = workbook.addImage({
                base64: base64Data,
                extension: 'png',
              });

              const sigColIndex = columns.findIndex(c => c.key === 'sigImage');
              row.height = 40;
              sheet.addImage(imageId, {
                tl: { col: sigColIndex, row: rowNum - 1 },
                ext: { width: 150, height: 40 },
              });
            } catch (imgErr) {
              logger.error({ err: imgErr }, 'Error embedding signature image');
            }
          }
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const filename = `${safeFilename}_report_${dateStamp}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(buffer as ArrayBuffer));
        return;
      }

      // CSV export
      const tzLabel = tz ? ` (${tz})` : '';
      const headers = [
        'ID', 'External ID', 'First Name', 'Last Name', 'Email', 
        'Company', 'Title', 'Attendee Type', 'Registration Status',
        'Checked In', `Check-In Time${tzLabel}`, 'Badge Printed', `Badge Print Time${tzLabel}`,
        ...buyerQuestions.map(q => q.questionText),
        'Signature Captured', `Signature Time${tzLabel}`,
      ];
      
      const rows = attendees.map(attendee => {
        const attendeeResponses = workflowResponses.filter(r => r.attendeeId === attendee.id);
        const attendeeSignature = signatures.find(s => s.attendeeId === attendee.id);
        
        const row = [
          attendee.id,
          attendee.externalId || '',
          attendee.firstName,
          attendee.lastName,
          attendee.email,
          attendee.company || '',
          attendee.title || '',
          attendee.participantType,
          attendee.registrationStatus,
          attendee.checkedIn ? 'Yes' : 'No',
          formatDateForTimezone(attendee.checkedInAt, tz),
          attendee.badgePrinted ? 'Yes' : 'No',
          formatDateForTimezone(attendee.badgePrintedAt, tz),
        ];
        
        for (const question of buyerQuestions) {
          const response = attendeeResponses.find(r => r.questionId === question.id);
          if (response) {
            row.push(response.responseValues ? response.responseValues.join('; ') : response.responseValue || '');
          } else {
            row.push('');
          }
        }
        
        row.push(attendeeSignature ? 'Yes' : 'No');
        row.push(attendeeSignature ? formatDateForTimezone(attendeeSignature.signedAt, tz) : '');
        
        return row;
      });
      
      const escapeCSV = (value: string | number | boolean) => {
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(',')),
      ].join('\n');
      
      const filename = `${safeFilename}_report_${dateStamp}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (error) {
      logger.error({ err: error }, "Error exporting report");
      res.status(500).json({ error: "Failed to export report" });
    }
  });

  // Session time tracking report - calculates total time in room per attendee
  app.get("/api/reports/sessions/:sessionId/time-tracking", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const customerId = getEffectiveCustomerId(req);
      
      // Get session
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Get event and verify access
      const event = await storage.getEvent(session.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      if (customerId && event.customerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get all session check-ins
      const checkins = await storage.getSessionCheckins(sessionId);
      
      // Get unique attendee IDs who have any check-ins
      const attendeeIds = [...new Set(checkins.map(c => c.attendeeId))];
      const attendees = await Promise.all(attendeeIds.map(id => storage.getAttendee(id)));
      
      // Calculate time in room for each attendee
      const attendeeTimeData = attendeeIds.map(attendeeId => {
        const attendee = attendees.find(a => a?.id === attendeeId);
        const attendeeCheckins = checkins
          .filter(c => c.attendeeId === attendeeId)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // Pair check-ins with check-outs to calculate time segments
        let totalTimeMs = 0;
        let openCheckinTime: Date | null = null;
        const timeSegments: Array<{ checkin: Date; checkout?: Date; durationMs: number }> = [];
        
        for (const action of attendeeCheckins) {
          if (action.action === 'checkin') {
            openCheckinTime = action.timestamp;
          } else if (action.action === 'checkout' && openCheckinTime) {
            const durationMs = action.timestamp.getTime() - openCheckinTime.getTime();
            totalTimeMs += durationMs;
            timeSegments.push({
              checkin: openCheckinTime,
              checkout: action.timestamp,
              durationMs,
            });
            openCheckinTime = null;
          }
        }
        
        // If no checkout, calculate time until session end
        const isCurrentlyCheckedIn = openCheckinTime !== null;
        if (isCurrentlyCheckedIn && openCheckinTime) {
          let endTime: Date;
          if (session.endTime) {
            // Use session end time for attendees without checkout
            endTime = session.endTime;
          } else {
            // No session end time set - use current time as fallback
            endTime = new Date();
          }
          // Only add positive duration (in case check-in is after session end due to data issues)
          const ongoingDurationMs = Math.max(0, endTime.getTime() - openCheckinTime.getTime());
          totalTimeMs += ongoingDurationMs;
        }
        
        // Format total time as HH:MM:SS
        const hours = Math.floor(totalTimeMs / 3600000);
        const minutes = Math.floor((totalTimeMs % 3600000) / 60000);
        const seconds = Math.floor((totalTimeMs % 60000) / 1000);
        const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        return {
          attendeeId,
          firstName: attendee?.firstName || '',
          lastName: attendee?.lastName || '',
          email: attendee?.email || '',
          company: attendee?.company || '',
          totalTimeMs,
          formattedTime,
          isCurrentlyCheckedIn,
          checkinCount: timeSegments.length + (isCurrentlyCheckedIn ? 1 : 0),
          lastCheckinTime: openCheckinTime?.toISOString() || timeSegments[timeSegments.length - 1]?.checkin?.toISOString(),
          lastCheckoutTime: timeSegments[timeSegments.length - 1]?.checkout?.toISOString(),
        };
      });
      
      // Calculate averages
      const totalAttendees = attendeeTimeData.length;
      const totalTimeAllMs = attendeeTimeData.reduce((sum, a) => sum + a.totalTimeMs, 0);
      const avgTimeMs = totalAttendees > 0 ? totalTimeAllMs / totalAttendees : 0;
      
      // Format average time
      const avgHours = Math.floor(avgTimeMs / 3600000);
      const avgMinutes = Math.floor((avgTimeMs % 3600000) / 60000);
      const avgSeconds = Math.floor((avgTimeMs % 60000) / 1000);
      const avgFormattedTime = `${avgHours.toString().padStart(2, '0')}:${avgMinutes.toString().padStart(2, '0')}:${avgSeconds.toString().padStart(2, '0')}`;
      
      // Sort by total time descending
      attendeeTimeData.sort((a, b) => b.totalTimeMs - a.totalTimeMs);
      
      res.json({
        session: {
          id: session.id,
          name: session.name,
          startTime: session.startTime?.toISOString(),
          endTime: session.endTime?.toISOString(),
        },
        summary: {
          totalAttendees,
          currentlyInRoom: attendeeTimeData.filter(a => a.isCurrentlyCheckedIn).length,
          avgTimeMs,
          avgFormattedTime,
          totalTimeAllMs,
        },
        attendees: attendeeTimeData,
      });
    } catch (error) {
      logger.error({ err: error }, "Error generating session time tracking report");
      res.status(500).json({ error: "Failed to generate report" });
    }
  });
}

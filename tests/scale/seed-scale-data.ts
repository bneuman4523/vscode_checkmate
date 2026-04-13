/**
 * Scale Testing Data Seeder
 * Seeds 20,000 attendees with 20 sessions each for performance testing
 */

import { db } from '../../server/db';
import { 
  customers, 
  events, 
  attendees, 
  sessions, 
  sessionRegistrations,
  badgeTemplates 
} from '../../shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import { TestConfig, TestResult } from '../config';
import { generateId, generateEmail, generateName, generateCompany, generateParticipantType } from '../utils/id-generator';
import { Timer, formatDuration, calculateStats } from '../utils/timer';
import { MemoryProfiler } from '../utils/memory-profiler';

export interface ScaleSeedResult {
  success: boolean;
  customerId: string;
  eventId: string;
  attendeeCount: number;
  sessionCount: number;
  registrationCount: number;
  seedDuration: number;
  metrics: {
    attendeeSeedTime: number;
    sessionSeedTime: number;
    registrationSeedTime: number;
    avgAttendeeInsertTime: number;
    avgRegistrationInsertTime: number;
    peakMemoryMB: number;
  };
  errors: string[];
}

export async function seedScaleData(
  attendeeCount: number = TestConfig.scale.attendees,
  sessionsPerEvent: number = TestConfig.scale.sessionsPerEvent,
  batchSize: number = TestConfig.scale.batchSize
): Promise<ScaleSeedResult> {
  const timer = new Timer();
  const memoryProfiler = new MemoryProfiler();
  const errors: string[] = [];
  const metrics: ScaleSeedResult['metrics'] = {
    attendeeSeedTime: 0,
    sessionSeedTime: 0,
    registrationSeedTime: 0,
    avgAttendeeInsertTime: 0,
    avgRegistrationInsertTime: 0,
    peakMemoryMB: 0,
  };

  console.log(`\n📊 Starting scale data seeding...`);
  console.log(`   - Attendees: ${attendeeCount.toLocaleString()}`);
  console.log(`   - Sessions: ${sessionsPerEvent}`);
  console.log(`   - Target registrations: ${(attendeeCount * TestConfig.scale.registrationsPerAttendee).toLocaleString()}`);
  console.log(`   - Batch size: ${batchSize}`);

  timer.start();
  memoryProfiler.startMonitoring(500);

  // Create test customer
  const customerId = generateId('cust_scale');
  const eventId = generateId('evt_scale');
  const templateId = generateId('tmpl_scale');

  try {
    // 1. Create customer
    console.log('\n1️⃣  Creating test customer...');
    await db.insert(customers).values({
      id: customerId,
      name: 'Scale Test Customer',
      contactEmail: 'scale-test@test.local',
      status: 'active',
    });

    // 2. Create badge template
    console.log('2️⃣  Creating badge template...');
    await db.insert(badgeTemplates).values({
      id: templateId,
      customerId: customerId,
      name: 'Scale Test Badge',
      participantType: 'General',
      backgroundColor: '#FFFFFF',
      textColor: '#000000',
      accentColor: '#3B82F6',
      width: 4,
      height: 3,
      includeQR: true,
      qrPosition: 'bottom-right',
      fontFamily: 'Arial',
      mergeFields: [],
      imageElements: [],
    });

    // 3. Create event
    console.log('3️⃣  Creating test event...');
    await db.insert(events).values({
      id: eventId,
      customerId: customerId,
      name: 'Scale Test Event',
      eventDate: new Date(),
      selectedTemplates: [templateId],
      status: 'active',
    });

    // 4. Create sessions
    console.log(`4️⃣  Creating ${sessionsPerEvent} sessions...`);
    const sessionTimer = new Timer();
    sessionTimer.start();
    
    const sessionIds: string[] = [];
    for (let i = 0; i < sessionsPerEvent; i++) {
      const sessionId = generateId(`sess_${i}`);
      sessionIds.push(sessionId);
      await db.insert(sessions).values({
        id: sessionId,
        eventId: eventId,
        name: `Session ${i + 1}`,
        description: `Test session ${i + 1} for scale testing`,
        capacity: Math.floor(attendeeCount / 2), // Each session can hold half the attendees
        restrictToRegistered: false,
        allowWaitlist: true,
        status: 'active',
      });
    }
    metrics.sessionSeedTime = sessionTimer.stop();
    console.log(`   ✓ Sessions created in ${formatDuration(metrics.sessionSeedTime)}`);

    // 5. Seed attendees in batches
    console.log(`5️⃣  Seeding ${attendeeCount.toLocaleString()} attendees in batches of ${batchSize}...`);
    const attendeeTimer = new Timer();
    attendeeTimer.start();
    
    const attendeeIds: string[] = [];
    const attendeeInsertTimes: number[] = [];
    let attendeesCreated = 0;

    for (let batch = 0; batch < Math.ceil(attendeeCount / batchSize); batch++) {
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, attendeeCount);
      const batchAttendees = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const attendeeId = generateId(`att_${i}`);
        attendeeIds.push(attendeeId);
        const { firstName, lastName } = generateName();
        
        batchAttendees.push({
          id: attendeeId,
          eventId: eventId,
          firstName,
          lastName,
          email: generateEmail(i),
          company: generateCompany(),
          title: 'Attendee',
          participantType: generateParticipantType(),
          registrationStatus: 'Registered' as const,
          checkedIn: false,
          badgePrinted: false,
        });
      }

      const batchTimer = new Timer();
      batchTimer.start();
      await db.insert(attendees).values(batchAttendees as any);
      attendeeInsertTimes.push(batchTimer.stop());
      
      attendeesCreated += batchAttendees.length;
      
      if ((batch + 1) % 5 === 0 || batchEnd === attendeeCount) {
        const progress = ((attendeesCreated / attendeeCount) * 100).toFixed(1);
        const memStats = memoryProfiler.getStats();
        console.log(`   Progress: ${progress}% (${attendeesCreated.toLocaleString()}/${attendeeCount.toLocaleString()}) - Heap: ${(memStats.peakHeapUsed / 1024 / 1024).toFixed(1)}MB`);
      }
    }
    
    metrics.attendeeSeedTime = attendeeTimer.stop();
    const attendeeStats = calculateStats(attendeeInsertTimes);
    metrics.avgAttendeeInsertTime = attendeeStats.avg;
    console.log(`   ✓ Attendees created in ${formatDuration(metrics.attendeeSeedTime)} (avg batch: ${formatDuration(attendeeStats.avg)})`);

    // 6. Create session registrations (20 per attendee)
    console.log(`6️⃣  Creating session registrations (${TestConfig.scale.registrationsPerAttendee} per attendee)...`);
    const registrationTimer = new Timer();
    registrationTimer.start();
    
    let registrationsCreated = 0;
    const registrationInsertTimes: number[] = [];
    const registrationBatchSize = 5000; // Larger batches for registrations

    for (let batch = 0; batch < Math.ceil(attendeeIds.length / (registrationBatchSize / TestConfig.scale.registrationsPerAttendee)); batch++) {
      const attendeeBatchStart = batch * Math.floor(registrationBatchSize / TestConfig.scale.registrationsPerAttendee);
      const attendeeBatchEnd = Math.min(attendeeBatchStart + Math.floor(registrationBatchSize / TestConfig.scale.registrationsPerAttendee), attendeeIds.length);
      const batchRegistrations = [];

      for (let i = attendeeBatchStart; i < attendeeBatchEnd; i++) {
        // Assign each attendee to 20 random sessions
        const shuffledSessions = [...sessionIds].sort(() => Math.random() - 0.5);
        const assignedSessions = shuffledSessions.slice(0, Math.min(TestConfig.scale.registrationsPerAttendee, sessionIds.length));
        
        for (const sessionId of assignedSessions) {
          batchRegistrations.push({
            id: generateId('reg'),
            sessionId: sessionId,
            attendeeId: attendeeIds[i],
            status: 'registered',
          });
        }
      }

      if (batchRegistrations.length > 0) {
        const batchTimer = new Timer();
        batchTimer.start();
        await db.insert(sessionRegistrations).values(batchRegistrations as any);
        registrationInsertTimes.push(batchTimer.stop());
        registrationsCreated += batchRegistrations.length;
        
        if ((batch + 1) % 10 === 0 || attendeeBatchEnd === attendeeIds.length) {
          const progress = ((attendeeBatchEnd / attendeeIds.length) * 100).toFixed(1);
          console.log(`   Progress: ${progress}% (${registrationsCreated.toLocaleString()} registrations)`);
        }
      }
    }
    
    metrics.registrationSeedTime = registrationTimer.stop();
    if (registrationInsertTimes.length > 0) {
      const regStats = calculateStats(registrationInsertTimes);
      metrics.avgRegistrationInsertTime = regStats.avg;
    }
    console.log(`   ✓ Registrations created in ${formatDuration(metrics.registrationSeedTime)}`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);
    console.error(`❌ Error during seeding: ${errorMsg}`);
  }

  memoryProfiler.stopMonitoring();
  const memStats = memoryProfiler.getStats();
  metrics.peakMemoryMB = memStats.peakHeapUsed / 1024 / 1024;
  
  const totalDuration = timer.stop();

  console.log(`\n✅ Scale data seeding complete!`);
  console.log(`   Total time: ${formatDuration(totalDuration)}`);
  console.log(`   Peak memory: ${metrics.peakMemoryMB.toFixed(1)}MB`);

  return {
    success: errors.length === 0,
    customerId,
    eventId,
    attendeeCount,
    sessionCount: sessionsPerEvent,
    registrationCount: attendeeCount * TestConfig.scale.registrationsPerAttendee,
    seedDuration: totalDuration,
    metrics,
    errors,
  };
}

export async function cleanupScaleData(customerId: string): Promise<void> {
  console.log(`\n🧹 Cleaning up scale test data for customer ${customerId}...`);
  const timer = new Timer();
  timer.start();

  try {
    // Delete customer (cascades to all related data)
    await db.delete(customers).where(eq(customers.id, customerId));
    console.log(`   ✓ Cleanup complete in ${formatDuration(timer.stop())}`);
  } catch (error) {
    console.error(`   ❌ Cleanup failed: ${error}`);
    throw error;
  }
}

export async function getScaleDataStats(eventId: string): Promise<{
  attendeeCount: number;
  sessionCount: number;
  registrationCount: number;
  checkedInCount: number;
  badgePrintedCount: number;
}> {
  const [attendeeResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendees)
    .where(eq(attendees.eventId, eventId));

  const [sessionResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessions)
    .where(eq(sessions.eventId, eventId));

  const [checkedInResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendees)
    .where(and(eq(attendees.eventId, eventId), eq(attendees.checkedIn, true)));

  const [badgePrintedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendees)
    .where(and(eq(attendees.eventId, eventId), eq(attendees.badgePrinted, true)));

  // Get registration count by joining
  const sessionIds = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.eventId, eventId));

  let registrationCount = 0;
  if (sessionIds.length > 0) {
    const [regResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionRegistrations)
      .where(sql`${sessionRegistrations.sessionId} IN (${sql.join(sessionIds.map(s => sql`${s.id}`), sql`, `)})`);
    registrationCount = regResult?.count || 0;
  }

  return {
    attendeeCount: attendeeResult?.count || 0,
    sessionCount: sessionResult?.count || 0,
    registrationCount,
    checkedInCount: checkedInResult?.count || 0,
    badgePrintedCount: badgePrintedResult?.count || 0,
  };
}

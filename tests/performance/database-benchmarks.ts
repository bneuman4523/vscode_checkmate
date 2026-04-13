/**
 * Database Performance Benchmarks
 * Tests query performance with large datasets
 */

import { db } from '../../server/db';
import { attendees, sessions, sessionRegistrations, sessionCheckins } from '../../shared/schema';
import { eq, sql, and, like, desc, asc } from 'drizzle-orm';
import { TestConfig, TestResult } from '../config';
import { Timer, formatDuration, calculateStats, calculatePercentile } from '../utils/timer';
import { generateId } from '../utils/id-generator';

export interface BenchmarkResult {
  name: string;
  operations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  throughput: number; // operations per second
  passed: boolean;
  threshold: number;
  recommendations: string[];
}

export async function benchmarkAttendeeQueries(eventId: string): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  console.log('\n📊 Running attendee query benchmarks...');

  // 1. Single attendee lookup by ID
  console.log('   Testing: Single attendee lookup by ID...');
  const attendeeList = await db.select({ id: attendees.id }).from(attendees).where(eq(attendees.eventId, eventId)).limit(100);
  const singleLookupTimes: number[] = [];
  
  for (const att of attendeeList.slice(0, 50)) {
    const { duration } = await Timer.measure(() => 
      db.select().from(attendees).where(eq(attendees.id, att.id))
    );
    singleLookupTimes.push(duration);
  }
  
  const singleStats = calculateStats(singleLookupTimes);
  results.push({
    name: 'Single Attendee Lookup by ID',
    operations: singleLookupTimes.length,
    totalTime: singleLookupTimes.reduce((a, b) => a + b, 0),
    avgTime: singleStats.avg,
    minTime: singleStats.min,
    maxTime: singleStats.max,
    p50: singleStats.p50,
    p95: singleStats.p95,
    p99: singleStats.p99,
    throughput: 1000 / singleStats.avg,
    passed: singleStats.p95 < TestConfig.thresholds.attendeeQuery,
    threshold: TestConfig.thresholds.attendeeQuery,
    recommendations: singleStats.p95 >= TestConfig.thresholds.attendeeQuery 
      ? ['Consider adding composite index on (id, event_id)', 'Enable query result caching']
      : [],
  });

  // 2. Attendee list with pagination
  console.log('   Testing: Paginated attendee list...');
  const paginatedTimes: number[] = [];
  
  for (let page = 0; page < 10; page++) {
    const { duration } = await Timer.measure(() => 
      db.select()
        .from(attendees)
        .where(eq(attendees.eventId, eventId))
        .orderBy(asc(attendees.lastName))
        .limit(50)
        .offset(page * 50)
    );
    paginatedTimes.push(duration);
  }
  
  const paginatedStats = calculateStats(paginatedTimes);
  results.push({
    name: 'Paginated Attendee List (50 per page)',
    operations: paginatedTimes.length,
    totalTime: paginatedTimes.reduce((a, b) => a + b, 0),
    avgTime: paginatedStats.avg,
    minTime: paginatedStats.min,
    maxTime: paginatedStats.max,
    p50: paginatedStats.p50,
    p95: paginatedStats.p95,
    p99: paginatedStats.p99,
    throughput: 1000 / paginatedStats.avg,
    passed: paginatedStats.p95 < TestConfig.thresholds.attendeeListQuery,
    threshold: TestConfig.thresholds.attendeeListQuery,
    recommendations: paginatedStats.p95 >= TestConfig.thresholds.attendeeListQuery
      ? ['Add index on lastName for sorting', 'Consider cursor-based pagination']
      : [],
  });

  // 3. Search by name (LIKE query)
  console.log('   Testing: Name search (LIKE query)...');
  const searchTerms = ['Smith', 'John', 'Alice', 'Bob', 'Test'];
  const searchTimes: number[] = [];
  
  for (const term of searchTerms) {
    const { duration } = await Timer.measure(() => 
      db.select()
        .from(attendees)
        .where(and(
          eq(attendees.eventId, eventId),
          sql`(${attendees.firstName} ILIKE ${'%' + term + '%'} OR ${attendees.lastName} ILIKE ${'%' + term + '%'})`
        ))
        .limit(50)
    );
    searchTimes.push(duration);
  }
  
  const searchStats = calculateStats(searchTimes);
  results.push({
    name: 'Name Search (ILIKE)',
    operations: searchTimes.length,
    totalTime: searchTimes.reduce((a, b) => a + b, 0),
    avgTime: searchStats.avg,
    minTime: searchStats.min,
    maxTime: searchStats.max,
    p50: searchStats.p50,
    p95: searchStats.p95,
    p99: searchStats.p99,
    throughput: 1000 / searchStats.avg,
    passed: searchStats.p95 < 500, // 500ms threshold for search
    threshold: 500,
    recommendations: searchStats.p95 >= 500
      ? ['Add trigram index (pg_trgm) for ILIKE searches', 'Consider full-text search with GIN index']
      : [],
  });

  // 4. Count queries
  console.log('   Testing: Aggregate count queries...');
  const countTimes: number[] = [];
  
  for (let i = 0; i < 10; i++) {
    const { duration } = await Timer.measure(() => 
      db.select({ count: sql<number>`count(*)::int` })
        .from(attendees)
        .where(eq(attendees.eventId, eventId))
    );
    countTimes.push(duration);
  }
  
  const countStats = calculateStats(countTimes);
  results.push({
    name: 'Attendee Count Query',
    operations: countTimes.length,
    totalTime: countTimes.reduce((a, b) => a + b, 0),
    avgTime: countStats.avg,
    minTime: countStats.min,
    maxTime: countStats.max,
    p50: countStats.p50,
    p95: countStats.p95,
    p99: countStats.p99,
    throughput: 1000 / countStats.avg,
    passed: countStats.p95 < 100,
    threshold: 100,
    recommendations: countStats.p95 >= 100
      ? ['Consider maintaining count in a separate stats table', 'Use approximate count for large tables']
      : [],
  });

  return results;
}

export async function benchmarkCheckInOperations(eventId: string): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  console.log('\n📊 Running check-in operation benchmarks...');

  // Get unchecked-in attendees
  const uncheckedAttendees = await db.select({ id: attendees.id })
    .from(attendees)
    .where(and(eq(attendees.eventId, eventId), eq(attendees.checkedIn, false)))
    .limit(100);

  if (uncheckedAttendees.length === 0) {
    console.log('   ⚠️  No unchecked-in attendees found for testing');
    return results;
  }

  // 1. Single check-in operation
  console.log('   Testing: Single check-in operations...');
  const checkInTimes: number[] = [];
  
  for (const att of uncheckedAttendees.slice(0, 50)) {
    const { duration } = await Timer.measure(async () => {
      await db.update(attendees)
        .set({ 
          checkedIn: true, 
          checkedInAt: new Date(),
          registrationStatus: 'Attended'
        })
        .where(eq(attendees.id, att.id));
    });
    checkInTimes.push(duration);
  }
  
  const checkInStats = calculateStats(checkInTimes);
  results.push({
    name: 'Single Check-In Operation',
    operations: checkInTimes.length,
    totalTime: checkInTimes.reduce((a, b) => a + b, 0),
    avgTime: checkInStats.avg,
    minTime: checkInStats.min,
    maxTime: checkInStats.max,
    p50: checkInStats.p50,
    p95: checkInStats.p95,
    p99: checkInStats.p99,
    throughput: 1000 / checkInStats.avg,
    passed: checkInStats.p95 < TestConfig.thresholds.singleCheckIn,
    threshold: TestConfig.thresholds.singleCheckIn,
    recommendations: checkInStats.p95 >= TestConfig.thresholds.singleCheckIn
      ? ['Optimize UPDATE query', 'Consider batch updates', 'Check for lock contention']
      : [],
  });

  // 2. Concurrent check-in simulation
  console.log('   Testing: Concurrent check-in simulation...');
  const remainingUnchecked = await db.select({ id: attendees.id })
    .from(attendees)
    .where(and(eq(attendees.eventId, eventId), eq(attendees.checkedIn, false)))
    .limit(TestConfig.scale.concurrentOperations);

  if (remainingUnchecked.length > 0) {
    const concurrentTimer = new Timer();
    concurrentTimer.start();
    
    await Promise.all(remainingUnchecked.map(att => 
      db.update(attendees)
        .set({ 
          checkedIn: true, 
          checkedInAt: new Date(),
          registrationStatus: 'Attended'
        })
        .where(eq(attendees.id, att.id))
    ));
    
    const concurrentDuration = concurrentTimer.stop();
    
    results.push({
      name: `Concurrent Check-Ins (${remainingUnchecked.length} simultaneous)`,
      operations: remainingUnchecked.length,
      totalTime: concurrentDuration,
      avgTime: concurrentDuration / remainingUnchecked.length,
      minTime: concurrentDuration / remainingUnchecked.length,
      maxTime: concurrentDuration,
      p50: concurrentDuration / remainingUnchecked.length,
      p95: concurrentDuration,
      p99: concurrentDuration,
      throughput: (remainingUnchecked.length / concurrentDuration) * 1000,
      passed: concurrentDuration < TestConfig.thresholds.batchCheckIn,
      threshold: TestConfig.thresholds.batchCheckIn,
      recommendations: concurrentDuration >= TestConfig.thresholds.batchCheckIn
        ? ['Increase connection pool size', 'Consider queue-based processing', 'Add database read replicas']
        : [],
    });
  }

  return results;
}

export async function benchmarkSessionOperations(eventId: string): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  console.log('\n📊 Running session operation benchmarks...');

  // Get sessions for this event
  const eventSessions = await db.select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.eventId, eventId));

  if (eventSessions.length === 0) {
    console.log('   ⚠️  No sessions found for testing');
    return results;
  }

  // 1. Session lookup
  console.log('   Testing: Session lookup...');
  const sessionLookupTimes: number[] = [];
  
  for (const sess of eventSessions.slice(0, 20)) {
    const { duration } = await Timer.measure(() => 
      db.select().from(sessions).where(eq(sessions.id, sess.id))
    );
    sessionLookupTimes.push(duration);
  }
  
  const sessionStats = calculateStats(sessionLookupTimes);
  results.push({
    name: 'Session Lookup by ID',
    operations: sessionLookupTimes.length,
    totalTime: sessionLookupTimes.reduce((a, b) => a + b, 0),
    avgTime: sessionStats.avg,
    minTime: sessionStats.min,
    maxTime: sessionStats.max,
    p50: sessionStats.p50,
    p95: sessionStats.p95,
    p99: sessionStats.p99,
    throughput: 1000 / sessionStats.avg,
    passed: sessionStats.p95 < TestConfig.thresholds.sessionQuery,
    threshold: TestConfig.thresholds.sessionQuery,
    recommendations: [],
  });

  // 2. Session registration count
  console.log('   Testing: Session registration count queries...');
  const regCountTimes: number[] = [];
  
  for (const sess of eventSessions.slice(0, 10)) {
    const { duration } = await Timer.measure(() => 
      db.select({ count: sql<number>`count(*)::int` })
        .from(sessionRegistrations)
        .where(eq(sessionRegistrations.sessionId, sess.id))
    );
    regCountTimes.push(duration);
  }
  
  const regCountStats = calculateStats(regCountTimes);
  const regCountThreshold = TestConfig.thresholds.sessionRegistrationCount ?? 150;
  results.push({
    name: 'Session Registration Count',
    operations: regCountTimes.length,
    totalTime: regCountTimes.reduce((a, b) => a + b, 0),
    avgTime: regCountStats.avg,
    minTime: regCountStats.min,
    maxTime: regCountStats.max,
    p50: regCountStats.p50,
    p95: regCountStats.p95,
    p99: regCountStats.p99,
    throughput: 1000 / regCountStats.avg,
    passed: regCountStats.p95 < regCountThreshold,
    threshold: regCountThreshold,
    recommendations: regCountStats.p95 >= regCountThreshold
      ? ['Add index on sessionId for registrations', 'Consider denormalized count field']
      : [],
  });

  // 3. Session check-in operation
  console.log('   Testing: Session check-in operations...');
  const sessionCheckInTimes: number[] = [];
  
  // Get some attendees registered for sessions
  const sampleSession = eventSessions[0];
  const registeredAttendees = await db.select({ attendeeId: sessionRegistrations.attendeeId })
    .from(sessionRegistrations)
    .where(eq(sessionRegistrations.sessionId, sampleSession.id))
    .limit(20);

  for (const reg of registeredAttendees) {
    const { duration } = await Timer.measure(async () => {
      await db.insert(sessionCheckins).values({
        id: generateId('checkin'),
        sessionId: sampleSession.id,
        attendeeId: reg.attendeeId,
        action: 'check_in',
        source: 'test',
      });
    });
    sessionCheckInTimes.push(duration);
  }
  
  if (sessionCheckInTimes.length > 0) {
    const sessCheckInStats = calculateStats(sessionCheckInTimes);
    results.push({
      name: 'Session Check-In Insert',
      operations: sessionCheckInTimes.length,
      totalTime: sessionCheckInTimes.reduce((a, b) => a + b, 0),
      avgTime: sessCheckInStats.avg,
      minTime: sessCheckInStats.min,
      maxTime: sessCheckInStats.max,
      p50: sessCheckInStats.p50,
      p95: sessCheckInStats.p95,
      p99: sessCheckInStats.p99,
      throughput: 1000 / sessCheckInStats.avg,
      passed: sessCheckInStats.p95 < TestConfig.thresholds.singleCheckIn,
      threshold: TestConfig.thresholds.singleCheckIn,
      recommendations: [],
    });
  }

  return results;
}

export function printBenchmarkResults(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(80));

  for (const result of results) {
    const statusIcon = result.passed ? '✅' : '❌';
    console.log(`\n${statusIcon} ${result.name}`);
    console.log(`   Operations: ${result.operations}`);
    console.log(`   Avg: ${formatDuration(result.avgTime)} | P50: ${formatDuration(result.p50)} | P95: ${formatDuration(result.p95)} | P99: ${formatDuration(result.p99)}`);
    console.log(`   Throughput: ${result.throughput.toFixed(1)} ops/sec`);
    console.log(`   Threshold: ${formatDuration(result.threshold)} (P95)`);
    
    if (result.recommendations.length > 0) {
      console.log(`   Recommendations:`);
      for (const rec of result.recommendations) {
        console.log(`      - ${rec}`);
      }
    }
  }
}

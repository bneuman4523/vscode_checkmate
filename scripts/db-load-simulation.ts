/**
 * Database Load Simulation
 * 
 * Tests the database performance for check-in operations directly.
 * This bypasses HTTP overhead to measure pure database throughput.
 * 
 * Scenario: 10 scanners checking in 1000 people in 30 minutes
 */

import { db } from '../server/db';
import { attendees } from '../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

interface SimulationResult {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  p95TimeMs: number;
  operationsPerSecond: number;
  durationSeconds: number;
  errors: string[];
}

function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

async function simulateCheckin(attendeeId: string): Promise<{ success: boolean; timeMs: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    await db.update(attendees)
      .set({ 
        checkedIn: true, 
        checkedInAt: new Date() 
      })
      .where(eq(attendees.id, attendeeId));
    
    return { success: true, timeMs: Date.now() - startTime };
  } catch (error) {
    return { 
      success: false, 
      timeMs: Date.now() - startTime, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function simulateRevert(attendeeId: string): Promise<{ success: boolean; timeMs: number }> {
  const startTime = Date.now();
  
  try {
    await db.update(attendees)
      .set({ 
        checkedIn: false, 
        checkedInAt: null 
      })
      .where(eq(attendees.id, attendeeId));
    
    return { success: true, timeMs: Date.now() - startTime };
  } catch (error) {
    return { success: false, timeMs: Date.now() - startTime };
  }
}

async function runConcurrentSimulation(
  attendeeIds: string[],
  concurrency: number,
  description: string
): Promise<SimulationResult> {
  console.log(`\n🚀 ${description}`);
  console.log(`   ${attendeeIds.length} operations with ${concurrency} concurrent`);
  
  const times: number[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failCount = 0;
  
  const startTime = Date.now();
  
  // Process in batches
  for (let i = 0; i < attendeeIds.length; i += concurrency) {
    const batch = attendeeIds.slice(i, i + concurrency);
    const batchPromises = batch.map(id => simulateCheckin(id));
    const results = await Promise.all(batchPromises);
    
    for (const result of results) {
      times.push(result.timeMs);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
        if (result.error && errors.length < 10) {
          errors.push(result.error);
        }
      }
    }
    
    // Progress
    if ((i + concurrency) % 100 === 0 || i + concurrency >= attendeeIds.length) {
      console.log(`   Progress: ${Math.min(i + concurrency, attendeeIds.length)}/${attendeeIds.length}`);
    }
  }
  
  const durationSeconds = (Date.now() - startTime) / 1000;
  const sortedTimes = [...times].sort((a, b) => a - b);
  
  return {
    totalOperations: attendeeIds.length,
    successfulOperations: successCount,
    failedOperations: failCount,
    avgTimeMs: times.reduce((a, b) => a + b, 0) / times.length,
    minTimeMs: Math.min(...times),
    maxTimeMs: Math.max(...times),
    p95TimeMs: calculatePercentile(sortedTimes, 95),
    operationsPerSecond: attendeeIds.length / durationSeconds,
    durationSeconds,
    errors,
  };
}

async function revertAll(attendeeIds: string[]): Promise<void> {
  console.log(`\n🔄 Reverting ${attendeeIds.length} check-ins...`);
  
  const batchSize = 50;
  for (let i = 0; i < attendeeIds.length; i += batchSize) {
    const batch = attendeeIds.slice(i, i + batchSize);
    await Promise.all(batch.map(id => simulateRevert(id)));
  }
  
  console.log(`   ✅ Reverted all`);
}

function printResults(result: SimulationResult, title: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ${title}`);
  console.log('='.repeat(60));
  console.log(`Total Operations:    ${result.totalOperations}`);
  console.log(`Successful:          ${result.successfulOperations} (${((result.successfulOperations / result.totalOperations) * 100).toFixed(1)}%)`);
  console.log(`Failed:              ${result.failedOperations}`);
  console.log(`Duration:            ${result.durationSeconds.toFixed(2)} seconds`);
  console.log(`Operations/Second:   ${result.operationsPerSecond.toFixed(2)}`);
  console.log(`\nDatabase Response Times:`);
  console.log(`  Average:           ${result.avgTimeMs.toFixed(1)}ms`);
  console.log(`  Minimum:           ${result.minTimeMs.toFixed(1)}ms`);
  console.log(`  Maximum:           ${result.maxTimeMs.toFixed(1)}ms`);
  console.log(`  95th Percentile:   ${result.p95TimeMs.toFixed(1)}ms`);
  
  if (result.errors.length > 0) {
    console.log(`\n⚠️  Errors:`);
    result.errors.forEach(e => console.log(`  - ${e}`));
  }
  console.log('='.repeat(60));
}

async function main() {
  console.log('🏁 CheckinKit Database Load Simulation');
  console.log('======================================\n');
  
  const testEventId = 'evt-678c95a4'; // Hawthorne Future of Data Conference
  
  // Get unchecked attendees
  console.log('📥 Fetching test attendees...');
  const testAttendees = await db.select({ id: attendees.id })
    .from(attendees)
    .where(and(
      eq(attendees.eventId, testEventId),
      eq(attendees.checkedIn, false)
    ))
    .limit(500);
  
  console.log(`   Found ${testAttendees.length} unchecked attendees`);
  
  if (testAttendees.length < 100) {
    console.log('\n⚠️  Need at least 100 unchecked attendees. Exiting.');
    process.exit(1);
  }
  
  const attendeeIds = testAttendees.map(a => a.id);
  
  // Test 1: 100 check-ins with 10 concurrent (warmup)
  const warmupIds = attendeeIds.slice(0, 100);
  const warmupResult = await runConcurrentSimulation(warmupIds, 10, 'Warmup: 100 check-ins, 10 concurrent');
  printResults(warmupResult, 'WARMUP RESULTS');
  await revertAll(warmupIds);
  
  // Test 2: 200 check-ins with 10 concurrent (realistic burst)
  const burstIds = attendeeIds.slice(0, 200);
  const burstResult = await runConcurrentSimulation(burstIds, 10, 'Burst Test: 200 check-ins, 10 concurrent');
  printResults(burstResult, 'BURST TEST RESULTS (10 Scanners)');
  await revertAll(burstIds);
  
  // Test 3: 200 check-ins with 20 concurrent (stress test)
  const stressIds = attendeeIds.slice(0, 200);
  const stressResult = await runConcurrentSimulation(stressIds, 20, 'Stress Test: 200 check-ins, 20 concurrent');
  printResults(stressResult, 'STRESS TEST RESULTS (20 Scanners)');
  await revertAll(stressIds);
  
  // Analysis
  console.log('\n' + '='.repeat(60));
  console.log('📋 CAPACITY ANALYSIS');
  console.log('='.repeat(60));
  
  const targetCheckins = 1000;
  const targetMinutes = 30;
  const targetRPS = targetCheckins / (targetMinutes * 60);
  
  console.log(`\n🎯 TARGET SCENARIO:`);
  console.log(`   ${targetCheckins} check-ins in ${targetMinutes} minutes`);
  console.log(`   10 concurrent scanners`);
  console.log(`   Required: ${targetRPS.toFixed(2)} check-ins/second`);
  
  console.log(`\n📊 MEASURED CAPACITY (Database Layer):`);
  console.log(`   Burst throughput: ${burstResult.operationsPerSecond.toFixed(1)} ops/sec`);
  console.log(`   P95 latency: ${burstResult.p95TimeMs.toFixed(1)}ms`);
  
  const headroom = burstResult.operationsPerSecond / targetRPS;
  console.log(`\n✅ HEADROOM: ${headroom.toFixed(1)}x the required capacity`);
  
  if (headroom >= 10) {
    console.log(`\n🟢 ASSESSMENT: System easily handles target load.`);
    console.log(`   The database can process ${burstResult.operationsPerSecond.toFixed(0)} check-ins/second.`);
    console.log(`   Target only requires ${targetRPS.toFixed(2)}/second.`);
    console.log(`   You have significant headroom for spikes.`);
  } else if (headroom >= 3) {
    console.log(`\n🟡 ASSESSMENT: System handles target with moderate headroom.`);
  } else {
    console.log(`\n🔴 ASSESSMENT: System may struggle under peak load.`);
  }
  
  // HTTP overhead estimate
  console.log(`\n📡 FULL STACK ESTIMATE (including HTTP):`);
  const httpOverheadMs = 30; // Estimated HTTP overhead
  const fullStackLatency = burstResult.avgTimeMs + httpOverheadMs;
  const fullStackRPS = 10 / (fullStackLatency / 1000); // 10 concurrent / latency
  console.log(`   Estimated full-stack latency: ~${fullStackLatency.toFixed(0)}ms per check-in`);
  console.log(`   Estimated throughput: ~${fullStackRPS.toFixed(1)} check-ins/second`);
  console.log(`   Time to check in 1000: ~${(1000 / fullStackRPS / 60).toFixed(1)} minutes`);
  
  console.log('\n' + '='.repeat(60));
  
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Simulation failed:', err);
  process.exit(1);
});

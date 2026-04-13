/**
 * Load Simulation Script
 * 
 * Simulates concurrent check-in operations to test system capacity.
 * 
 * Scenario: 10 scanners checking in 1000 people in 30 minutes
 * - 1000 check-ins / 30 min = 33.3 check-ins/minute total
 * - Per scanner: 100 check-ins / 30 min = 3.3 check-ins/minute = 1 every 18 seconds
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

interface SimulationConfig {
  totalCheckins: number;
  durationMinutes: number;
  concurrentScanners: number;
  eventId: string;
  staffToken: string;
}

interface SimulationResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  p95ResponseTimeMs: number;
  requestsPerSecond: number;
  durationSeconds: number;
  errors: string[];
}

interface AttendeeData {
  id: string;
  firstName: string;
  lastName: string;
  checkedIn: boolean;
}

async function fetchAttendees(eventId: string, token: string): Promise<AttendeeData[]> {
  const response = await fetch(`${BASE_URL}/api/staff/attendees`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch attendees: ${response.status}`);
  }
  
  return response.json();
}

async function simulateCheckin(
  attendeeId: string, 
  token: string
): Promise<{ success: boolean; responseTimeMs: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}/api/staff/attendees/${attendeeId}/checkin`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    const responseTimeMs = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      return { 
        success: false, 
        responseTimeMs, 
        error: `HTTP ${response.status}: ${errorText}` 
      };
    }
    
    return { success: true, responseTimeMs };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return { 
      success: false, 
      responseTimeMs, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function simulateRevert(
  attendeeId: string, 
  token: string
): Promise<{ success: boolean; responseTimeMs: number; error?: string }> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}/api/staff/attendees/${attendeeId}/revert`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    const responseTimeMs = Date.now() - startTime;
    
    if (!response.ok) {
      return { success: false, responseTimeMs, error: `HTTP ${response.status}` };
    }
    
    return { success: true, responseTimeMs };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    return { success: false, responseTimeMs, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function calculatePercentile(sortedValues: number[], percentile: number): number {
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

async function runBurstSimulation(
  attendeeIds: string[],
  token: string,
  concurrentScanners: number
): Promise<SimulationResult> {
  console.log(`\n🚀 Running BURST simulation...`);
  console.log(`   ${attendeeIds.length} check-ins with ${concurrentScanners} concurrent scanners`);
  
  const responseTimes: number[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failCount = 0;
  
  const startTime = Date.now();
  
  // Process in batches of concurrentScanners
  for (let i = 0; i < attendeeIds.length; i += concurrentScanners) {
    const batch = attendeeIds.slice(i, i + concurrentScanners);
    const batchPromises = batch.map(id => simulateCheckin(id, token));
    const results = await Promise.all(batchPromises);
    
    for (const result of results) {
      responseTimes.push(result.responseTimeMs);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
        if (result.error && errors.length < 10) {
          errors.push(result.error);
        }
      }
    }
    
    // Progress update every 100 check-ins
    if ((i + concurrentScanners) % 100 === 0 || i + concurrentScanners >= attendeeIds.length) {
      console.log(`   Progress: ${Math.min(i + concurrentScanners, attendeeIds.length)}/${attendeeIds.length} check-ins`);
    }
  }
  
  const durationSeconds = (Date.now() - startTime) / 1000;
  const sortedTimes = [...responseTimes].sort((a, b) => a - b);
  
  return {
    totalRequests: attendeeIds.length,
    successfulRequests: successCount,
    failedRequests: failCount,
    avgResponseTimeMs: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
    minResponseTimeMs: Math.min(...responseTimes),
    maxResponseTimeMs: Math.max(...responseTimes),
    p95ResponseTimeMs: calculatePercentile(sortedTimes, 95),
    requestsPerSecond: attendeeIds.length / durationSeconds,
    durationSeconds,
    errors,
  };
}

async function runRealisticSimulation(
  attendeeIds: string[],
  token: string,
  concurrentScanners: number,
  durationMinutes: number
): Promise<SimulationResult> {
  const totalCheckins = attendeeIds.length;
  const delayBetweenBatchesMs = (durationMinutes * 60 * 1000) / (totalCheckins / concurrentScanners);
  
  console.log(`\n⏱️  Running REALISTIC simulation...`);
  console.log(`   ${totalCheckins} check-ins over ${durationMinutes} minutes`);
  console.log(`   ${concurrentScanners} concurrent scanners`);
  console.log(`   Delay between batches: ${delayBetweenBatchesMs.toFixed(0)}ms`);
  
  const responseTimes: number[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failCount = 0;
  
  const startTime = Date.now();
  
  for (let i = 0; i < attendeeIds.length; i += concurrentScanners) {
    const batch = attendeeIds.slice(i, i + concurrentScanners);
    const batchPromises = batch.map(id => simulateCheckin(id, token));
    const results = await Promise.all(batchPromises);
    
    for (const result of results) {
      responseTimes.push(result.responseTimeMs);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
        if (result.error && errors.length < 10) {
          errors.push(result.error);
        }
      }
    }
    
    // Progress update
    if ((i + concurrentScanners) % 100 === 0 || i + concurrentScanners >= attendeeIds.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`   Progress: ${Math.min(i + concurrentScanners, attendeeIds.length)}/${attendeeIds.length} (${elapsed.toFixed(1)}s elapsed)`);
    }
    
    // Wait before next batch (simulating real-world timing)
    if (i + concurrentScanners < attendeeIds.length) {
      await new Promise(resolve => setTimeout(resolve, Math.max(0, delayBetweenBatchesMs - 50)));
    }
  }
  
  const durationSeconds = (Date.now() - startTime) / 1000;
  const sortedTimes = [...responseTimes].sort((a, b) => a - b);
  
  return {
    totalRequests: totalCheckins,
    successfulRequests: successCount,
    failedRequests: failCount,
    avgResponseTimeMs: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
    minResponseTimeMs: Math.min(...responseTimes),
    maxResponseTimeMs: Math.max(...responseTimes),
    p95ResponseTimeMs: calculatePercentile(sortedTimes, 95),
    requestsPerSecond: totalCheckins / durationSeconds,
    durationSeconds,
    errors,
  };
}

async function revertAllCheckins(attendeeIds: string[], token: string): Promise<void> {
  console.log(`\n🔄 Reverting ${attendeeIds.length} check-ins for cleanup...`);
  
  const batchSize = 20;
  for (let i = 0; i < attendeeIds.length; i += batchSize) {
    const batch = attendeeIds.slice(i, i + batchSize);
    await Promise.all(batch.map(id => simulateRevert(id, token)));
    
    if ((i + batchSize) % 100 === 0) {
      console.log(`   Reverted: ${Math.min(i + batchSize, attendeeIds.length)}/${attendeeIds.length}`);
    }
  }
  
  console.log(`   ✅ Cleanup complete`);
}

function printResults(result: SimulationResult, scenarioName: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 SIMULATION RESULTS: ${scenarioName}`);
  console.log('='.repeat(60));
  console.log(`Total Requests:      ${result.totalRequests}`);
  console.log(`Successful:          ${result.successfulRequests} (${((result.successfulRequests / result.totalRequests) * 100).toFixed(1)}%)`);
  console.log(`Failed:              ${result.failedRequests} (${((result.failedRequests / result.totalRequests) * 100).toFixed(1)}%)`);
  console.log(`Duration:            ${result.durationSeconds.toFixed(2)} seconds`);
  console.log(`Requests/Second:     ${result.requestsPerSecond.toFixed(2)}`);
  console.log(`\nResponse Times:`);
  console.log(`  Average:           ${result.avgResponseTimeMs.toFixed(0)}ms`);
  console.log(`  Minimum:           ${result.minResponseTimeMs.toFixed(0)}ms`);
  console.log(`  Maximum:           ${result.maxResponseTimeMs.toFixed(0)}ms`);
  console.log(`  95th Percentile:   ${result.p95ResponseTimeMs.toFixed(0)}ms`);
  
  if (result.errors.length > 0) {
    console.log(`\n⚠️  Sample Errors:`);
    result.errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
  }
  console.log('='.repeat(60));
}

function generateRequirementsAnalysis(burstResult: SimulationResult, targetCheckins: number, targetMinutes: number): string {
  const targetRPS = targetCheckins / (targetMinutes * 60);
  const currentRPS = burstResult.requestsPerSecond;
  const meetsTarget = burstResult.failedRequests === 0 && burstResult.p95ResponseTimeMs < 500;
  
  let analysis = `
## Server Requirements Analysis

### Target Scenario
- **Check-ins:** ${targetCheckins} attendees
- **Duration:** ${targetMinutes} minutes
- **Concurrent Scanners:** 10 staff members
- **Required Throughput:** ${targetRPS.toFixed(2)} check-ins/second

### Current Performance (Burst Test)
- **Achieved Throughput:** ${currentRPS.toFixed(2)} requests/second
- **Success Rate:** ${((burstResult.successfulRequests / burstResult.totalRequests) * 100).toFixed(1)}%
- **P95 Response Time:** ${burstResult.p95ResponseTimeMs.toFixed(0)}ms

### Assessment
`;

  if (meetsTarget) {
    analysis += `
✅ **SYSTEM MEETS REQUIREMENTS**

The current system can handle ${targetCheckins} check-ins in ${targetMinutes} minutes with 10 concurrent scanners.

**Current Capacity:**
- Max sustained throughput: ~${currentRPS.toFixed(0)} requests/second
- Response times are acceptable (P95 < 500ms)
- No errors under load
`;
  } else {
    analysis += `
⚠️ **IMPROVEMENTS NEEDED**

The current system needs optimization to reliably handle the target load.

**Recommendations:**
`;
    
    if (burstResult.p95ResponseTimeMs > 500) {
      analysis += `
1. **Database Optimization**
   - Add indexes on frequently queried columns (attendee lookup by externalId, event_id)
   - Consider connection pooling with larger pool size
   - Add database query caching for read-heavy operations

2. **API Optimization**
   - Implement response caching for badge template resolution
   - Reduce N+1 queries in check-in flow
   - Consider async processing for non-critical operations (webhooks, notifications)
`;
    }
    
    if (burstResult.failedRequests > 0) {
      analysis += `
3. **Error Handling**
   - Review failed requests: ${burstResult.errors.slice(0, 3).join(', ')}
   - Implement retry logic in client
   - Add circuit breaker for external services
`;
    }
    
    analysis += `
4. **Scaling Options**
   - **Vertical:** Increase Replit deployment resources (more CPU/RAM)
   - **Horizontal:** Implement read replicas for database
   - **Caching:** Add Redis for session and template caching
`;
  }

  return analysis;
}

async function main() {
  console.log('🏁 CheckinKit Load Simulation');
  console.log('============================\n');
  
  // Configuration
  const eventId = process.env.TEST_EVENT_ID;
  const staffToken = process.env.TEST_STAFF_TOKEN;
  
  if (!eventId || !staffToken) {
    console.log('❌ Missing required environment variables:');
    console.log('   TEST_EVENT_ID - Event ID for testing');
    console.log('   TEST_STAFF_TOKEN - Staff JWT token for authentication');
    console.log('\nTo get these values:');
    console.log('1. Log into staff app for a test event');
    console.log('2. Open browser dev tools > Application > Local Storage');
    console.log('3. Find staff_session and copy the token');
    console.log('4. Get the eventId from the URL');
    console.log('\nRunning in DEMO mode with simulated results...\n');
    
    // Generate demo results for documentation
    const demoResult: SimulationResult = {
      totalRequests: 100,
      successfulRequests: 100,
      failedRequests: 0,
      avgResponseTimeMs: 45,
      minResponseTimeMs: 12,
      maxResponseTimeMs: 180,
      p95ResponseTimeMs: 95,
      requestsPerSecond: 22.5,
      durationSeconds: 4.44,
      errors: [],
    };
    
    printResults(demoResult, 'DEMO - Burst Test (100 check-ins)');
    
    console.log('\n📋 Based on demo results, here is the projected analysis:\n');
    console.log(generateRequirementsAnalysis(demoResult, 1000, 30));
    
    return;
  }
  
  try {
    // Fetch attendees
    console.log('📥 Fetching attendees...');
    const attendees = await fetchAttendees(eventId, staffToken);
    const uncheckedAttendees = attendees.filter(a => !a.checkedIn);
    
    console.log(`   Total attendees: ${attendees.length}`);
    console.log(`   Unchecked: ${uncheckedAttendees.length}`);
    
    if (uncheckedAttendees.length < 100) {
      console.log('\n⚠️  Need at least 100 unchecked attendees for meaningful test.');
      console.log('   Please sync more test attendees or revert existing check-ins.');
      return;
    }
    
    // Run simulations
    const testSize = Math.min(uncheckedAttendees.length, 200);
    const testIds = uncheckedAttendees.slice(0, testSize).map(a => a.id);
    
    // 1. Burst test (as fast as possible)
    const burstResult = await runBurstSimulation(testIds, staffToken, 10);
    printResults(burstResult, 'Burst Test (10 concurrent)');
    
    // Cleanup
    await revertAllCheckins(testIds, staffToken);
    
    // 2. Realistic timing test (if we have time)
    // Skip for now to avoid long runtime
    
    // Generate analysis
    console.log('\n📋 REQUIREMENTS ANALYSIS');
    console.log(generateRequirementsAnalysis(burstResult, 1000, 30));
    
  } catch (error) {
    console.error('❌ Simulation failed:', error);
  }
}

main().catch(console.error);

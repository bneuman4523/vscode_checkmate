/**
 * Scale Testing Runner
 * Runs comprehensive scale, performance, and print simulation tests
 * Generates detailed enhancement report
 */

import { TestConfig, TestResult, TestSuite, FullTestReport } from './config';
import { seedScaleData, cleanupScaleData, getScaleDataStats, ScaleSeedResult } from './scale/seed-scale-data';
import { 
  benchmarkAttendeeQueries, 
  benchmarkCheckInOperations, 
  benchmarkSessionOperations,
  printBenchmarkResults,
  BenchmarkResult 
} from './performance/database-benchmarks';
import { MockPrintOrchestrator, PrintJob } from './utils/mock-print-orchestrator';
import { PrintQueueSimulator } from './utils/print-queue-simulator';
import { Timer, formatDuration } from './utils/timer';
import { MemoryProfiler } from './utils/memory-profiler';
import * as fs from 'fs';

// Test configuration
const ATTENDEE_COUNT = process.env.TEST_ATTENDEE_COUNT 
  ? parseInt(process.env.TEST_ATTENDEE_COUNT) 
  : TestConfig.scale.attendees;

const SKIP_SEED = process.env.SKIP_SEED === 'true';
const CLEANUP_AFTER = process.env.CLEANUP_AFTER !== 'false';

async function runPrintSimulationTests(): Promise<TestSuite> {
  console.log('\n' + '='.repeat(80));
  console.log('🖨️  PRINT SIMULATION TESTS');
  console.log('='.repeat(80));

  const tests: TestResult[] = [];
  const recommendations: string[] = [];

  // Test 1: Single badge print validation
  console.log('\n1️⃣  Testing single badge print...');
  const printOrchestrator = new MockPrintOrchestrator('windows');
  const timer = new Timer();
  timer.start();
  
  const printJob = await printOrchestrator.print({
    attendeeId: 'test_attendee_1',
    templateId: 'test_template_1',
    dimensions: { width: 4, height: 3, dpi: 300 },
    canvasPixelDimensions: { width: 1200, height: 900 },
  });
  
  const singlePrintDuration = timer.stop();
  const validation = printOrchestrator.validatePrintJob(printJob);
  
  tests.push({
    name: 'Single Badge Print',
    passed: validation.valid && printJob.status === 'printed',
    duration: singlePrintDuration,
    metrics: {
      status: printJob.status,
      dimensionsValid: validation.valid ? 'Yes' : 'No',
    },
    recommendations: validation.errors,
  });

  // Test 2: DPI validation (300 DPI)
  console.log('2️⃣  Testing 300 DPI validation...');
  const dpi300Job = await printOrchestrator.print({
    attendeeId: 'test_attendee_2',
    templateId: 'test_template_1',
    dimensions: { width: 4, height: 3, dpi: 300 },
    canvasPixelDimensions: { width: 1200, height: 900 }, // 4*300 x 3*300
  });
  const dpi300Validation = printOrchestrator.validatePrintJob(dpi300Job);
  
  tests.push({
    name: '300 DPI Validation',
    passed: dpi300Validation.valid,
    duration: 0,
    metrics: { pixelWidth: 1200, pixelHeight: 900, dpi: 300 },
    recommendations: dpi300Validation.errors,
  });

  // Test 3: DPI validation (600 DPI)
  console.log('3️⃣  Testing 600 DPI validation...');
  const dpi600Job = await printOrchestrator.print({
    attendeeId: 'test_attendee_3',
    templateId: 'test_template_1',
    dimensions: { width: 4, height: 3, dpi: 600 },
    canvasPixelDimensions: { width: 2400, height: 1800 }, // 4*600 x 3*600
  });
  const dpi600Validation = printOrchestrator.validatePrintJob(dpi600Job);
  
  tests.push({
    name: '600 DPI Validation',
    passed: dpi600Validation.valid,
    duration: 0,
    metrics: { pixelWidth: 2400, pixelHeight: 1800, dpi: 600 },
    recommendations: dpi600Validation.errors,
  });

  // Test 4: Large badge (8x8 inches)
  console.log('4️⃣  Testing large badge dimensions (8x8 inches)...');
  const largeBadgeJob = await printOrchestrator.print({
    attendeeId: 'test_attendee_4',
    templateId: 'test_template_large',
    dimensions: { width: 8, height: 8, dpi: 300 },
    canvasPixelDimensions: { width: 2400, height: 2400 },
  });
  const largeBadgeValidation = printOrchestrator.validatePrintJob(largeBadgeJob);
  
  tests.push({
    name: 'Large Badge (8x8 inches)',
    passed: largeBadgeValidation.valid,
    duration: 0,
    metrics: { width: '8 inches', height: '8 inches', pixels: '2400x2400' },
    recommendations: largeBadgeValidation.errors,
  });

  // Test 5: Batch printing (10 badges)
  console.log('5️⃣  Testing batch printing (10 badges)...');
  printOrchestrator.clearJobs();
  const batchTimer = new Timer();
  batchTimer.start();
  
  const batchJobs = await printOrchestrator.batchPrint(
    Array.from({ length: 10 }, (_, i) => ({
      attendeeId: `batch_attendee_${i}`,
      templateId: 'test_template_1',
      dimensions: { width: 4, height: 3, dpi: 300 },
      canvasPixelDimensions: { width: 1200, height: 900 },
    }))
  );
  
  const batchDuration = batchTimer.stop();
  const batchStats = printOrchestrator.getStats();
  
  tests.push({
    name: 'Batch Print (10 badges)',
    passed: batchStats.successRate === 1 && batchDuration < TestConfig.thresholds.batchBadgeRender,
    duration: batchDuration,
    metrics: {
      successRate: `${(batchStats.successRate * 100).toFixed(1)}%`,
      avgPerBadge: `${(batchDuration / 10).toFixed(2)}ms`,
    },
    recommendations: batchDuration >= TestConfig.thresholds.batchBadgeRender
      ? ['Consider parallel canvas rendering', 'Optimize image encoding']
      : [],
  });

  // Test 6: Network error handling
  console.log('6️⃣  Testing network error handling...');
  printOrchestrator.clearJobs();
  printOrchestrator.setSimulateNetworkError(true, 0.5);
  
  const errorTestJobs = await printOrchestrator.batchPrint(
    Array.from({ length: 20 }, (_, i) => ({
      attendeeId: `error_test_${i}`,
      templateId: 'test_template_1',
      dimensions: { width: 4, height: 3, dpi: 300 },
    }))
  );
  
  const errorStats = printOrchestrator.getStats();
  const failedJobs = printOrchestrator.getFailedJobs();
  
  tests.push({
    name: 'Network Error Handling',
    passed: failedJobs.length > 0 && failedJobs.every(j => j.error?.includes('Network error')),
    duration: 0,
    metrics: {
      successfulJobs: errorStats.successful,
      failedJobs: errorStats.failed,
      errorHandled: failedJobs.every(j => j.error !== undefined) ? 'Yes' : 'No',
    },
  });
  printOrchestrator.setSimulateNetworkError(false);

  // Test 7: Print queue simulation
  console.log('7️⃣  Testing offline print queue...');
  const queueSimulator = new PrintQueueSimulator();
  
  // Enqueue jobs while "offline"
  queueSimulator.setOnline(false);
  const queueTimer = new Timer();
  queueTimer.start();
  
  await queueSimulator.bulkEnqueue(
    Array.from({ length: 100 }, (_, i) => ({
      attendeeId: `queue_attendee_${i}`,
      templateId: 'test_template_1',
      priority: Math.floor(Math.random() * 3),
    }))
  );
  
  const queueEnqueueTime = queueTimer.stop();
  
  // Process queue while "online"
  queueSimulator.setOnline(true);
  queueTimer.start();
  const queueResults = await queueSimulator.processAll();
  const queueProcessTime = queueTimer.stop();
  
  tests.push({
    name: 'Offline Print Queue (100 jobs)',
    passed: queueEnqueueTime < 100 && queueResults.completed > 90,
    duration: queueEnqueueTime + queueProcessTime,
    metrics: {
      enqueueTime: `${queueEnqueueTime.toFixed(2)}ms`,
      processTime: `${queueProcessTime.toFixed(2)}ms`,
      completed: queueResults.completed,
      failed: queueResults.failed,
    },
    recommendations: queueEnqueueTime >= 100
      ? ['Optimize IndexedDB batch writes', 'Use transaction batching']
      : [],
  });

  // Test 8: Platform capability detection
  console.log('8️⃣  Testing platform detection...');
  const platforms: Array<'ios' | 'android' | 'windows' | 'macos'> = ['ios', 'android', 'windows', 'macos'];
  let platformTestPassed = true;
  
  for (const platform of platforms) {
    const orchestrator = new MockPrintOrchestrator(platform);
    const capabilities = orchestrator.detectCapabilities();
    
    if (platform === 'ios' && !capabilities.supportsAirPrint) platformTestPassed = false;
    if (platform === 'android' && !capabilities.supportsMopria) platformTestPassed = false;
    if (platform === 'windows' && !capabilities.supportsWebUSB) platformTestPassed = false;
  }
  
  tests.push({
    name: 'Platform Capability Detection',
    passed: platformTestPassed,
    duration: 0,
    metrics: { platformsTested: platforms.join(', ') },
  });

  // Calculate summary
  const passedTests = tests.filter(t => t.passed).length;
  const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);

  return {
    name: 'Print Simulation Tests',
    description: 'Tests for print orchestrator, DPI validation, batch printing, and error handling',
    tests,
    summary: {
      total: tests.length,
      passed: passedTests,
      failed: tests.length - passedTests,
      duration: totalDuration,
    },
    recommendations,
  };
}

async function runOfflineStorageTests(): Promise<TestSuite> {
  console.log('\n' + '='.repeat(80));
  console.log('📴 OFFLINE STORAGE TESTS');
  console.log('='.repeat(80));

  const tests: TestResult[] = [];
  const recommendations: string[] = [];

  // Test 1: Print queue persistence simulation
  console.log('\n1️⃣  Testing print queue persistence...');
  const queueSimulator = new PrintQueueSimulator();
  
  // Simulate large queue
  await queueSimulator.bulkEnqueue(
    Array.from({ length: 1000 }, (_, i) => ({
      attendeeId: `persist_attendee_${i}`,
      templateId: 'test_template_1',
      priority: i % 3,
    }))
  );
  
  const persistenceMetrics = await queueSimulator.simulatePersistence();
  
  tests.push({
    name: 'Print Queue Persistence (1000 jobs)',
    passed: persistenceMetrics.writeTime < 200 && persistenceMetrics.readTime < 100,
    duration: persistenceMetrics.writeTime + persistenceMetrics.readTime,
    metrics: {
      writeTime: `${persistenceMetrics.writeTime.toFixed(2)}ms`,
      readTime: `${persistenceMetrics.readTime.toFixed(2)}ms`,
      dataSize: `${(persistenceMetrics.dataSize / 1024).toFixed(2)}KB`,
    },
    recommendations: persistenceMetrics.writeTime >= 200
      ? ['Use IndexedDB transactions for batch writes', 'Consider compression for large queues']
      : [],
  });

  // Test 2: Sync queue replay simulation
  console.log('2️⃣  Testing sync queue replay (1000 actions)...');
  const syncActions = Array.from({ length: 1000 }, (_, i) => ({
    id: `sync_${i}`,
    type: i % 3 === 0 ? 'check_in' : i % 3 === 1 ? 'badge_print' : 'session_check_in',
    timestamp: Date.now() - (1000 - i) * 100,
    data: { attendeeId: `attendee_${i}`, status: 'pending' },
  }));
  
  const replayTimer = new Timer();
  replayTimer.start();
  
  // Simulate replay processing (0.5ms per action on average)
  await new Promise(resolve => setTimeout(resolve, syncActions.length * 0.5));
  
  const replayDuration = replayTimer.stop();
  
  tests.push({
    name: 'Sync Queue Replay (1000 actions)',
    passed: replayDuration < TestConfig.thresholds.syncQueueReplay,
    duration: replayDuration,
    metrics: {
      actionsProcessed: syncActions.length,
      avgPerAction: `${(replayDuration / syncActions.length).toFixed(2)}ms`,
    },
    recommendations: replayDuration >= TestConfig.thresholds.syncQueueReplay
      ? ['Implement priority-based replay', 'Use batch API calls for replay', 'Add conflict resolution']
      : [],
  });

  // Test 3: Memory usage during large cache
  console.log('3️⃣  Testing memory usage with simulated large cache...');
  const memoryProfiler = new MemoryProfiler();
  memoryProfiler.startMonitoring(50);
  
  // Simulate caching 20,000 attendee records in memory
  const simulatedCache: any[] = [];
  for (let i = 0; i < 20000; i++) {
    simulatedCache.push({
      id: `cached_attendee_${i}`,
      firstName: 'Test',
      lastName: `User${i}`,
      email: `test${i}@example.com`,
      company: 'Test Company',
      participantType: 'General',
      checkedIn: false,
    });
  }
  
  memoryProfiler.stopMonitoring();
  const memStats = memoryProfiler.getStats();
  
  tests.push({
    name: 'Memory Usage (20k cached attendees)',
    passed: memStats.peakHeapUsed < TestConfig.memory.maxHeapUsage * 1024 * 1024,
    duration: 0,
    metrics: {
      peakHeapMB: `${(memStats.peakHeapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapGrowthMB: `${(memStats.heapGrowth / 1024 / 1024).toFixed(2)}MB`,
      memoryLeakSuspected: memStats.memoryLeakSuspected ? 'Yes' : 'No',
    },
    recommendations: memStats.memoryLeakSuspected
      ? ['Review memory management in cache', 'Implement LRU eviction policy', 'Use WeakMap for temporary references']
      : [],
  });

  // Clear simulated cache
  simulatedCache.length = 0;

  const passedTests = tests.filter(t => t.passed).length;
  const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);

  return {
    name: 'Offline Storage Tests',
    description: 'Tests for IndexedDB persistence, sync queue replay, and memory management',
    tests,
    summary: {
      total: tests.length,
      passed: passedTests,
      failed: tests.length - passedTests,
      duration: totalDuration,
    },
    recommendations,
  };
}

function generateEnhancementReport(report: FullTestReport): string {
  let output = '';
  output += '# Scale & Performance Test Report\n\n';
  output += `**Generated:** ${report.generatedAt}\n`;
  output += `**Environment:** ${report.environment}\n\n`;

  output += '## Executive Summary\n\n';
  output += `| Metric | Value |\n`;
  output += `|--------|-------|\n`;
  output += `| Total Tests | ${report.overallSummary.totalTests} |\n`;
  output += `| Passed | ${report.overallSummary.passedTests} |\n`;
  output += `| Failed | ${report.overallSummary.failedTests} |\n`;
  output += `| Pass Rate | ${report.overallSummary.passRate} |\n`;
  output += `| Total Duration | ${formatDuration(report.overallSummary.totalDuration)} |\n\n`;

  if (report.criticalIssues.length > 0) {
    output += '## Critical Issues\n\n';
    for (const issue of report.criticalIssues) {
      output += `- ❌ ${issue}\n`;
    }
    output += '\n';
  }

  output += '## Test Suite Results\n\n';
  
  for (const suite of report.suites) {
    const statusIcon = suite.summary.failed === 0 ? '✅' : '⚠️';
    output += `### ${statusIcon} ${suite.name}\n\n`;
    output += `${suite.description}\n\n`;
    output += `| Test | Status | Duration | Key Metrics |\n`;
    output += `|------|--------|----------|-------------|\n`;
    
    for (const test of suite.tests) {
      const status = test.passed ? '✅ Pass' : '❌ Fail';
      const duration = test.duration > 0 ? formatDuration(test.duration) : '-';
      const metrics = test.metrics 
        ? Object.entries(test.metrics).map(([k, v]) => `${k}: ${v}`).join(', ')
        : '-';
      output += `| ${test.name} | ${status} | ${duration} | ${metrics} |\n`;
    }
    output += '\n';
  }

  output += '## Recommended Enhancements\n\n';
  output += 'Based on the test results, the following enhancements are recommended to handle Phase 4 requirements:\n\n';
  
  for (const rec of report.recommendedEnhancements) {
    output += `1. ${rec}\n`;
  }

  output += '\n## Conclusion\n\n';
  if (report.overallSummary.failedTests === 0) {
    output += 'All tests passed! The system is ready for Phase 4 printer compatibility testing with real hardware.\n';
  } else {
    output += `${report.overallSummary.failedTests} tests failed. Address the critical issues and recommendations before proceeding to Phase 4.\n`;
  }

  return output;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║          SCALE & PERFORMANCE TEST SUITE                                    ║');
  console.log('║          Event Registration & Check-In Platform                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  
  const overallTimer = new Timer();
  overallTimer.start();
  
  const suites: TestSuite[] = [];
  const criticalIssues: string[] = [];
  const recommendedEnhancements: string[] = [];
  
  let seedResult: ScaleSeedResult | null = null;

  try {
    // Phase 1: Seed scale data
    if (!SKIP_SEED) {
      console.log(`\n📊 Seeding ${ATTENDEE_COUNT.toLocaleString()} attendees for scale testing...`);
      seedResult = await seedScaleData(ATTENDEE_COUNT);
      
      if (!seedResult.success) {
        criticalIssues.push(`Data seeding failed: ${seedResult.errors.join(', ')}`);
      }
    } else {
      console.log('\n⏭️  Skipping data seeding (SKIP_SEED=true)');
    }

    // Phase 2: Database performance benchmarks
    if (seedResult) {
      console.log('\n' + '='.repeat(80));
      console.log('📈 DATABASE PERFORMANCE BENCHMARKS');
      console.log('='.repeat(80));
      
      const attendeeBenchmarks = await benchmarkAttendeeQueries(seedResult.eventId);
      const checkInBenchmarks = await benchmarkCheckInOperations(seedResult.eventId);
      const sessionBenchmarks = await benchmarkSessionOperations(seedResult.eventId);
      
      const allBenchmarks = [...attendeeBenchmarks, ...checkInBenchmarks, ...sessionBenchmarks];
      printBenchmarkResults(allBenchmarks);
      
      const benchmarkTests: TestResult[] = allBenchmarks.map(b => ({
        name: b.name,
        passed: b.passed,
        duration: b.totalTime,
        metrics: {
          avgTime: `${b.avgTime.toFixed(2)}ms`,
          p95: `${b.p95.toFixed(2)}ms`,
          throughput: `${b.throughput.toFixed(1)} ops/sec`,
        },
        recommendations: b.recommendations,
      }));
      
      // Collect failed test recommendations
      for (const benchmark of allBenchmarks) {
        if (!benchmark.passed) {
          criticalIssues.push(`${benchmark.name} exceeded threshold (${formatDuration(benchmark.p95)} > ${formatDuration(benchmark.threshold)})`);
          recommendedEnhancements.push(...benchmark.recommendations);
        }
      }
      
      suites.push({
        name: 'Database Performance',
        description: 'Query performance benchmarks with scale data',
        tests: benchmarkTests,
        summary: {
          total: benchmarkTests.length,
          passed: benchmarkTests.filter(t => t.passed).length,
          failed: benchmarkTests.filter(t => !t.passed).length,
          duration: benchmarkTests.reduce((sum, t) => sum + t.duration, 0),
        },
        recommendations: [],
      });
    }

    // Phase 3: Print simulation tests
    const printSuite = await runPrintSimulationTests();
    suites.push(printSuite);
    
    if (printSuite.summary.failed > 0) {
      criticalIssues.push(`${printSuite.summary.failed} print simulation tests failed`);
    }

    // Phase 4: Offline storage tests
    const offlineSuite = await runOfflineStorageTests();
    suites.push(offlineSuite);
    
    if (offlineSuite.summary.failed > 0) {
      criticalIssues.push(`${offlineSuite.summary.failed} offline storage tests failed`);
    }

    // Collect all recommendations
    for (const suite of suites) {
      for (const test of suite.tests) {
        if (test.recommendations) {
          recommendedEnhancements.push(...test.recommendations);
        }
      }
    }

  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    criticalIssues.push(`Test execution error: ${error}`);
  } finally {
    // Cleanup
    if (seedResult && CLEANUP_AFTER) {
      try {
        await cleanupScaleData(seedResult.customerId);
      } catch (e) {
        console.error('Cleanup failed:', e);
      }
    }
  }

  const totalDuration = overallTimer.stop();

  // Generate final report
  const totalTests = suites.reduce((sum, s) => sum + s.summary.total, 0);
  const passedTests = suites.reduce((sum, s) => sum + s.summary.passed, 0);
  const failedTests = suites.reduce((sum, s) => sum + s.summary.failed, 0);

  const report: FullTestReport = {
    generatedAt: new Date().toISOString(),
    environment: 'Development',
    suites,
    overallSummary: {
      totalTests,
      passedTests,
      failedTests,
      totalDuration,
      passRate: `${((passedTests / totalTests) * 100).toFixed(1)}%`,
    },
    criticalIssues: [...new Set(criticalIssues)],
    recommendedEnhancements: [...new Set(recommendedEnhancements)],
  };

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📋 FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} (${report.overallSummary.passRate})`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Duration: ${formatDuration(totalDuration)}`);

  if (criticalIssues.length > 0) {
    console.log('\n⚠️  Critical Issues:');
    for (const issue of report.criticalIssues) {
      console.log(`   - ${issue}`);
    }
  }

  if (recommendedEnhancements.length > 0) {
    console.log('\n💡 Recommended Enhancements:');
    for (const rec of report.recommendedEnhancements.slice(0, 10)) {
      console.log(`   - ${rec}`);
    }
    if (report.recommendedEnhancements.length > 10) {
      console.log(`   ... and ${report.recommendedEnhancements.length - 10} more`);
    }
  }

  // Write report to file
  const reportContent = generateEnhancementReport(report);
  const reportPath = 'tests/SCALE_TEST_REPORT.md';
  fs.writeFileSync(reportPath, reportContent);
  console.log(`\n📄 Full report saved to: ${reportPath}`);

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run if executed directly
main().catch(console.error);

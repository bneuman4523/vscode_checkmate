/**
 * Test Configuration
 * Central configuration for all automated tests
 */

export const TestConfig = {
  // Scale testing parameters
  scale: {
    attendees: 20000,
    sessionsPerEvent: 20,
    registrationsPerAttendee: 20,
    batchSize: 1000,
    concurrentOperations: 50,
  },

  // Performance thresholds (in milliseconds)
  // Note: Thresholds account for network latency to hosted Neon PostgreSQL
  thresholds: {
    // Database operations (adjusted for remote database latency)
    singleCheckIn: 100, // Single check-in should complete in <100ms
    batchCheckIn: 500, // 50 concurrent check-ins should complete in <500ms
    attendeeQuery: 75, // Single attendee lookup (includes network RTT)
    attendeeListQuery: 200, // List with pagination
    sessionQuery: 75, // Session lookup (includes network RTT)
    sessionRegistrationCount: 150, // Count queries on large tables
    
    // Print operations
    singleBadgeRender: 200, // Canvas render at 300 DPI
    batchBadgeRender: 2000, // 10 badges in sequence
    printQueuePersist: 50, // Save to print queue
    
    // Offline operations
    indexedDBWrite: 20, // Single record write
    indexedDBBulkWrite: 1000, // 1000 records
    syncQueueReplay: 2000, // Replay 1000 queued actions
  },

  // Memory limits (in MB)
  memory: {
    maxHeapUsage: 512, // Warn if heap exceeds this
    maxIndexedDBSize: 100, // Max storage for offline cache
  },

  // Test database (separate from main development DB)
  database: {
    useTestPrefix: true,
    cleanupAfterTests: true,
  },
};

export type TestResult = {
  name: string;
  passed: boolean;
  duration: number;
  metrics?: Record<string, number | string>;
  error?: string;
  recommendations?: string[];
};

export type TestSuite = {
  name: string;
  description: string;
  tests: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
  };
  recommendations: string[];
};

export type FullTestReport = {
  generatedAt: string;
  environment: string;
  suites: TestSuite[];
  overallSummary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    totalDuration: number;
    passRate: string;
  };
  criticalIssues: string[];
  recommendedEnhancements: string[];
};

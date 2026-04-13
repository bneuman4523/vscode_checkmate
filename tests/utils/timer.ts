/**
 * Timer Utility
 * High-precision timing for performance tests
 */

export class Timer {
  private startTime: bigint = 0n;
  private endTime: bigint = 0n;

  start(): void {
    this.startTime = process.hrtime.bigint();
  }

  stop(): number {
    this.endTime = process.hrtime.bigint();
    return this.elapsed();
  }

  elapsed(): number {
    const diff = this.endTime - this.startTime;
    return Number(diff) / 1_000_000; // Convert nanoseconds to milliseconds
  }

  static async measure<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const timer = new Timer();
    timer.start();
    const result = await fn();
    const duration = timer.stop();
    return { result, duration };
  }

  static measureSync<T>(fn: () => T): { result: T; duration: number } {
    const timer = new Timer();
    timer.start();
    const result = fn();
    const duration = timer.stop();
    return { result, duration };
  }
}

export async function runWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

export function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

export function calculatePercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function calculateStats(values: number[]): {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    avg: sum / values.length || 0,
    p50: calculatePercentile(sorted, 50),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99),
  };
}

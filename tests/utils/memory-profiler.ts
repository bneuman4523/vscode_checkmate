/**
 * Memory Profiler Utility
 * Monitors memory usage during tests
 */

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export class MemoryProfiler {
  private snapshots: MemorySnapshot[] = [];
  private intervalId: NodeJS.Timeout | null = null;

  startMonitoring(intervalMs: number = 100): void {
    this.snapshots = [];
    this.takeSnapshot();
    this.intervalId = setInterval(() => this.takeSnapshot(), intervalMs);
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  takeSnapshot(): MemorySnapshot {
    const memory = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      rss: memory.rss,
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  getStats(): {
    peakHeapUsed: number;
    peakRss: number;
    avgHeapUsed: number;
    heapGrowth: number;
    memoryLeakSuspected: boolean;
  } {
    if (this.snapshots.length === 0) {
      return {
        peakHeapUsed: 0,
        peakRss: 0,
        avgHeapUsed: 0,
        heapGrowth: 0,
        memoryLeakSuspected: false,
      };
    }

    const heapUsedValues = this.snapshots.map(s => s.heapUsed);
    const rssValues = this.snapshots.map(s => s.rss);

    const peakHeapUsed = Math.max(...heapUsedValues);
    const peakRss = Math.max(...rssValues);
    const avgHeapUsed = heapUsedValues.reduce((a, b) => a + b, 0) / heapUsedValues.length;
    
    // Calculate heap growth (first vs last 10% of snapshots)
    const tenPercent = Math.max(1, Math.floor(this.snapshots.length * 0.1));
    const firstAvg = heapUsedValues.slice(0, tenPercent).reduce((a, b) => a + b, 0) / tenPercent;
    const lastAvg = heapUsedValues.slice(-tenPercent).reduce((a, b) => a + b, 0) / tenPercent;
    const heapGrowth = lastAvg - firstAvg;

    // Suspect memory leak if heap grew more than 50% and didn't stabilize
    const memoryLeakSuspected = heapGrowth > firstAvg * 0.5;

    return {
      peakHeapUsed,
      peakRss,
      avgHeapUsed,
      heapGrowth,
      memoryLeakSuspected,
    };
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  printReport(): void {
    const stats = this.getStats();
    console.log('\n=== Memory Profile Report ===');
    console.log(`Peak Heap Used: ${this.formatBytes(stats.peakHeapUsed)}`);
    console.log(`Peak RSS: ${this.formatBytes(stats.peakRss)}`);
    console.log(`Average Heap Used: ${this.formatBytes(stats.avgHeapUsed)}`);
    console.log(`Heap Growth: ${this.formatBytes(stats.heapGrowth)}`);
    if (stats.memoryLeakSuspected) {
      console.log('⚠️  Potential memory leak detected!');
    }
  }
}

export function forceGC(): void {
  if (global.gc) {
    global.gc();
  }
}

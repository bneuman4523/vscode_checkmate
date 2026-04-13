/**
 * Print Queue Simulator
 * Simulates IndexedDB-based offline print queue behavior
 */

export interface QueuedPrintJob {
  id: string;
  attendeeId: string;
  templateId: string;
  priority: number;
  createdAt: number;
  attempts: number;
  lastAttempt?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export class PrintQueueSimulator {
  private queue: QueuedPrintJob[] = [];
  private maxRetries: number = 3;
  private isOnline: boolean = true;

  setOnline(online: boolean): void {
    this.isOnline = online;
  }

  async enqueue(job: Omit<QueuedPrintJob, 'id' | 'createdAt' | 'attempts' | 'status'>): Promise<QueuedPrintJob> {
    const queuedJob: QueuedPrintJob = {
      ...job,
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
    };

    this.queue.push(queuedJob);
    this.sortQueue();

    return queuedJob;
  }

  async bulkEnqueue(jobs: Array<Omit<QueuedPrintJob, 'id' | 'createdAt' | 'attempts' | 'status'>>): Promise<QueuedPrintJob[]> {
    const results = await Promise.all(jobs.map(job => this.enqueue(job)));
    return results;
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // Higher priority first, then older jobs first
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });
  }

  async processNext(): Promise<QueuedPrintJob | null> {
    const pendingJob = this.queue.find(j => j.status === 'pending');
    if (!pendingJob) return null;

    pendingJob.status = 'processing';
    pendingJob.attempts++;
    pendingJob.lastAttempt = Date.now();

    if (!this.isOnline) {
      pendingJob.status = 'pending'; // Stay pending when offline
      pendingJob.error = 'Offline - will retry when online';
      return pendingJob;
    }

    // Simulate processing (in real scenario, this would call print orchestrator)
    await new Promise(resolve => setTimeout(resolve, 10));

    // Simulate 95% success rate
    if (Math.random() < 0.95) {
      pendingJob.status = 'completed';
    } else if (pendingJob.attempts >= this.maxRetries) {
      pendingJob.status = 'failed';
      pendingJob.error = 'Max retries exceeded';
    } else {
      pendingJob.status = 'pending'; // Will retry
      pendingJob.error = 'Temporary failure - will retry';
    }

    return pendingJob;
  }

  async processAll(): Promise<{ completed: number; failed: number; pending: number }> {
    // Keep processing until no more pending jobs
    let result = await this.processNext();
    while (result !== null) {
      // Continue if there are still pending jobs to process
      if (this.queue.some(j => j.status === 'pending')) {
        result = await this.processNext();
      } else {
        break;
      }
    }

    return this.getStats();
  }

  getStats(): { completed: number; failed: number; pending: number } {
    return {
      completed: this.queue.filter(j => j.status === 'completed').length,
      failed: this.queue.filter(j => j.status === 'failed').length,
      pending: this.queue.filter(j => j.status === 'pending').length,
    };
  }

  getQueue(): QueuedPrintJob[] {
    return [...this.queue];
  }

  getPendingJobs(): QueuedPrintJob[] {
    return this.queue.filter(j => j.status === 'pending');
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clearQueue(): void {
    this.queue = [];
  }

  // Simulate IndexedDB persistence metrics
  async simulatePersistence(): Promise<{
    writeTime: number;
    readTime: number;
    dataSize: number;
  }> {
    const startWrite = Date.now();
    // Simulate serialization delay (0.01ms per job)
    await new Promise(resolve => setTimeout(resolve, this.queue.length * 0.01));
    const writeTime = Date.now() - startWrite;

    // Estimate data size (roughly 500 bytes per job)
    const dataSize = this.queue.length * 500;

    const startRead = Date.now();
    // Simulate deserialization delay
    await new Promise(resolve => setTimeout(resolve, this.queue.length * 0.005));
    const readTime = Date.now() - startRead;

    return { writeTime, readTime, dataSize };
  }
}
